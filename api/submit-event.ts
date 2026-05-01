/**
 * POST /api/submit-event
 *
 * Synchronous event extraction endpoint.
 * User submits a URL → we fetch metadata → extract via gpt-4o-mini → match → route → return.
 *
 * Body: { url: string, userId?: string }
 * Response: { extracted, match, route, submission_id }
 */

import { createClient } from '@supabase/supabase-js';
import { fetchPostMetadata, detectPlatform } from '../lib/social/fetch';
import { extractEventFromPost } from '../lib/social/extract';
import { matchToExistingEvent } from '../lib/social/match';
import { routeSubmission } from '../lib/social/route';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Auth gate: verify the user's Supabase access token
  const authHeader = req.headers?.authorization as string | undefined;
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const supabaseAnon = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY ?? supabaseKey);
  const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser(token);
  if (authErr || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { url, text } = req.body ?? {};

  if (!url && !text) {
    return res.status(400).json({ error: 'url or text is required' });
  }

  // Validate URL: must be public http/https, no private/internal hosts
  const submittedUrl = url ?? '';
  if (submittedUrl) {
    try {
      const parsed = new URL(submittedUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return res.status(400).json({ error: 'Only http/https URLs are allowed' });
      }
      const host = parsed.hostname.toLowerCase();
      // Block IPv4 private ranges, IPv6 loopback, and internal hostnames
      const blocked =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host === '[::1]' ||
        host === '::1' ||
        host.startsWith('10.') ||
        host.startsWith('172.') ||
        host.startsWith('192.168.') ||
        host.startsWith('169.254.') ||
        host.startsWith('fc') ||
        host.startsWith('fd') ||
        host.startsWith('fe80') ||
        host.endsWith('.internal') ||
        host.endsWith('.local') ||
        /^\[.*\]$/.test(host); // block all bracketed IPv6 addresses
      if (blocked) {
        return res.status(400).json({ error: 'Private/internal URLs are not allowed' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
  }

  const platform = submittedUrl ? detectPlatform(submittedUrl) : 'other';
  const supabase = createClient(supabaseUrl, supabaseKey);

  let submissionId = '';

  try {
    // 1. Insert submission row
    const { data: submission, error: insertErr } = await supabase
      .from('social_post_submissions')
      .insert({
        url: submittedUrl || 'text-submission',
        platform,
        submitted_by: user.id,
        status: 'fetching',
        manual_notes: text ?? null,
      })
      .select('id')
      .single();

    if (insertErr || !submission) {
      return res.status(500).json({ error: 'Failed to create submission', detail: insertErr?.message });
    }

    submissionId = submission.id;

    // 2. Fetch metadata
    let metadata;
    if (submittedUrl) {
      metadata = await fetchPostMetadata(submittedUrl);
    } else {
      // Text-only submission — construct minimal metadata
      metadata = {
        title: '',
        description: text ?? '',
        image: '',
        author: '',
        url: '',
        raw_html_snippet: text ?? '',
      };
    }

    // Update submission with fetched metadata
    await supabase
      .from('social_post_submissions')
      .update({
        status: 'extracting',
        caption: metadata.description?.slice(0, 1000) ?? null,
        thumbnail_url: metadata.image || null,
        author_handle: metadata.author || null,
      })
      .eq('id', submissionId);

    // 3. Extract event via gpt-4o-mini
    const extracted = await extractEventFromPost(metadata);

    // 3b. Validate image URL — reject blank/broken/private images
    if (extracted.imageUrl) {
      try {
        const imgUrl = new URL(extracted.imageUrl);
        const imgHost = imgUrl.hostname.toLowerCase();
        const imgBlocked =
          (imgUrl.protocol !== 'http:' && imgUrl.protocol !== 'https:') ||
          imgHost === 'localhost' || imgHost === '127.0.0.1' || imgHost === '0.0.0.0' ||
          imgHost === '::1' || imgHost === '[::1]' ||
          imgHost.startsWith('10.') || imgHost.startsWith('172.') || imgHost.startsWith('192.168.') ||
          imgHost.startsWith('169.254.') || imgHost.startsWith('fc') || imgHost.startsWith('fd') ||
          imgHost.startsWith('fe80') || imgHost.endsWith('.internal') || imgHost.endsWith('.local') ||
          /^\[.*\]$/.test(imgHost);
        if (imgBlocked) {
          extracted.imageUrl = null;
        } else {
          const imgRes = await fetch(extracted.imageUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
          const contentType = imgRes.headers.get('content-type') ?? '';
          if (!imgRes.ok || !contentType.startsWith('image/')) {
            extracted.imageUrl = null;
          }
        }
      } catch {
        extracted.imageUrl = null;
      }
    }

    // 4. Match against existing events
    const match = extracted.confidence >= 2
      ? await matchToExistingEvent(extracted)
      : null;

    // 5. Route the submission
    const routeResult = await routeSubmission({
      submissionId,
      userId: user.id,
      extracted,
      match,
      platform,
      postUrl: submittedUrl,
    });

    // 6. If matched, fetch the full existing event for the frontend
    let existingEvent = null;
    if (routeResult.eventId) {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('id', routeResult.eventId)
        .maybeSingle();
      existingEvent = data;
    }

    // Check if matched event was contributed by the current user
    const isOwnEvent = existingEvent?.contributed_by === user.id;

    return res.status(200).json({
      ok: true,
      submission_id: submissionId,
      event_id: routeResult.eventId ?? null,
      extracted,
      match: match ? { eventId: match.eventId, title: match.title, similarity: match.similarity } : null,
      route: routeResult.status,
      existing_event: existingEvent,
      is_public: routeResult.isPublic,
      is_own_event: isOwnEvent,
    });
  } catch (err: any) {
    console.error('[submit-event] Error:', err);
    // Mark the submission as failed so it doesn't get stuck in fetching/extracting
    if (submissionId !== '') {
      try {
        await supabase
          .from('social_post_submissions')
          .update({ status: 'needs_review', reject_reason: `pipeline_error: ${err.message ?? 'unknown'}` })
          .eq('id', submissionId);
      } catch { /* non-critical — don't mask the original error */ }
    }
    return res.status(500).json({ error: 'Extraction failed', detail: err.message });
  }
}
