/**
 * match.ts
 *
 * Matches extracted event data against existing events in the database.
 * Uses hybrid similarity: word Jaccard + character trigrams + token containment.
 * Also checks for exact URL matches and source URL dedup.
 */

import { createClient } from '@supabase/supabase-js';
import type { ExtractedEvent } from './extract';

export interface MatchResult {
  eventId: string;
  title: string;
  similarity: number;
}

/**
 * Match an extracted event against the events table.
 * Returns the matched event ID if found, otherwise null.
 */
export async function matchToExistingEvent(
  extracted: ExtractedEvent
): Promise<MatchResult | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Step 0: Check if this exact URL was already submitted
  // Only use URL dedup if the previous event is PUBLIC — otherwise fall through
  // to fuzzy matching which may find a better public match
  let privateUrlMatch: MatchResult | null = null;
  if (extracted.sourceUrl) {
    const { data: existing } = await supabase
      .from('social_post_submissions')
      .select('match_event_id, created_event_id')
      .eq('url', extracted.sourceUrl)
      .or('match_event_id.not.is.null,created_event_id.not.is.null')
      .order('submitted_at', { ascending: false })
      .limit(1);

    const prevEventId = existing?.[0]?.match_event_id ?? existing?.[0]?.created_event_id;
    if (prevEventId) {
      const { data: event } = await supabase
        .from('events')
        .select('id, title, publication_status')
        .eq('id', prevEventId)
        .maybeSingle();
      if (event && event.publication_status === 'public') {
        return { eventId: event.id, title: event.title, similarity: 1.0 };
      }
      // Save private match as fallback — if fuzzy matching can't run or finds nothing,
      // we still want to add contributors to the existing private event
      if (event) {
        privateUrlMatch = { eventId: event.id, title: event.title, similarity: 1.0 };
      }
    }
  }

  if (!extracted.startDate) return privateUrlMatch;

  // Step 1: Query candidates — 3-way date match to catch collapsed multi-session events
  const dateStart = shiftDate(extracted.startDate, -7);
  const dateEnd = shiftDate(extracted.endDate ?? extracted.startDate, 7);
  const extDate = extracted.startDate.slice(0, 10);

  // Find events that have a session on the extracted date (catches later sessions of collapsed events)
  const { data: sessionCandidates } = await supabase
    .from('event_sessions')
    .select('event_id')
    .eq('date', extDate);
  const sessionEventIds = [...new Set((sessionCandidates ?? []).map((s: any) => s.event_id))];

  const datePredicates = [
    `and(start_date.gte.${dateStart},start_date.lte.${dateEnd})`,
    `and(start_date.lte.${extDate},end_date.gte.${extDate})`,
    ...(sessionEventIds.length > 0 ? [`id.in.(${sessionEventIds.join(',')})`] : []),
  ].join(',');

  const { data: candidates, error } = await supabase
    .from('events')
    .select('id, title, start_date, venue_name, ticket_url, event_url, publication_status')
    .or(datePredicates)
    .eq('is_suppressed', false)
    .limit(500);

  if (error || !candidates || candidates.length === 0) return privateUrlMatch;

  // Step 2: Check for URL-based exact match first (compare as URLs, not text)
  if (extracted.ticketUrl || extracted.sourceUrl) {
    for (const c of candidates) {
      if (c.publication_status !== 'public') continue;
      if (extracted.ticketUrl && c.ticket_url && normalizeUrl(extracted.ticketUrl) === normalizeUrl(c.ticket_url)) {
        return { eventId: c.id, title: c.title, similarity: 1.0 };
      }
      if (extracted.sourceUrl && c.event_url && normalizeUrl(extracted.sourceUrl) === normalizeUrl(c.event_url)) {
        return { eventId: c.id, title: c.title, similarity: 1.0 };
      }
    }
  }

  // Step 3: Fuzzy matching
  let bestMatch: MatchResult | null = null;
  let bestScore = 0;

  console.log(`[match] Extracted: "${extracted.title}" date=${extracted.startDate} venue="${extracted.venue}"`);
  console.log(`[match] Candidates: ${candidates.length} events in ${dateStart} to ${dateEnd}`);

  const sessionMatchedIds = new Set(sessionEventIds);
  for (const candidate of candidates) {
    // For candidates found via session date match, use the extracted date for scoring
    // so the date component isn't penalized for comparing against the aggregate start_date
    const dateOverride = sessionMatchedIds.has(candidate.id) ? extDate : undefined;
    const score = computeSimilarity(extracted, candidate, dateOverride);
    if (score > 0.3) {
      console.log(`[match]   "${candidate.title}" score=${score.toFixed(3)} ${(candidate as any).publication_status}`);
    }
    // Prefer public events: at equal score, public wins over private
    const isPublic = (candidate as any).publication_status === 'public';
    const bestIsPublic = bestMatch ? candidates.find(c => c.id === bestMatch!.eventId && (c as any).publication_status === 'public') : false;
    const betterScore = score > bestScore;
    const sameScoreButPublic = score === bestScore && isPublic && !bestIsPublic;
    if ((betterScore || sameScoreButPublic) && score > 0.5) {
      bestScore = score;
      bestMatch = {
        eventId: candidate.id,
        title: candidate.title,
        similarity: score,
      };
    }
  }

  console.log(`[match] Best: ${bestMatch ? `"${bestMatch.title}" (${bestScore.toFixed(3)})` : 'none'}`);
  // If fuzzy matching found nothing but we had a private URL match, use it as fallback
  // so repeat submissions still add contributors toward promotion
  return bestMatch ?? privateUrlMatch;
}

/**
 * Compute similarity using hybrid approach:
 * Title: max(word Jaccard, trigram Dice, token containment) × 0.5
 * Date: fuzzy match × 0.3
 * Venue: max(word Jaccard, exact match) × 0.2
 */
function computeSimilarity(
  extracted: ExtractedEvent,
  candidate: { title: string; start_date: string; venue_name?: string | null },
  overrideCandDate?: string
): number {
  const normExtTitle = normalize(extracted.title);
  const normCandTitle = normalize(candidate.title);

  // Title: best of 3 methods
  const titleSim = Math.max(
    jaccardWords(normExtTitle, normCandTitle),
    trigramDice(normExtTitle, normCandTitle),
    tokenContainment(normExtTitle, normCandTitle)
  );

  // Date: fuzzy — use override date for session-matched candidates
  let dateSim = 0.0;
  const candDateStr = overrideCandDate ?? candidate.start_date;
  if (extracted.startDate && candDateStr) {
    const extDate = new Date(extracted.startDate + 'T12:00:00Z').getTime();
    const candDate = new Date(candDateStr.slice(0, 10) + 'T12:00:00Z').getTime();
    const daysDiff = Math.abs(extDate - candDate) / (1000 * 60 * 60 * 24);
    if (daysDiff === 0) dateSim = 1.0;
    else if (daysDiff <= 2) dateSim = 0.7;
    else if (daysDiff <= 5) dateSim = 0.3;
  }

  // Venue: word Jaccard with exact match bonus
  let venueSim = 0.0;
  if (extracted.venue && candidate.venue_name) {
    const normExtVenue = normalize(extracted.venue);
    const normCandVenue = normalize(candidate.venue_name);
    if (normExtVenue === normCandVenue) {
      venueSim = 1.0;
    } else {
      venueSim = Math.max(
        jaccardWords(normExtVenue, normCandVenue),
        tokenContainment(normExtVenue, normCandVenue)
      );
    }
  }

  return titleSim * 0.5 + dateSim * 0.3 + venueSim * 0.2;
}

// ── Similarity functions ──────────────────────────────────────

function jaccardWords(a: string, b: string): number {
  if (!a || !b) return 0;
  const stopWords = new Set(['the', 'a', 'an', 'at', 'in', 'on', 'of', 'and', 'with', 'for', 'to', 'nyc', 'new', 'york', 'ny']);
  const wordsA = new Set(a.split(' ').filter((w) => w.length > 1 && !stopWords.has(w)));
  const wordsB = new Set(b.split(' ').filter((w) => w.length > 1 && !stopWords.has(w)));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

/** Token containment: if all words of the shorter title appear in the longer, high score.
 *  Requires at least 3 meaningful words in the shorter title to avoid false positives
 *  with generic single-word titles like "Market", "Party", "Workshop". */
function tokenContainment(a: string, b: string): number {
  if (!a || !b) return 0;
  const stopWords = new Set(['the', 'a', 'an', 'at', 'in', 'on', 'of', 'and', 'with', 'for', 'to', 'nyc', 'new', 'york']);
  const wordsA = a.split(' ').filter((w) => w.length > 1 && !stopWords.has(w));
  const wordsB = b.split(' ').filter((w) => w.length > 1 && !stopWords.has(w));
  const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB;
  const longerSet = new Set(wordsA.length <= wordsB.length ? wordsB : wordsA);
  if (shorter.length < 3) return 0; // Too few words — containment is unreliable
  const contained = shorter.filter((w) => longerSet.has(w)).length;
  return contained / shorter.length;
}

/** Character trigram Dice coefficient — catches punctuation/spacing differences */
function trigramDice(a: string, b: string): number {
  if (!a || !b || a.length < 3 || b.length < 3) return 0;
  const triA = trigrams(a);
  const triB = trigrams(b);
  const setA = new Set(triA);
  const setB = new Set(triB);
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  return (2 * intersection) / (setA.size + setB.size) || 0;
}

function trigrams(s: string): string[] {
  const result: string[] = [];
  for (let i = 0; i <= s.length - 3; i++) {
    result.push(s.slice(i, i + 3));
  }
  return result;
}

/** Normalize a URL for comparison — lowercase host, strip trailing slash and tracking params */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    u.searchParams.delete('igsh');
    u.searchParams.delete('fbclid');
    return (u.origin + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase();
  } catch {
    return url.toLowerCase().trim();
  }
}

function normalize(s: string): string {
  return s
    .normalize('NFD')              // decompose accents: é → e + combining accent
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
