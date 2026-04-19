/**
 * Cron: ingest-score
 * Schedule: 25 7 * * * (7:25 AM UTC, after postprocess completes)
 *
 * Steps:
 *   1. Apply event_overrides (suppress / relabel only)
 *   2. Update social_signal counts from event_social_links
 *   3. HEAD-check Eventbrite links and suppress dead ones
 *   4. Claude vibe check on newly ingested events (requires migration 003)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export default async function handler(req: any, res: any) {
  const authHeader = req.headers['authorization'] as string | undefined;
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const start = Date.now();
  console.log('[Score] Starting...');

  await applyOverrides();
  await updateSocialSignals();
  await validateEventbriteLinks();
  await vibeCheckNewEvents();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Score] Done in ${elapsed}s`);

  return res.status(200).json({ ok: true, elapsed });
}

// Apply editorial overrides: suppress and relabel only.
async function applyOverrides() {
  const { data: overrides } = await supabase
    .from('event_overrides')
    .select('event_id, override_type, override_data');

  if (!overrides?.length) return;

  for (const o of overrides) {
    if (o.override_type === 'suppress') {
      await supabase.from('events')
        .update({ is_suppressed: true })
        .eq('id', o.event_id);
    } else if (o.override_type === 'relabel' && o.override_data) {
      await supabase.from('events')
        .update(o.override_data)
        .eq('id', o.event_id);
    }
  }
}

// Update social_signal = number of linked social posts per event.
async function updateSocialSignals() {
  const { data } = await supabase
    .from('event_social_links')
    .select('event_id');

  if (!data?.length) return;

  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
  }

  for (const [eventId, count] of Object.entries(counts)) {
    await supabase.from('events')
      .update({ social_signal: count })
      .eq('id', eventId);
  }
}

// HEAD-check Eventbrite links and suppress 404/410 events.
async function validateEventbriteLinks() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('events')
    .select('id, ticket_url')
    .eq('source', 'eventbrite')
    .eq('is_suppressed', false)
    .gte('start_date', today)
    .limit(50);

  for (const event of data ?? []) {
    if (!event.ticket_url) continue;
    try {
      const res = await fetch(event.ticket_url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      });
      if (res.status === 404 || res.status === 410) {
        await supabase.from('events').update({ is_suppressed: true }).eq('id', event.id);
      }
    } catch {
      // Timeout — leave as-is
    }
  }
}

// Claude vibe check on newly ingested events (requires migration 003_vibe_taste.sql).
// Processes up to 200 events per run in parallel batches of 10.
// Suppresses score ≤ 4 to match the client-side vibe floor of 5.
async function vibeCheckNewEvents() {
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const { data: events } = await supabase
    .from('events')
    .select('id, title, description, venue_name, neighborhood, category, source')
    .eq('vibe_checked', false)
    .eq('is_suppressed', false)
    .gte('created_at', cutoff)
    .limit(200);

  if (!events?.length) {
    console.log('[VibeCheck] No new events to check');
    return;
  }

  console.log(`[VibeCheck] Checking ${events.length} events...`);

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const BATCH_SIZE = 10;
  let suppressed = 0;

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (event) => {
      const prompt = `You are the editorial filter for Sift, a NYC event discovery app. Your target user is an 18-35 year old professional living in NYC. Think: someone who reads The Infatuation, has a Resy account, follows @whatisnewyork, and texts their group chat about things to do this weekend.

Here's who they are — use this to judge whether an event is relevant:

FITNESS: Barry's, SoulCycle, Solidcore, CorePower, Equinox, pilates studios, VITAL Climbing, Brooklyn Boulders, The Cliffs. Social run clubs: Bandit Running, New York Flyers, November Project, Tracksmith. Padel at Padel Haus. NOT rec center fitness classes, Zumba, bodyweight blast, senior cardio.

SHOPPING & BRANDS: Kith, Aimé Leon Dore, Stüssy, Arc'teryx, COS, & Other Stories, Oak + Fort, Aritzia, Sézane, Gentle Monster. Sample sales from these brands = instant interest. SoHo boutiques, Williamsburg vintage shops, Artists & Fleas, Brooklyn Flea, Chelsea Flea. NOT generic clothing sales, no-name brands, outlet events.

FOOD & DRINK: Blank Street, Blue Bottle, Devoción, Sey Coffee. Restaurants they try to book on Resy: Carbone, Don Angie, Torrisi, Semma, Jean's, Bistrot Ha. Brunch at Sunday in Brooklyn, Buvette, Ursula. Natural wine bars: Ruffian, Stars, Moonflower, Lei. Cocktail bars: Bar Snack, Superbueno, Attaboy, Oddball, Paul's Baby Grand, Time Again, Bar Belly. Speakeasies: Little Branch, Peachy's, Garret West. NOT chain restaurants, tourist dining, generic happy hours.

MUSIC & NIGHTLIFE: Sabrina Carpenter, Fred Again, Charli XCX, Tyler the Creator, Bad Bunny, Khruangbin, Lorde, Kali Uchis, Blood Orange. Venues: Baby's All Right, Elsewhere, Brooklyn Steel, Terminal 5, Webster Hall, Sultan Room, Rough Trade, Racket, TV Eye, Good Room, Public Records, Avant Gardner, Le Poisson Rouge, Joe's Pub. MSG/Barclays for the right headliner. Paul's Casablanca, House of Yes, Joyface, Jewelbox, Le Dive. NOT "DJ TBD", generic club nights with no identity, tourist nightlife.

CULTURE & ARTS: MoMA, Whitney, Guggenheim, Met, Brooklyn Museum, New Museum, The Frick, Neue Galerie, The Shed, Fotografiska. Day trips: Dia Beacon, Storm King. Chelsea galleries. Film: Metrograph, Film Forum, IFC Center, Nitehawk, Alamo Drafthouse. Books: McNally Jackson, Strand, Housing Works. Comedy: Comedy Cellar, Gotham, The Stand, Caveat. Theater: off-Broadway, experimental. Talks: 92NY, The Center for Fiction. NOT tourist museums (Madame Tussauds, Ripley's), long-running Broadway tourist shows.

WEEKENDS & POP-UPS: Brooklyn Flea, Smorgasburg, Chelsea Market, Hester Street Fair, Grand Bazaar. Pop-ups from brands they know. Immersive experiences with substance (not tourist traps). Governors Ball, outdoor festivals. NOT pub crawls, scavenger hunts, murder mystery dinners, hop-on-hop-off buses.

Score this event 1-10: "Would this person want to know about this?"

8-10: YES — they'd save it, text their group chat, or post it on their story.
6-7:  PROBABLY — solid event, right vibe, they might go if a friend suggested it.
4-5:  MEH — real event but not something they'd seek out or share.
1-3:  NO — wrong audience entirely. Suppress.

CRITICAL RULES:
- Mainstream ≠ bad. Lady Gaga at MSG = 8-9. Whitney Biennial = 9-10.
- Niche ≠ automatically good. Random open mic at unknown bar = 4.
- Brand/venue/artist recognition matters. Stüssy sample sale = 8. "Clothingline Blowout" = 2.
- The test: "Would they tell their friends about it?"

Event:
Title: ${event.title}
Venue: ${event.venue_name ?? 'unknown'}
Neighborhood: ${event.neighborhood ?? 'unknown'}
Category: ${event.category}
Source: ${event.source}
Description: ${(event.description ?? '').slice(0, 400)}

Return ONLY valid JSON: {"score": <1-10>, "reason": "<10 words max>"}`;

      try {
        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 80,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('No JSON');
        const result = JSON.parse(match[0]);
        const score = Math.round(result.score) as number;

        const update: Record<string, any> = { vibe_score: score, vibe_checked: true };
        if (score <= 4) {
          update.is_suppressed = true;
          suppressed++;
          console.log(`[VibeCheck] Suppressed "${event.title}" (${score}: ${result.reason})`);
        }

        await supabase.from('events').update(update).eq('id', event.id);
      } catch {
        // On error: leave vibe_checked=false so it gets retried next run
        console.log(`[VibeCheck] Error on "${event.title}" — will retry`);
      }
    }));
  }

  console.log(`[VibeCheck] Done — ${suppressed}/${events.length} suppressed`);
}
