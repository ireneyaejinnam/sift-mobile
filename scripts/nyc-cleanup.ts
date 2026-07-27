/**
 * One-off cleanup: suppress non-NYC events already in the DB.
 *
 * The old ingest defaulted unknown-location events (and some non-NYC ones, e.g. a
 * Baltimore event) to borough "Manhattan", so the borough query guard can't catch
 * them. This scans active events and suppresses any whose address/location shows a
 * clear non-NYC signal (per isNYCAddress).
 *
 * Usage:
 *   npx tsx scripts/nyc-cleanup.ts --dry-run   # list offenders, change nothing
 *   npx tsx scripts/nyc-cleanup.ts             # suppress them
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { isNYCAddress } from "../lib/ingest/normalize";
import { extractBoroughFromCoords } from "../lib/ingest/nycBounds";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "[nyc-cleanup] Missing SUPABASE_URL / SUPABASE_SERVICE_KEY.\n" +
    "Add them to .env (already git-ignored) or run:\n" +
    "  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npx tsx scripts/nyc-cleanup.ts --dry-run"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const { data, error } = await supabase
    .from("events")
    .select("id, title, address, venue_name, borough, latitude, longitude")
    .neq("is_suppressed", true)
    .limit(20000);

  if (error) {
    console.error("[nyc-cleanup] fetch error:", error.message);
    process.exit(1);
  }

  const offenders = (data ?? []).filter((e: any) => {
    const lat = e.latitude as number | null;
    const lng = e.longitude as number | null;
    // Coordinates are authoritative when present: flag only if outside all NYC
    // bounding boxes (and never second-guess them with the fuzzy address text —
    // that mis-flags NYC streets like "East Houston St").
    if (lat != null && lng != null) {
      return extractBoroughFromCoords(lat, lng) === null;
    }
    // No coords — fall back to the address/venue text check.
    const addr = (e.address as string) || (e.venue_name as string) || "";
    return !!addr && !isNYCAddress(addr);
  });

  console.log(`[nyc-cleanup] ${offenders.length} non-NYC events found (of ${data?.length ?? 0} active).`);
  for (const o of offenders) {
    console.log(`  - "${o.title}" | ${o.address ?? o.venue_name} | borough=${o.borough} | (${o.latitude},${o.longitude})`);
  }

  if (dryRun) {
    console.log("[nyc-cleanup] dry run — no changes made.");
    return;
  }

  const ids = offenders.map((o: any) => o.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { error: upErr } = await supabase
      .from("events")
      .update({ is_suppressed: true })
      .in("id", ids.slice(i, i + 100));
    if (upErr) console.error("[nyc-cleanup] update error:", upErr.message);
  }
  console.log(`[nyc-cleanup] suppressed ${ids.length} non-NYC events.`);
}

main();
