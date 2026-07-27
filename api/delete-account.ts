import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_KEY!;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify auth token
  const authHeader = req.headers.authorization ?? req.headers.Authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization" });
  }

  const token = authHeader.slice(7);
  const admin = createClient(supabaseUrl, serviceKey);

  // Verify the token and get user ID
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) {
    return res.status(401).json({ error: "Invalid token" });
  }

  const userId = user.id;

  try {
    // Delete all user-owned data — check each result and abort if any fails
    const tables: { table: string; column: string }[] = [
      { table: "user_event_interactions", column: "user_id" },
      { table: "user_taste_profiles", column: "user_id" },
      { table: "saved_events", column: "user_id" },
      { table: "going_events", column: "user_id" },
      { table: "custom_lists", column: "user_id" },
      { table: "user_plan_event_orders", column: "user_id" },
      { table: "user_profiles", column: "user_id" },
      { table: "event_contributors", column: "user_id" },
      { table: "social_post_submissions", column: "submitted_by" },
    ];

    for (const { table, column } of tables) {
      const { error } = await admin.from(table).delete().eq(column, userId);
      // A missing table (schema drift) shouldn't block the whole delete — skip
      // "relation does not exist"; abort on any real error.
      if (error && !/does not exist/i.test(error.message)) {
        console.error(`[delete-account] Failed to delete from ${table}:`, error.message);
        return res.status(500).json({ error: `Failed to delete ${table}` });
      }
    }

    // Find private events contributed by this user
    const { data: privateEvents } = await admin
      .from("events")
      .select("id")
      .eq("contributed_by", userId)
      .eq("publication_status", "private");

    if (privateEvents && privateEvents.length > 0) {
      const privateIds = privateEvents.map((e: any) => e.id);

      // Nullify any FK references from other users' submissions pointing to these events
      await admin
        .from("social_post_submissions")
        .update({ match_event_id: null, created_event_id: null })
        .in("match_event_id", privateIds);
      await admin
        .from("social_post_submissions")
        .update({ created_event_id: null })
        .in("created_event_id", privateIds);

      // Now safe to delete the private events
      const { error: eventsError } = await admin
        .from("events")
        .delete()
        .in("id", privateIds);
      if (eventsError) {
        console.error("[delete-account] Failed to delete private events:", eventsError.message);
        return res.status(500).json({ error: "Failed to delete private events" });
      }
    }

    // All data cleaned up — now delete the auth user
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("[delete-account] Failed to delete auth user:", deleteError.message);
      // Surface the real reason (e.g. a blocking FK) so it's diagnosable in-app.
      return res.status(500).json({ error: `Failed to delete account: ${deleteError.message}` });
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("[delete-account] Error:", err.message);
    return res.status(500).json({ error: "Something went wrong" });
  }
}
