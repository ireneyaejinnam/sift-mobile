/**
 * Import a JSON file of events into test_events + test_event_sessions.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/import-test-data.ts <path-to-json>
 *
 * Example:
 *   npx tsx --env-file=.env scripts/import-test-data.ts ~/Downloads/nycforfree_april_events_verified.json
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

interface SessionInput {
  date: string;
  time?: string;
  venue_name?: string;
  address?: string;
  borough?: string;
  price_min?: number;
  price_max?: number;
}

interface EventInput {
  source_id: string;
  title: string;
  category: string;
  description?: string;
  start_date: string;
  end_date?: string;
  venue_name?: string;
  address?: string;
  borough?: string;
  price_min?: number;
  price_max?: number;
  is_free: boolean;
  event_url?: string;
  ticket_url?: string;
  image_url?: string;
  tags?: string[];
  sessions?: SessionInput[];
}

async function main() {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf('--source');
  const source = sourceIdx !== -1 ? args[sourceIdx + 1] : 'test';
  const filePath = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--source');

  if (!filePath) {
    console.error('Usage: npx tsx --env-file=.env scripts/import-test-data.ts <path-to-json> [--source <name>]');
    console.error('  --source  table prefix, e.g. "nycforfree" → nycforfree_events / nycforfree_event_sessions');
    console.error('            defaults to "test" → test_events / test_event_sessions');
    process.exit(1);
  }

  const EVENTS_TABLE   = `${source}_events`;
  const SESSIONS_TABLE = `${source}_event_sessions`;
  console.log(`Tables: ${EVENTS_TABLE} + ${SESSIONS_TABLE}`);

  const resolved = path.resolve(filePath.replace(/^~/, process.env.HOME ?? ''));
  const raw = fs.readFileSync(resolved, 'utf-8');
  const allEvents: EventInput[] = JSON.parse(raw);

  // Filter out fully expired events (all sessions in the past, or start_date in the past with no sessions)
  const today = new Date().toISOString().split('T')[0];
  const events = allEvents.filter(ev => {
    if (ev.sessions?.length) {
      return ev.sessions.some(s => s.date >= today);
    }
    const endDate = ev.end_date ?? ev.start_date;
    return endDate >= today;
  });

  const pruned = allEvents.length - events.length;
  console.log(`Loaded ${allEvents.length} events from ${resolved} (${pruned} expired, ${events.length} to import)`);

  // Clear existing data before importing
  console.log(`Clearing existing data in ${EVENTS_TABLE}...`);
  await supabase.from(SESSIONS_TABLE).delete().neq('event_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from(EVENTS_TABLE).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('Cleared.');

  let inserted = 0;
  let errors = 0;

  for (const ev of events) {
    // ── Upsert event ──────────────────────────────────────
    const { data: upserted, error: evErr } = await supabase
      .from(EVENTS_TABLE)
      .upsert({
        source:      source,
        source_id:   ev.source_id,
        title:       ev.title,
        description: ev.description,
        category:    ev.category,
        start_date:  ev.start_date,
        end_date:    ev.end_date ?? null,
        venue_name:  ev.venue_name,
        address:     ev.address,
        borough:     ev.borough,
        price_min:   ev.price_min ?? null,
        price_max:   ev.price_max ?? null,
        is_free:     ev.is_free,
        event_url:   ev.event_url,
        ticket_url:  ev.ticket_url ?? null,
        image_url:   ev.image_url ?? null,
        tags:        ev.tags ?? [],
      }, { onConflict: 'source,source_id' })
      .select('id')
      .single();

    if (evErr || !upserted) {
      console.error(`  ✗ ${ev.source_id}: ${evErr?.message}`);
      errors++;
      continue;
    }

    const eventId = upserted.id as string;

    // ── Build sessions ────────────────────────────────────
    // For events without explicit sessions, use start_date as the session date.
    // If start_date is in the past but end_date is in the future (ongoing event),
    // use today instead so the event remains discoverable by date filters.
    let fallbackDate = ev.start_date;
    if (!ev.sessions?.length && ev.start_date < today && ev.end_date && ev.end_date >= today) {
      fallbackDate = today;
    }

    const sessions: SessionInput[] = ev.sessions?.length
      ? ev.sessions
      : [{
          date:       fallbackDate,
          venue_name: ev.venue_name,
          address:    ev.address,
          borough:    ev.borough,
          price_min:  ev.price_min,
          price_max:  ev.price_max,
        }];

    const seen = new Set<string>();
    const sessionRows = sessions
      .filter(s => !!s.date)
      .map(s => ({
        event_id:   eventId,
        date:       s.date.slice(0, 10),
        time:       s.time ?? '',
        venue_name: s.venue_name ?? null,
        address:    s.address ?? null,
        borough:    s.borough ?? null,
        price_min:  s.price_min ?? null,
        price_max:  s.price_max ?? null,
      }))
      .filter(s => {
        const key = `${s.date}::${s.time}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    if (sessionRows.length > 0) {
      const { error: sessErr } = await supabase
        .from(SESSIONS_TABLE)
        .upsert(sessionRows, { onConflict: 'event_id,date,time' });

      if (sessErr) {
        console.error(`  ✗ sessions for ${ev.source_id}: ${sessErr.message}`);
        errors++;
        continue;
      }
    }

    console.log(`  ✓ ${ev.title} (${sessionRows.length} session${sessionRows.length === 1 ? '' : 's'})`);
    inserted++;
  }

  console.log(`\nDone. ${inserted} inserted, ${errors} errors.`);
}

main().catch(console.error);
