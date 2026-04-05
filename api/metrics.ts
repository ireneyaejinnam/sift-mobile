/**
 * GET /api/metrics
 *
 * Public endpoint — returns aggregate metrics for the class leaderboard.
 * Pulled automatically before each class; no auth required.
 *
 * Response:
 * {
 *   "signups": 42,       — registered accounts in Supabase Auth
 *   "active_users": 15,  — distinct users with a meaningful event in analytics table
 *   "waitlist": 68,      — email signups in waitlist-signup table
 *   "page_views": 0      — not yet instrumented (returns 0)
 * }
 *
 * Cached for 5 minutes via Cache-Control so repeated hits
 * don't hammer the Supabase Auth API.
 */
export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server misconfiguration' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const headers = {
    apikey: supabaseServiceKey,
    Authorization: `Bearer ${supabaseServiceKey}`,
  };

  // ── signups: paginate through Supabase Auth users ─────────────────────────
  let signups = 0;
  let page = 1;
  const perPage = 1000;

  while (true) {
    const res = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
      { headers }
    );

    if (!res.ok) {
      const text = await res.text();
      return new Response(
        JSON.stringify({ error: 'Failed to fetch signups', detail: text }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const json = await res.json();
    const users = json.users ?? [];
    signups += users.length;

    if (users.length < perPage) break;
    page++;
  }

  // ── active_users: distinct users with a meaningful event ──────────────────
  let active_users = 0;
  try {
    const activeEvents = ['event_saved', 'event_going', 'plan_created', 'card_tap'];
    const filter = activeEvents.map(e => `event_type.eq.${e}`).join(',');

    const res = await fetch(
      `${supabaseUrl}/rest/v1/analytics?or=(${filter})&select=user_id`,
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );

    if (res.ok) {
      const rows: { user_id: string }[] = await res.json();
      const uniqueUsers = new Set(rows.map(r => r.user_id).filter(id => id !== 'guest'));
      active_users = uniqueUsers.size;
    }
  } catch {
    // Silently fall back to 0
  }

  // ── waitlist: count rows in waitlist-signup table ─────────────────────────
  let waitlist = 0;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/waitlist-signup?select=id`,
      {
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Prefer: 'count=exact',
        },
      }
    );

    if (res.ok) {
      const contentRange = res.headers.get('content-range');
      // content-range format: 0-67/68
      if (contentRange) {
        const total = contentRange.split('/')[1];
        waitlist = parseInt(total, 10) || 0;
      }
    }
  } catch {
    // Silently fall back to 0
  }

  return new Response(
    JSON.stringify({
      signups,
      active_users,
      waitlist,
      page_views: 0, // TODO: pull from GA4 or analytics provider
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}