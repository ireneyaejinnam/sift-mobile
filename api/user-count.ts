/**
 * GET /api/user-count
 *
 * Public endpoint — returns total registered user count.
 * Used to update the leaderboard automatically each week.
 *
 * Response: { "user_count": 42 }
 *
 * Cached for 5 minutes via Cache-Control so repeated hits
 * don't hammer the Supabase admin API.
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

  // Hit Supabase Auth Admin REST API directly to support both
  // legacy JWT keys and the new sb_secret_ key format.
  let userCount = 0;
  let page = 1;
  const perPage = 1000;

  while (true) {
    const res = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
      {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user count', detail: text }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const json = await res.json();
    const users = json.users ?? [];
    userCount += users.length;

    if (users.length < perPage) break;
    page++;
  }

  return new Response(JSON.stringify({ user_count: userCount }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
