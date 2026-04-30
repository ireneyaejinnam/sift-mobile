/**
 * GET /api/metrics
 *
 * Public endpoint — returns aggregate metrics for the class leaderboard.
 * Pulled automatically before each class; no auth required.
 *
 * Response:
 * {
 *   "signups": 42,
 *   "active_users": 15,
 *   "waitlist": 68,
 *   "page_views": 0,
 *   "dau_last_14": [{ "date": "2026-04-16", "dau": 5 }, ...],
 *   "funnel": { "signed_up": 42, "completed_onboarding": 30, ... },
 *   "cohort_retention": [{ "cohort_week": "2026-04-07", "users": 10, "day_1": 80, ... }, ...]
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
      `${supabaseUrl}/rest/v1/analytics?or=(${filter})&select=user_id&limit=10000`,
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

  // ── dau_last_14: daily active users for past 14 days ───────────────────
  // Single fetch for all 14 days, then bucket client-side
  let dau_last_14: { date: string; dau: number }[] = [];
  try {
    const now = new Date();
    const fourteenAgo = new Date(now);
    fourteenAgo.setDate(fourteenAgo.getDate() - 13);
    const rangeStart = `${fourteenAgo.toISOString().slice(0, 10)}T00:00:00.000Z`;

    const res = await fetch(
      `${supabaseUrl}/rest/v1/analytics?select=user_id,created_at&created_at=gte.${rangeStart}&user_id=neq.guest&limit=50000`,
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );

    // Build date→Set<user_id> map
    const dateUsers: Record<string, Set<string>> = {};
    if (res.ok) {
      const rows: { user_id: string; created_at: string }[] = await res.json();
      for (const r of rows) {
        const d = new Date(r.created_at).toISOString().slice(0, 10);
        if (!dateUsers[d]) dateUsers[d] = new Set();
        dateUsers[d].add(r.user_id);
      }
    }

    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      dau_last_14.push({ date: dateStr, dau: dateUsers[dateStr]?.size ?? 0 });
    }
  } catch {
    // Fall back to empty array — already initialized
  }

  // ── funnel: counts at each stage ──────────────────────────────────────
  const funnelStages: [string, string][] = [
    ['signed_up', 'sign_up_completed'],
    ['completed_onboarding', 'onboarding_complete'],
    ['saved_first_event', 'event_saved'],
    ['marked_going', 'event_going'],
    ['ticket_clicked', 'ticket_click'],
    ['completed_plan', 'plan_created'],
  ];

  // Single fetch for all funnel event types, then group client-side
  const funnel: Record<string, number> = {};
  try {
    const funnelEventTypes = funnelStages.map(([, et]) => `event_type.eq.${et}`).join(',');
    const res = await fetch(
      `${supabaseUrl}/rest/v1/analytics?select=user_id,event_type&or=(${funnelEventTypes})&user_id=neq.guest&limit=50000`,
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
    if (res.ok) {
      const rows: { user_id: string; event_type: string }[] = await res.json();
      const byType: Record<string, Set<string>> = {};
      for (const r of rows) {
        if (!byType[r.event_type]) byType[r.event_type] = new Set();
        byType[r.event_type].add(r.user_id);
      }
      for (const [label, eventType] of funnelStages) {
        funnel[label] = byType[eventType]?.size ?? 0;
      }
    } else {
      for (const [label] of funnelStages) funnel[label] = 0;
    }
  } catch {
    for (const [label] of funnelStages) funnel[label] = 0;
  }

  // ── cohort_retention: weekly cohorts, last 4 weeks ────────────────────
  const cohort_retention: {
    cohort_week: string;
    users: number;
    day_1: number;
    day_3: number;
    day_7: number;
    day_14: number;
  }[] = [];

  try {
    // Fetch all analytics rows (user_id + created_at) for the past ~5 weeks
    const fiveWeeksAgo = new Date();
    fiveWeeksAgo.setDate(fiveWeeksAgo.getDate() - 35);
    const cutoff = fiveWeeksAgo.toISOString();

    const priorRes = await fetch(
      `${supabaseUrl}/rest/v1/analytics?select=user_id&created_at=lt.${cutoff}&user_id=neq.guest&limit=50000`,
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );

    const usersWithPriorActivity = new Set<string>();
    if (!priorRes.ok) {
      throw new Error('Failed to fetch prior cohort activity');
    }
    const priorRows: { user_id: string }[] = await priorRes.json();
    for (const r of priorRows) {
      usersWithPriorActivity.add(r.user_id);
    }

    const res = await fetch(
      `${supabaseUrl}/rest/v1/analytics?select=user_id,created_at&created_at=gte.${cutoff}&user_id=neq.guest&order=created_at.asc&limit=50000`,
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );

    if (res.ok) {
      const rows: { user_id: string; created_at: string }[] = await res.json();

      // Build per-user: first activity date + set of active dates
      const userFirst: Record<string, number> = {};
      const userActiveDates: Record<string, Set<string>> = {};

      for (const r of rows) {
        if (usersWithPriorActivity.has(r.user_id)) continue;
        const ts = new Date(r.created_at).getTime();
        const dateStr = new Date(r.created_at).toISOString().slice(0, 10);
        if (!userFirst[r.user_id] || ts < userFirst[r.user_id]) {
          userFirst[r.user_id] = ts;
        }
        if (!userActiveDates[r.user_id]) userActiveDates[r.user_id] = new Set();
        userActiveDates[r.user_id].add(dateStr);
      }

      const now = new Date();
      for (let w = 3; w >= 0; w--) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - (w + 1) * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const cohortUsers = Object.entries(userFirst).filter(([, firstTs]) => {
          return firstTs >= weekStart.getTime() && firstTs < weekEnd.getTime();
        });

        const total = cohortUsers.length;
        if (total === 0) {
          cohort_retention.push({
            cohort_week: weekStart.toISOString().slice(0, 10),
            users: 0,
            day_1: 0,
            day_3: 0,
            day_7: 0,
            day_14: 0,
          });
          continue;
        }

        const retainedAt = (dayOffset: number) => {
          let count = 0;
          for (const [uid, firstTs] of cohortUsers) {
            const target = new Date(firstTs);
            target.setDate(target.getDate() + dayOffset);
            const targetStr = target.toISOString().slice(0, 10);
            if (userActiveDates[uid]?.has(targetStr)) count++;
          }
          return Math.round((count / total) * 100);
        };

        cohort_retention.push({
          cohort_week: weekStart.toISOString().slice(0, 10),
          users: total,
          day_1: retainedAt(1),
          day_3: retainedAt(3),
          day_7: retainedAt(7),
          day_14: retainedAt(14),
        });
      }
    }
  } catch {
    // Fall back to empty array — already initialized
  }

  return new Response(
    JSON.stringify({
      signups,
      active_users,
      waitlist,
      page_views: 0,
      dau_last_14,
      funnel,
      cohort_retention,
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
