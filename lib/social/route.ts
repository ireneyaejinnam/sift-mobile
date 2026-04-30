/**
 * route.ts
 *
 * Routes a social submission based on extraction results and matching.
 * - If matched to existing event: links via event_social_links, status='matched'
 * - If no match + confidence >= 2: status='draft_created' (user reviews)
 * - If confidence 0-1: status='rejected' (not an event)
 */

import { createClient } from '@supabase/supabase-js';
import type { ExtractedEvent } from './extract';
import type { MatchResult } from './match';

export interface RouteResult {
  status: 'matched' | 'draft_created' | 'rejected';
  eventId?: string;       // existing event ID if matched
  submissionId: string;   // the social_post_submissions row
  confidence: number;
}

export async function routeSubmission(opts: {
  submissionId: string;
  extracted: ExtractedEvent;
  match: MatchResult | null;
  platform: string;
  postUrl: string;
}): Promise<RouteResult> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { submissionId, extracted, match, platform, postUrl } = opts;

  // ── Confidence 0-1: not an event ──
  if (extracted.confidence <= 1) {
    await supabase
      .from('social_post_submissions')
      .update({
        status: 'rejected',
        reject_reason: 'not_an_event',
        extraction_confidence: extracted.confidence,
      })
      .eq('id', submissionId);

    return { status: 'rejected', submissionId, confidence: extracted.confidence };
  }

  // ── Matched to existing event ──
  if (match) {
    // Link submission to existing event
    await supabase.from('event_social_links').upsert(
      {
        event_id: match.eventId,
        submission_id: submissionId,
        platform,
        post_url: postUrl,
      },
      { onConflict: 'event_id,submission_id' }
    );

    // Update submission status
    await supabase
      .from('social_post_submissions')
      .update({
        status: 'matched',
        match_event_id: match.eventId,
        match_confidence: match.similarity,
        extraction_confidence: extracted.confidence,
      })
      .eq('id', submissionId);

    // Increment social_signal on the matched event
    try {
      const { data: existing } = await supabase
        .from('events')
        .select('social_signal')
        .eq('id', match.eventId)
        .maybeSingle();
      if (existing) {
        await supabase
          .from('events')
          .update({ social_signal: (existing.social_signal ?? 0) + 1 })
          .eq('id', match.eventId);
      }
    } catch { /* non-critical */ }

    return {
      status: 'matched',
      eventId: match.eventId,
      submissionId,
      confidence: extracted.confidence,
    };
  }

  // ── No match, confidence >= 2: draft for user review ──
  await supabase
    .from('social_post_submissions')
    .update({
      status: 'draft_created',
      extracted_title: extracted.title,
      extracted_venue: extracted.venue,
      extracted_address: extracted.address,
      extracted_date: extracted.startDate,
      extracted_date_parsed: extracted.startDate || null,
      extracted_time: extracted.startTime,
      extracted_price: extracted.priceLabel,
      extracted_ticket_url: extracted.ticketUrl,
      extracted_category: extracted.category,
      extraction_confidence: extracted.confidence,
      extraction_raw: extracted as any,
    })
    .eq('id', submissionId);

  return {
    status: 'draft_created',
    submissionId,
    confidence: extracted.confidence,
  };
}
