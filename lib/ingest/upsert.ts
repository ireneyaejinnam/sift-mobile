import { createClient } from '@supabase/supabase-js';
import { SiftEvent, EventSession } from './schema';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

function normalizeKey(s: string): string {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function dataRichness(ev: SiftEvent): number {
  return (ev.description?.length ?? 0) + (ev.image_url ? 100 : 0) + (ev.ticket_url ? 50 : 0);
}

function timeFromDateTime(value: string): string | undefined {
  return value.match(/[T\s](\d{1,2}:\d{2})/)?.[1];
}

/**
 * Collapse duplicate events (same title + venue, different dates) into
 * one event with multiple sessions before inserting.
 */
function collapseIntoSessions(events: SiftEvent[]): SiftEvent[] {
  const groups = new Map<string, SiftEvent[]>();

  for (const ev of events) {
    const titleKey = normalizeKey(ev.title);
    const venueKey = normalizeKey(ev.venue_name ?? '');
    const key = venueKey
      ? `${titleKey}::venue::${venueKey}`
      : `${titleKey}::source::${ev.source}::${ev.source_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ev);
  }

  const result: SiftEvent[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Pick the richest event as the keeper (keeps its original source_id)
    group.sort((a, b) => dataRichness(b) - dataRichness(a));
    const keeper = { ...group[0] };

    // Collect all scraped sessions, preserving any times provided by scrapers
    const sessionKeys = new Set<string>();
    const sessions: EventSession[] = [];

    for (const ev of group) {
      const eventTime = (ev as SiftEvent & { time?: string }).time ?? timeFromDateTime(ev.start_date);
      const eventSessions: EventSession[] = ev.sessions?.length
        ? ev.sessions
        : [{
            date: ev.start_date.slice(0, 10),
            time: eventTime,
            venue_name: ev.venue_name,
            address: ev.address,
            borough: ev.borough,
            price_min: ev.price_min,
            price_max: ev.price_max,
          }];

      for (const session of eventSessions) {
        const date = session.date?.slice(0, 10);
        if (!date) continue;
        const key = `${date}::${session.time ?? ''}`;
        if (sessionKeys.has(key)) continue;
        sessionKeys.add(key);
        sessions.push(session);
      }
    }

    // Sort sessions by date
    sessions.sort((a, b) => a.date.localeCompare(b.date));

    // Update keeper with date range + sessions
    keeper.start_date = sessions[0].date;
    if (sessions.length > 1) {
      keeper.end_date = sessions[sessions.length - 1].date;
    }
    keeper.sessions = sessions;

    result.push(keeper);
    console.log(`[upsert] Collapsed ${group.length} "${keeper.title}" entries into 1 event + ${sessions.length} sessions`);
  }

  return result;
}

export async function upsertEvents(events: SiftEvent[]): Promise<{ inserted: number; errors: number }> {
  // Collapse same-title same-venue events into one event with multiple sessions
  const collapsed = collapseIntoSessions(events);
  console.log(`[upsert] Collapsed ${events.length} events → ${collapsed.length} unique events`);

  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < collapsed.length; i += 50) {
    const batch = collapsed.slice(i, i + 50);

    // Strip sessions before upserting events table; suppress by default until vibe-checked
    const eventRows = batch.map(({ sessions, ...ev }) => ({ ...ev, is_suppressed: true }));

    const { data: upserted, error } = await supabase
      .from('events')
      .upsert(eventRows, { onConflict: 'source,source_id' })
      .select('id, source, source_id');

    if (error) {
      console.error(`Upsert error at batch ${i}:`, error.message);
      errors += batch.length;
      continue;
    }

    inserted += batch.length;

    // Build a map source+source_id → id for matching sessions
    const idMap = new Map<string, string>();
    for (const row of upserted ?? []) {
      idMap.set(`${row.source}::${row.source_id}`, row.id);
    }

    // Upsert event_sessions
    const sessionRows: {
      event_id: string;
      date: string;
      time?: string;
      venue_name?: string;
      address?: string;
      borough?: string;
      price_min?: number;
      price_max?: number;
    }[] = [];

    for (const ev of batch) {
      const eventId = idMap.get(`${ev.source}::${ev.source_id}`);
      if (!eventId) continue;

      const sessions: EventSession[] = ev.sessions?.length
        ? ev.sessions
        : [{ // single-session fallback
            date: ev.start_date.slice(0, 10),
            venue_name: ev.venue_name,
            address: ev.address,
            borough: ev.borough,
            price_min: ev.price_min,
            price_max: ev.price_max,
          }];

      for (const s of sessions) {
        if (!s.date) continue;
        sessionRows.push({
          event_id: eventId,
          date: s.date.slice(0, 10),
          time: s.time ?? "",
          venue_name: s.venue_name,
          address: s.address,
          borough: s.borough,
          price_min: s.price_min,
          price_max: s.price_max,
        });
      }
    }

    if (sessionRows.length > 0) {
      // Upsert by (event_id, date) — one session per event per date
      const { error: sessErr } = await supabase
        .from('event_sessions')
        .upsert(sessionRows, { onConflict: 'event_id,date,time' });
      if (sessErr) console.error('event_sessions upsert error:', sessErr.message);
    }
  }

  // Retroactive matching: check if private user-contributed events match newly upserted scraper events
  if (inserted > 0) {
    try {
      const { data: privateEvents } = await supabase
        .from('events')
        .select('id, title, start_date, venue_name, contributed_by')
        .eq('source_type', 'user_contributed')
        .eq('publication_status', 'private');

      if (privateEvents && privateEvents.length > 0) {
        const normalize = (s: string) => s
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

        let merged = 0;
        for (const priv of privateEvents) {
          const privTitle = normalize(priv.title);
          const privDate = (priv.start_date ?? '').slice(0, 10);

          // Find matching scraper/AI event — use date range to catch collapsed multi-session events
          const dateStart = new Date(new Date(privDate + 'T12:00:00Z').getTime() - 7 * 86400000).toISOString().split('T')[0];
          const dateEnd = new Date(new Date(privDate + 'T12:00:00Z').getTime() + 7 * 86400000).toISOString().split('T')[0];
          const { data: sessionCandidates } = await supabase
            .from('event_sessions')
            .select('event_id')
            .eq('date', privDate);
          const sessionCandidateIds = [...new Set((sessionCandidates ?? []).map((s) => s.event_id))];
          const datePredicates = [
            `and(start_date.gte.${dateStart},start_date.lte.${dateEnd})`,
            `and(start_date.lte.${privDate},end_date.gte.${privDate})`,
            ...(sessionCandidateIds.length > 0 ? [`id.in.(${sessionCandidateIds.join(',')})`] : []),
          ].join(',');
          const { data: matches } = await supabase
            .from('events')
            .select('id, title, start_date, end_date, venue_name')
            .or(datePredicates)
            .neq('is_suppressed', true)
            .eq('publication_status', 'public')
            .not('source', 'in', '(nyc_tourism,nyc_gov,yelp,meetup,nyc_parks)')
            .or('vibe_score.gte.5,vibe_score.is.null')
            .neq('source_type', 'user_contributed')
            .limit(50);

          const match = (matches ?? []).find((pub) => {
            const pubTitle = normalize(pub.title);
            const words1 = new Set(privTitle.split(' ').filter((w: string) => w.length > 2));
            const words2 = new Set(pubTitle.split(' ').filter((w: string) => w.length > 2));
            if (words1.size === 0 || words2.size === 0) return false;
            const intersection = [...words1].filter((w) => words2.has(w)).length;
            const union = new Set([...words1, ...words2]).size;
            if (intersection / union <= 0.5) return false;

            // If both have venue names, require reasonable venue similarity
            const privVenue = normalize(priv.venue_name ?? '');
            const pubVenue = normalize((pub as any).venue_name ?? '');
            if (privVenue && pubVenue) {
              const vw1 = new Set(privVenue.split(' ').filter((w: string) => w.length > 2));
              const vw2 = new Set(pubVenue.split(' ').filter((w: string) => w.length > 2));
              if (vw1.size > 0 && vw2.size > 0) {
                const vi = [...vw1].filter((w) => vw2.has(w)).length;
                const vu = new Set([...vw1, ...vw2]).size;
                if (vi / vu < 0.3) return false;
              }
            }
            return true;
          });

          if (!match) continue;

          console.log(`[upsert] Retroactive merge: "${priv.title}" → "${match.title}"`);

          // Per-row saved_events migration
          const { data: pSaved } = await supabase.from('saved_events').select('user_id').eq('event_id', priv.id);
          for (const r of pSaved ?? []) {
            const { error } = await supabase.from('saved_events').update({ event_id: match.id }).eq('event_id', priv.id).eq('user_id', r.user_id);
            if (error) await supabase.from('saved_events').delete().eq('event_id', priv.id).eq('user_id', r.user_id);
          }
          // Per-row going_events migration
          const { data: pGoing } = await supabase.from('going_events').select('user_id').eq('event_id', priv.id);
          for (const r of pGoing ?? []) {
            const { error } = await supabase.from('going_events').update({ event_id: match.id }).eq('event_id', priv.id).eq('user_id', r.user_id);
            if (error) await supabase.from('going_events').delete().eq('event_id', priv.id).eq('user_id', r.user_id);
          }
          // Copy ALL contributors from private event to public event (before cascade delete)
          const { data: allContributors } = await supabase
            .from('event_contributors').select('user_id, source').eq('event_id', priv.id);
          for (const c of allContributors ?? []) {
            await supabase.from('event_contributors').upsert(
              { event_id: match.id, user_id: c.user_id, source: c.source },
              { onConflict: 'event_id,user_id' }
            );
          }
          // Also add contributed_by if not already a contributor
          if (priv.contributed_by) {
            await supabase.from('event_contributors').upsert(
              { event_id: match.id, user_id: priv.contributed_by, source: 'retroactive_merge' },
              { onConflict: 'event_id,user_id' }
            );
          }
          await supabase.from('event_social_links').update({ event_id: match.id }).eq('event_id', priv.id);
          // Point social_post_submissions FK refs to public event (preserves URL dedup)
          await supabase.from('social_post_submissions').update({ created_event_id: match.id, match_event_id: match.id }).eq('created_event_id', priv.id);
          await supabase.from('social_post_submissions').update({ match_event_id: match.id }).eq('match_event_id', priv.id);
          const { error: delErr } = await supabase.from('events').delete().eq('id', priv.id);
          if (delErr) console.error(`[upsert] Failed to delete private event ${priv.id}:`, delErr.message);
          merged++;
        }
        if (merged > 0) console.log(`[upsert] Retroactive merge: ${merged} private events merged`);
      }
    } catch (err) {
      console.error('[upsert] Retroactive merge error:', (err as Error).message);
    }
  }

  return { inserted, errors };
}
