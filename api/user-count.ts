import { createClient } from '@supabase/supabase-js';

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

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Paginate through all users to get an accurate count.
  // listUsers maxes at 1000 per page — loop until exhausted.
  let userCount = 0;
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user count' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    userCount += data.users.length;

    if (data.users.length < perPage) break; // last page
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
