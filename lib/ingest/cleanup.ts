import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function cleanupExpired(): Promise<void> {
  // Delete events whose end_date (or start_date if no end_date) passed more than 24h ago
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { error: endErr, count: endCount } = await supabase
    .from('events')
    .delete({ count: 'exact' })
    .not('end_date', 'is', null)
    .lt('end_date', cutoff);

  const { error: startErr, count: startCount } = await supabase
    .from('events')
    .delete({ count: 'exact' })
    .is('end_date', null)
    .lt('start_date', cutoff);

  if (endErr) console.error('[Cleanup] end_date delete error:', endErr.message);
  if (startErr) console.error('[Cleanup] start_date delete error:', startErr.message);

  const total = (endCount ?? 0) + (startCount ?? 0);
  console.log(`[Cleanup] Removed ${total} expired events`);
}

async function main() {
  await cleanupExpired();
}

import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}
