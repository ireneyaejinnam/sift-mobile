/**
 * match.ts
 *
 * Matches extracted event data against existing events in the database.
 * Uses Jaccard similarity on (title + date + venue) with threshold > 0.6.
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
 * Returns the matched event ID if similarity > 0.6, otherwise null.
 */
export async function matchToExistingEvent(
  extracted: ExtractedEvent
): Promise<MatchResult | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey || !extracted.startDate) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Query events around the same date range (+/- 3 days) to narrow candidates
  const dateStart = shiftDate(extracted.startDate, -3);
  const dateEnd = shiftDate(extracted.endDate ?? extracted.startDate, 3);

  const { data: candidates, error } = await supabase
    .from('events')
    .select('id, title, start_date, venue_name')
    .gte('start_date', dateStart)
    .lte('start_date', dateEnd)
    .eq('is_suppressed', false)
    .limit(500);

  if (error || !candidates || candidates.length === 0) return null;

  let bestMatch: MatchResult | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = computeSimilarity(extracted, candidate);
    if (score > bestScore && score > 0.6) {
      bestScore = score;
      bestMatch = {
        eventId: candidate.id,
        title: candidate.title,
        similarity: score,
      };
    }
  }

  return bestMatch;
}

/**
 * Compute similarity between extracted event and a DB candidate.
 * Weighted Jaccard: title (0.5) + date (0.3) + venue (0.2).
 */
function computeSimilarity(
  extracted: ExtractedEvent,
  candidate: { title: string; start_date: string; venue_name?: string | null }
): number {
  const titleSim = jaccardWords(
    normalize(extracted.title),
    normalize(candidate.title)
  );

  const dateSim =
    extracted.startDate &&
    candidate.start_date &&
    extracted.startDate.slice(0, 10) === candidate.start_date.slice(0, 10)
      ? 1.0
      : 0.0;

  const venueSim =
    extracted.venue && candidate.venue_name
      ? jaccardWords(normalize(extracted.venue), normalize(candidate.venue_name))
      : 0.0;

  return titleSim * 0.5 + dateSim * 0.3 + venueSim * 0.2;
}

function jaccardWords(a: string, b: string): number {
  if (!a || !b) return 0;
  const stopWords = new Set(['the', 'a', 'an', 'at', 'in', 'on', 'of', 'and', 'with', 'for', 'to']);
  const wordsA = new Set(a.split(' ').filter((w) => w.length > 1 && !stopWords.has(w)));
  const wordsB = new Set(b.split(' ').filter((w) => w.length > 1 && !stopWords.has(w)));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

function normalize(s: string): string {
  return s
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
