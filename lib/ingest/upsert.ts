import { createClient } from '@supabase/supabase-js';
import { SiftEvent } from './schema';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function upsertEvents(events: SiftEvent[]): Promise<{ inserted: number; errors: number }> {
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < events.length; i += 50) {
    const batch = events.slice(i, i + 50);
    const { error } = await supabase
      .from('events')
      .upsert(batch, { onConflict: 'source,source_id' });

    if (error) {
      console.error(`Upsert error at batch ${i}:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  return { inserted, errors };
}
