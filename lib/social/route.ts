/**
 * route.ts
 *
 * Routes a social submission based on extraction results and matching.
 * - If matched to existing event: add user as contributor, link submission
 * - If no match + confidence >= 2: create event in events table as private, add contributor
 * - If confidence 0-1: reject
 *
 * When 3+ distinct users contribute the same event, it becomes public.
 */

import { createClient } from '@supabase/supabase-js';
import type { ExtractedEvent } from './extract';
import type { MatchResult } from './match';

export interface RouteResult {
  status: 'matched' | 'created' | 'rejected';
  eventId?: string;
  submissionId: string;
  confidence: number;
  isPublic: boolean;
}

export async function routeSubmission(opts: {
  submissionId: string;
  userId: string;
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

  const { submissionId, userId, extracted, match, platform, postUrl } = opts;

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

    return { status: 'rejected', submissionId, confidence: extracted.confidence, isPublic: false };
  }

  // ── Matched to existing event ──
  if (match) {
    // Add user as contributor
    await supabase.from('event_contributors').upsert(
      { event_id: match.eventId, user_id: userId, source: 'matched' },
      { onConflict: 'event_id,user_id' }
    );

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

    // Increment social_signal
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

    // Check promotion threshold
    const isPublic = await checkAndPromote(supabase, match.eventId);

    return {
      status: 'matched',
      eventId: match.eventId,
      submissionId,
      confidence: extracted.confidence,
      isPublic,
    };
  }

  // ── No match, confidence >= 2: create private event ──
  const sourceId = `user-${slugify(extracted.title)}-${extracted.startDate || 'unknown'}`;

  const { data: newEvent, error: eventErr } = await supabase
    .from('events')
    .insert({
      source_id: sourceId,
      source: 'user',
      source_type: 'user_contributed',
      publication_status: 'private',
      contributed_by: userId,
      title: extracted.title,
      category: extracted.category || 'popups',
      description: extracted.description || null,
      start_date: extracted.startDate || null,
      end_date: extracted.endDate || null,
      venue_name: extracted.venue || null,
      address: extracted.address || null,
      borough: extracted.borough || null,
      price_min: extracted.price ?? 0,
      is_free: extracted.price === 0,
      event_url: extracted.sourceUrl || null,
      image_url: extracted.imageUrl || null,
      ticket_url: extracted.ticketUrl || null,
      source_url: extracted.sourceUrl || null,
      is_suppressed: false,
    })
    .select('id')
    .single();

  if (eventErr || !newEvent) {
    throw new Error(`Failed to create event: ${eventErr?.message}`);
  }

  const eventId = newEvent.id;

  // Create event session
  if (extracted.startDate) {
    await supabase.from('event_sessions').upsert(
      {
        event_id: eventId,
        date: extracted.startDate,
        time: extracted.startTime || '',
        venue_name: extracted.venue || null,
        address: extracted.address || null,
        borough: extracted.borough || null,
        price_min: extracted.price ?? null,
      },
      { onConflict: 'event_id,date,time' }
    );
  }

  // Add user as contributor
  await supabase.from('event_contributors').upsert(
    { event_id: eventId, user_id: userId, source: 'submitted' },
    { onConflict: 'event_id,user_id' }
  );

  // Update submission
  await supabase
    .from('social_post_submissions')
    .update({
      status: 'draft_created',
      created_event_id: eventId,
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
    status: 'created',
    eventId,
    submissionId,
    confidence: extracted.confidence,
    isPublic: false,
  };
}

/**
 * Check if an event has enough contributors to go public.
 * Returns true if the event is now public.
 */
async function checkAndPromote(
  supabase: any,
  eventId: string
): Promise<boolean> {
  const { count } = await supabase
    .from('event_contributors')
    .select('user_id', { count: 'exact', head: true })
    .eq('event_id', eventId);

  if (count && count >= 3) {
    await supabase
      .from('events')
      .update({ publication_status: 'public' })
      .eq('id', eventId);
    return true;
  }

  // Check current status
  const { data } = await supabase
    .from('events')
    .select('publication_status')
    .eq('id', eventId)
    .maybeSingle();
  return data?.publication_status === 'public';
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
