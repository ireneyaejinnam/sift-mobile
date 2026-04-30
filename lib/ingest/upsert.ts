import { createClient } from '@supabase/supabase-js';
import { SiftEvent, EventSession } from './schema';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function upsertEvents(events: SiftEvent[]): Promise<{ inserted: number; errors: number }> {
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < events.length; i += 50) {
    const batch = events.slice(i, i + 50);

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

  return { inserted, errors };
}
