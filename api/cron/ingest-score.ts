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
async function vibeCheckNewEvents() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: events } = await supabase
    .from('events')
    .select('id, title, description, venue_name, category, source')
    .eq('vibe_checked', false)
    .eq('is_suppressed', false)
    .gte('created_at', cutoff)
    .limit(50);

  if (!events?.length) return;

  console.log(`[VibeCheck] Checking ${events.length} new events...`);

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  for (const event of events) {
    const prompt = `You are a quality filter for a NYC event discovery app for locals aged 22–40 (Gen Z + Millennials — not tourists, not corporate professionals).

Rate this event 1–10 for quality and demographic fit.

SUPPRESS (1–3): tourist walking tours, boat cruises, networking mixers, job fairs, MLM, webinars, real estate seminars, virtual-only events.
KEEP (4–10): live music of any size, fashion/food pop-ups, art openings, comedy, nightlife, sports, fitness, Broadway, film screenings, classes.

Event:
Title: ${event.title}
Venue: ${event.venue_name ?? 'unknown'}
Category: ${event.category}
Description: ${(event.description ?? '').slice(0, 300)}

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
      const score = result.score as number;

      const update: Record<string, any> = { vibe_score: score, vibe_checked: true };
      if (score <= 3) update.is_suppressed = true;

      await supabase.from('events').update(update).eq('id', event.id);
      if (score <= 3) console.log(`[VibeCheck] Suppressed "${event.title}" (${score}: ${result.reason})`);
    } catch {
      await supabase.from('events').update({ vibe_checked: true }).eq('id', event.id);
    }
  }
}
