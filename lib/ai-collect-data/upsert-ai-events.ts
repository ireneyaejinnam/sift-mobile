/**
 * upsert-ai-events.ts
 *
 * Step 4: Read ai_events.json and upsert into Supabase.
 * Writes to the unified `events` table with source_type='ai_discovery'
 * and `event_sessions` table for sessions.
 *
 * Safe to re-run — upserts on source_id (events) and (event_id, date, time) (sessions).
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { resolveImage } from './fix-images';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const OUTPUT_PATH      = join(__dirname, 'output', 'ai_new_events.json');
const NAME_LIST_PATH   = join(__dirname, 'output', 'ai_new_events_name_list.json');


const VALID_CATEGORIES = new Set([
  'art', 'live_music', 'comedy', 'food', 'outdoors',
  'nightlife', 'popups', 'fitness', 'theater', 'workshops', 'sports',
]);

const VALID_BOROUGHS = new Set([
  'Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Various borough',
]);

function isValidDate(d: string): boolean {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function sanitizeEvent(raw: any): Record<string, any> | null {
  if (!raw.source_id || !raw.title || !raw.start_date || !raw.category) return null;
  if (!isValidDate(raw.start_date)) return null;
  if (!VALID_CATEGORIES.has(raw.category)) return null;

  return {
    source_id:    String(raw.source_id),
    source:       'ai',
    source_type:  'ai_discovery',
    title:        String(raw.title).slice(0, 500),
    category:     raw.category,
    description:  raw.description ? String(raw.description).slice(0, 1000) : null,
    start_date:   raw.start_date,
    end_date:     isValidDate(raw.end_date) ? raw.end_date : null,
    venue_name:   raw.venue_name ?? null,
    address:      raw.address ?? null,
    borough:      VALID_BOROUGHS.has(raw.borough) ? raw.borough : null,
    price_min:    typeof raw.price_min === 'number' ? raw.price_min : 0,
    price_max:    typeof raw.price_max === 'number' ? raw.price_max : null,
    is_free:      raw.is_free === true,
    event_url:    raw.event_url ?? null,
    image_url:    raw.image_url ?? null,
    ticket_url:   raw.ticket_url ?? null,
    tags:         Array.isArray(raw.tags) ? raw.tags.filter((t: any) => typeof t === 'string') : [],
    is_suppressed: false,
    source_url:   raw.source_url ?? null,
  };
}

interface RawSession {
  date: string;
  time?: string;
  venue_name?: string;
  address?: string;
  borough?: string;
  price_min?: number;
  price_max?: number;
}

function buildSessions(raw: any, eventId: string): Record<string, any>[] {
  const today = new Date().toISOString().split('T')[0];

  if (Array.isArray(raw.sessions) && raw.sessions.length > 0) {
    return raw.sessions
      .filter((s: RawSession) => isValidDate(s.date) && s.date >= today)
      .map((s: RawSession) => ({
        event_id:   eventId,
        date:       s.date,
        time:       s.time ?? '',
        venue_name: s.venue_name ?? null,
        address:    s.address ?? null,
        borough:    VALID_BOROUGHS.has(s.borough ?? '') ? s.borough : null,
        price_min:  typeof s.price_min === 'number' ? s.price_min : null,
        price_max:  typeof s.price_max === 'number' ? s.price_max : null,
      }));
  }

  // Single-session fallback
  if (isValidDate(raw.start_date) && raw.start_date >= today) {
    return [{
      event_id:   eventId,
      date:       raw.start_date,
      time:       '',
      venue_name: raw.venue_name ?? null,
      address:    raw.address ?? null,
      borough:    VALID_BOROUGHS.has(raw.borough ?? '') ? raw.borough : null,
      price_min:  typeof raw.price_min === 'number' ? raw.price_min : null,
      price_max:  typeof raw.price_max === 'number' ? raw.price_max : null,
    }];
  }

  return [];
}

export async function upsertAiEvents(keepLocal = false): Promise<void> {
  if (!existsSync(OUTPUT_PATH)) {
    console.log('[upsert] ai_new_events.json not found — run enrich step first');
    return;
  }

  const raw: any[] = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
  console.log(`[upsert] Loading ${raw.length} events from ${OUTPUT_PATH}`);

  const today = new Date().toISOString().split('T')[0];
  const seen = new Set<string>();
  const sanitized = raw
    .map(sanitizeEvent)
    .filter((e): e is Record<string, any> => {
      if (e === null) return false;
      const effectiveEnd = e.end_date ?? e.start_date;
      if (effectiveEnd < today) return false;
      if (seen.has(e.source_id)) return false;
      seen.add(e.source_id);
      return true;
    });

  console.log(`[upsert] ${sanitized.length} valid upcoming events to upsert`);

  // Validate and fix image URLs
  console.log('[upsert] Validating image URLs...');
  for (const e of sanitized) {
    e.image_url = await resolveImage(e);
  }

  let eventsInserted = 0;
  let sessionsInserted = 0;
  let errors = 0;

  // Upsert events in batches of 50
  for (let i = 0; i < sanitized.length; i += 50) {
    const batch = sanitized.slice(i, i + 50);

    const { data: upserted, error } = await supabase
      .from('events')
      .upsert(batch, { onConflict: 'source,source_id' })
      .select('id, source_id');

    if (error) {
      console.error(`[upsert] Events batch error at ${i}:`, error.message);
      errors += batch.length;
      continue;
    }

    eventsInserted += batch.length;

    // Build source_id → id map
    const idMap = new Map<string, string>();
    for (const row of upserted ?? []) idMap.set(row.source_id, row.id);

    // Build session rows for this batch, dedup by (event_id, date)
    const sessionMap = new Map<string, Record<string, any>>();
    for (const ev of batch) {
      const eventId = idMap.get(ev.source_id);
      if (!eventId) continue;
      const rawEv = raw.find(r => r.source_id === ev.source_id);
      if (!rawEv) continue;
      for (const s of buildSessions(rawEv, eventId)) {
        const key = `${s.event_id}::${s.date}::${s.time ?? ''}`;
        if (!sessionMap.has(key)) sessionMap.set(key, s);
      }
    }
    const sessionRows = [...sessionMap.values()].map(s => ({
      ...s,
      time: s.time ?? '',
    }));

    if (sessionRows.length > 0) {
      const { error: sessErr } = await supabase
        .from('event_sessions')
        .upsert(sessionRows, { onConflict: 'event_id,date,time' });

      if (sessErr) {
        console.error(`[upsert] Sessions batch error at ${i}:`, sessErr.message);
      } else {
        sessionsInserted += sessionRows.length;
      }
    }
  }

  console.log(`[upsert] Done. Events: ${eventsInserted}, Sessions: ${sessionsInserted}, Errors: ${errors}`);

  // Retroactive matching: check if any private user-contributed events match newly upserted events.
  // If so, merge: update user's saved/going refs to point to the public event, add user as contributor.
  // Re-attach sessions from raw data since sanitizeEvent strips them
  const sanitizedWithSessions = sanitized.map(e => {
    const rawEv = raw.find(r => r.source_id === e.source_id);
    return rawEv?.sessions ? { ...e, sessions: rawEv.sessions } : e;
  });
  await retroactiveMatch(sanitizedWithSessions);

  // Upsert name list — only entries whose source_url made it into ai_events
  if (existsSync(NAME_LIST_PATH)) {
    const upsertedUrls = new Set(sanitized.map(e => e.source_url).filter(Boolean));
    const nameList: any[] = JSON.parse(readFileSync(NAME_LIST_PATH, 'utf-8'));
    const nameRows = nameList
      .filter(e => e.name && e.source_url && upsertedUrls.has(e.source_url))
      .map(e => ({ name: String(e.name), source_url: String(e.source_url) }));

    if (nameRows.length > 0) {
      const { error: nameErr } = await supabase
        .from('ai_event_name_list')
        .upsert(nameRows, { onConflict: 'source_url' });
      if (nameErr) console.error('[upsert] Name list error:', nameErr.message);
      else console.log(`[upsert] Name list: upserted ${nameRows.length} entries`);
    }
  }

  if (!keepLocal) {
    // Reset ai_new_events.json to empty array (keeps the file so Metro bundler doesn't break)
    writeFileSync(OUTPUT_PATH, '[]\n', 'utf-8');
    console.log(`[upsert] Reset ${OUTPUT_PATH} to []`);
    if (existsSync(NAME_LIST_PATH)) { unlinkSync(NAME_LIST_PATH); console.log(`[upsert] Deleted ${NAME_LIST_PATH}`); }
  }
}

/**
 * Retroactive matching: after upserting new public events, check if any
 * private user-contributed events match. If so, merge them:
 * - Update saved_events/going_events to point to the public event
 * - Add user as contributor to the public event
 * - Delete the old private event
 */
async function retroactiveMatch(newEvents: Record<string, any>[]): Promise<void> {
  // Get all private user-contributed events
  const { data: privateEvents } = await supabase
    .from('events')
    .select('id, title, start_date, venue_name, contributed_by')
    .eq('source_type', 'user_contributed')
    .eq('publication_status', 'private');

  if (!privateEvents || privateEvents.length === 0) return;

  const normalize = (s: string) => s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

  let merged = 0;

  for (const priv of privateEvents) {
    const privTitle = normalize(priv.title);
    const privDate = (priv.start_date ?? '').slice(0, 10);

    // Find a matching public event from the newly upserted batch
    const match = newEvents.find((pub) => {
      const pubTitle = normalize(pub.title);
      const pubDate = (pub.start_date ?? '').slice(0, 10);

      // Date must match: exact start_date, within date range, or in sessions
      const pubEndDate = (pub.end_date ?? '').slice(0, 10);
      const dateMatch = privDate === pubDate
        || (pubDate && pubEndDate && privDate >= pubDate && privDate <= pubEndDate)
        || (Array.isArray(pub.sessions) && pub.sessions.some((s: any) => s.date === privDate));
      if (!dateMatch) return false;

      // Title must be very similar
      const words1 = new Set(privTitle.split(' ').filter((w: string) => w.length > 2));
      const words2 = new Set(pubTitle.split(' ').filter((w: string) => w.length > 2));
      if (words1.size === 0 || words2.size === 0) return false;
      const intersection = [...words1].filter((w) => words2.has(w)).length;
      const union = new Set([...words1, ...words2]).size;
      if (intersection / union <= 0.5) return false;

      // If both have venue names, require reasonable venue similarity
      const privVenue = normalize(priv.venue_name ?? '');
      const pubVenue = normalize(pub.venue_name ?? '');
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

    // Find the public event's ID in DB
    const { data: pubEvent } = await supabase
      .from('events')
      .select('id')
      .eq('source_id', match.source_id)
      .eq('publication_status', 'public')
      .maybeSingle();

    if (!pubEvent) continue;

    const publicId = pubEvent.id;
    const privateId = priv.id;
    const userId = priv.contributed_by;

    console.log(`[upsert] Retroactive merge: "${priv.title}" → "${match.title}" (${publicId})`);

    // 1. Migrate saved_events per-row: update if no conflict, delete if duplicate
    const { data: privSaved } = await supabase
      .from('saved_events').select('user_id').eq('event_id', privateId);
    for (const row of privSaved ?? []) {
      const { error } = await supabase
        .from('saved_events').update({ event_id: publicId })
        .eq('event_id', privateId).eq('user_id', row.user_id);
      if (error) {
        await supabase.from('saved_events').delete()
          .eq('event_id', privateId).eq('user_id', row.user_id);
      }
    }

    // 2. Migrate going_events per-row
    const { data: privGoing } = await supabase
      .from('going_events').select('user_id').eq('event_id', privateId);
    for (const row of privGoing ?? []) {
      const { error } = await supabase
        .from('going_events').update({ event_id: publicId })
        .eq('event_id', privateId).eq('user_id', row.user_id);
      if (error) {
        await supabase.from('going_events').delete()
          .eq('event_id', privateId).eq('user_id', row.user_id);
      }
    }

    // 3. Copy ALL contributors from private event to public event (before cascade delete)
    const { data: allContributors } = await supabase
      .from('event_contributors').select('user_id, source').eq('event_id', privateId);
    for (const c of allContributors ?? []) {
      await supabase.from('event_contributors').upsert(
        { event_id: publicId, user_id: c.user_id, source: c.source },
        { onConflict: 'event_id,user_id' }
      );
    }
    // Also add contributed_by if not already a contributor
    if (userId) {
      await supabase.from('event_contributors').upsert(
        { event_id: publicId, user_id: userId, source: 'retroactive_merge' },
        { onConflict: 'event_id,user_id' }
      );
    }

    // 4. Move social links
    await supabase
      .from('event_social_links')
      .update({ event_id: publicId })
      .eq('event_id', privateId);

    // 5. Point social_post_submissions FK refs to the public event (preserves URL dedup)
    await supabase
      .from('social_post_submissions')
      .update({ created_event_id: publicId, match_event_id: publicId })
      .eq('created_event_id', privateId);
    await supabase
      .from('social_post_submissions')
      .update({ match_event_id: publicId })
      .eq('match_event_id', privateId);

    // 6. Delete the private event
    const { error: delErr } = await supabase.from('events').delete().eq('id', privateId);
    if (delErr) console.error(`[upsert] Failed to delete private event ${privateId}:`, delErr.message);

    merged++;
  }

  if (merged > 0) {
    console.log(`[upsert] Retroactive merge: merged ${merged} private events into public events`);
  }
}

if (require.main === module) {
  const keepLocal = process.argv.includes('--keep-local');
  upsertAiEvents(keepLocal).catch(console.error);
}
