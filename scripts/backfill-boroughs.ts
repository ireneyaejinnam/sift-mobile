/**
 * backfill-boroughs.ts
 *
 * Finds events with null borough but valid lat/lng coordinates,
 * and assigns the NYC borough using coordinate bounding boxes.
 * Events outside NYC bounds are left as-is (null borough).
 *
 * Usage:
 *   npx tsx scripts/backfill-boroughs.ts          # live run
 *   npx tsx scripts/backfill-boroughs.ts --dry-run # preview only
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { extractBoroughFromCoords } from "../lib/ingest/nycBounds";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const dryRun = process.argv.includes("--dry-run");

async function main() {
  // Fetch events with null borough but valid coordinates
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title, latitude, longitude, borough, address")
    .is("borough", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (error) {
    console.error("Failed to fetch events:", error.message);
    process.exit(1);
  }

  if (!events?.length) {
    console.log("No events with null borough and valid coordinates.");
    return;
  }

  console.log(`Found ${events.length} events with null borough + coordinates.\n`);

  let updated = 0;
  let skipped = 0;

  for (const event of events) {
    const borough = extractBoroughFromCoords(event.latitude, event.longitude);
    if (!borough) {
      if (dryRun) {
        console.log(`  SKIP (outside NYC): ${event.title} [${event.latitude}, ${event.longitude}]`);
      }
      skipped++;
      continue;
    }

    console.log(`  ${dryRun ? "WOULD SET" : "SET"}: "${event.title}" → ${borough}`);

    if (!dryRun) {
      const { error: updateError } = await supabase
        .from("events")
        .update({ borough })
        .eq("id", event.id);

      if (updateError) {
        console.error(`    ERROR updating ${event.id}: ${updateError.message}`);
        continue;
      }
    }
    updated++;
  }

  console.log(`\nDone. ${updated} ${dryRun ? "would be" : ""} updated, ${skipped} outside NYC bounds.`);
}

main();
