/**
 * POST /api/cron/process-social
 *
 * Hourly cron job. Picks up social_post_submissions with status='submitted',
 * runs the full pipeline: fetch metadata → extract with Claude → match → route.
 *
 * Max 20 submissions per run to stay within function timeout.
 *
 * Schedule: every hour (0 * * * *)
 */

import { createClient } from '@supabase/supabase-js';
import { fetchPostMetadata } from '../../lib/social/fetch';
import { extractEventFromPost } from '../../lib/social/extract';
import { matchToExistingEvent } from '../../lib/social/match';
import { routeSubmission } from '../../lib/social/route';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const BATCH_SIZE = 20;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify Vercel cron secret
  if (req.headers['authorization'] !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: submissions, error } = await supabase
    .from('social_post_submissions')
    .select('id, url, platform, caption, thumbnail_url, author_handle, manual_notes, external_link')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) return res.status(500).json({ error: error.message });
  if (!submissions || submissions.length === 0) {
    return res.status(200).json({ ok: true, processed: 0, message: 'No submissions to process' });
  }

  const results: Array<{ id: string; outcome: string; reason?: string; error?: string }> = [];

  for (const sub of submissions) {
    try {
      // --- Fetch metadata if caption is missing ---
      let caption = sub.caption;
      let thumbnailUrl = sub.thumbnail_url;
      let authorHandle = sub.author_handle;

      if (!caption) {
        await supabase.from('social_post_submissions')
          .update({ status: 'fetching' })
          .eq('id', sub.id);

        try {
          const meta = await fetchPostMetadata(sub.url);
          caption       = meta.caption;
          thumbnailUrl  = meta.thumbnail_url;
          authorHandle  = meta.author_handle;

          await supabase.from('social_post_submissions').update({
            caption:       caption,
            thumbnail_url: thumbnailUrl,
            author_handle: authorHandle,
          }).eq('id', sub.id);
        } catch (fetchErr) {
          console.warn(`[process-social] Metadata fetch failed for ${sub.id}:`, fetchErr);
          // Continue with null caption — extraction will handle it gracefully
        }
      }

      // --- Extract with Claude ---
      await supabase.from('social_post_submissions')
        .update({ status: 'extracting' })
        .eq('id', sub.id);

      const extracted = await extractEventFromPost({
        caption:       caption ?? '',
        thumbnail_url: thumbnailUrl ?? undefined,
        external_link: sub.external_link ?? undefined,
        manual_notes:  sub.manual_notes ?? undefined,
        platform:      sub.platform,
      });

      await supabase.from('social_post_submissions').update({
        extracted_title:       extracted.title,
        extracted_venue:       extracted.venue,
        extracted_date:        extracted.date_raw,
        extracted_date_parsed: extracted.date_parsed,
        extracted_time:        extracted.time,
        extracted_price:       extracted.price,
        extracted_ticket_url:  extracted.ticket_url,
        extracted_category:    extracted.category,
        extracted_vibe_tags:   extracted.vibe_tags,
        extraction_confidence: extracted.confidence.overall,
        extraction_raw:        extracted as any,
      }).eq('id', sub.id);

      // If extraction explicitly says not an event, reject early
      if (!extracted.is_specific_event && !extracted.is_recurring && extracted.confidence.overall < 0.30) {
        await supabase.from('social_post_submissions').update({
          status:        'rejected',
          reject_reason: 'low_confidence_not_event',
          reviewed_at:   new Date().toISOString(),
          reviewed_by:   'auto',
        }).eq('id', sub.id);
        results.push({ id: sub.id, outcome: 'rejected', reason: 'low_confidence_not_event' });
        continue;
      }

      // --- Match to existing event ---
      await supabase.from('social_post_submissions')
        .update({ status: 'matching' })
        .eq('id', sub.id);

      const match = await matchToExistingEvent(extracted);

      // --- Route to final status ---
      const routeResult = await routeSubmission({
        submissionId: sub.id,
        postUrl:      sub.url,
        platform:     sub.platform,
        extracted,
        match,
      });

      results.push({ id: sub.id, outcome: routeResult.status, reason: routeResult.reason });
    } catch (err: any) {
      console.error(`[process-social] Failed to process submission ${sub.id}:`, err);

      // Mark as needs_review so a human can handle it
      await supabase.from('social_post_submissions').update({
        status:        'needs_review',
        reject_reason: `pipeline_error: ${err.message ?? 'unknown'}`,
      }).eq('id', sub.id);

      results.push({ id: sub.id, outcome: 'error', error: err.message ?? 'unknown' });
    }
  }

  const summary = results.reduce((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('[process-social] Run complete:', summary);
  return res.status(200).json({ ok: true, processed: results.length, summary, results });
}
