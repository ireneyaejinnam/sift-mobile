import 'dotenv/config';
import { normalizeEvent } from './normalize';
import { upsertEvents } from './upsert';
import { SiftEvent } from './schema';

/**
 * The Skint scraper — daily email of free/cheap NYC events.
 * Scrapes their archive page for structured event data.
 * Expected yield: 30-50 events
 */

const ARCHIVE_URL = 'https://theskint.com/';

export async function ingestTheSkint(): Promise<void> {
  console.log('[TheSkint] Starting ingest...');
  const allEvents: SiftEvent[] = [];

  try {
    const res = await fetch(ARCHIVE_URL, {
      headers: {
        'User-Agent': 'Sift/1.0 (event discovery)',
        Accept: 'text/html',
      },
    });

    if (!res.ok) {
      console.error(`[TheSkint] HTTP ${res.status}`);
      return;
    }

    const html = await res.text();

    // The Skint typically has structured event blocks.
    // Look for JSON-LD first
    const ldBlocks = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
    );
    if (ldBlocks) {
      for (const block of ldBlocks) {
        try {
          const jsonStr = block.replace(/<\/?script[^>]*>/g, '');
          const data = JSON.parse(jsonStr);
          const items = Array.isArray(data) ? data : [data];

          for (const item of items) {
            if (item['@type'] === 'Event') {
              const category = guessCategory(item.name || '', item.description || '');
              const normalized = normalizeEvent({
                source: 'theskint',
                source_id: `skint-${item.name?.replace(/\s+/g, '-').toLowerCase().slice(0, 50)}`,
                title: item.name,
                description: item.description,
                category,
                start_date: item.startDate,
                end_date: item.endDate,
                venue_name: item.location?.name,
                address: item.location?.address?.streetAddress,
                borough: inferBorough(
                  item.location?.address?.addressLocality || ''
                ),
                price_min: item.offers?.price
                  ? parseFloat(item.offers.price)
                  : 0,
                is_free:
                  item.isAccessibleForFree === true ||
                  !item.offers?.price ||
                  item.offers.price === '0',
                event_url: item.url || ARCHIVE_URL,
                ticket_url: item.offers?.url,
                image_url:
                  typeof item.image === 'string'
                    ? item.image
                    : item.image?.[0],
                tags: ['free', 'cheap', 'theskint'],
              });
              if (normalized) allEvents.push(normalized);
            }
          }
        } catch {
          // skip malformed
        }
      }
    }

    // Fallback: parse event blocks from HTML content
    // The Skint typically uses <strong> for event titles and structured text
    if (allEvents.length < 5) {
      const eventBlocks = extractEventBlocks(html);
      for (const block of eventBlocks) {
        if (block.title && block.date) {
          const category = guessCategory(block.title, block.description || '');
          const normalized = normalizeEvent({
            source: 'theskint',
            source_id: `skint-html-${block.title.replace(/\s+/g, '-').toLowerCase().slice(0, 50)}`,
            title: block.title,
            description: block.description,
            category,
            start_date: block.date,
            venue_name: block.venue,
            address: block.address,
            borough: inferBorough(block.address || block.venue || ''),
            price_min: 0,
            is_free: true,
            event_url: block.url || ARCHIVE_URL,
            tags: ['free', 'cheap', 'theskint'],
          });
          if (normalized) allEvents.push(normalized);
        }
      }
    }
  } catch (e) {
    console.error('[TheSkint] Error:', e);
  }

  console.log(`[TheSkint] Fetched ${allEvents.length} events total`);
  if (allEvents.length > 0) {
    const result = await upsertEvents(allEvents);
    console.log(`[TheSkint] Upserted: ${result.inserted}, Errors: ${result.errors}`);
  }
}

interface EventBlock {
  title: string;
  description?: string;
  date?: string;
  venue?: string;
  address?: string;
  url?: string;
}

function extractEventBlocks(html: string): EventBlock[] {
  const blocks: EventBlock[] = [];

  // Look for patterns like <strong>EVENT TITLE</strong> followed by details
  const strongPattern = /<strong[^>]*>([^<]+)<\/strong>/gi;
  let match;

  while ((match = strongPattern.exec(html)) !== null) {
    const title = match[1].trim();
    // Skip navigation elements, headers, etc.
    if (
      title.length < 10 ||
      title.length > 200 ||
      title.toLowerCase().includes('subscribe') ||
      title.toLowerCase().includes('newsletter')
    ) {
      continue;
    }

    // Get surrounding text for context
    const contextStart = Math.max(0, match.index - 100);
    const contextEnd = Math.min(html.length, match.index + match[0].length + 500);
    const context = html.slice(contextStart, contextEnd).replace(/<[^>]*>/g, ' ').trim();

    // Try to extract a date from context
    const dateMatch = context.match(
      /(\d{1,2}\/\d{1,2}\/\d{2,4})|(\w+ \d{1,2},? \d{4})|(\d{4}-\d{2}-\d{2})/
    );

    // Try to extract a URL from nearby <a> tags
    const urlMatch = html
      .slice(match.index, match.index + 500)
      .match(/href="(https?:\/\/[^"]+)"/);

    blocks.push({
      title,
      description: context.slice(0, 200),
      date: dateMatch
        ? normalizeDate(dateMatch[0])
        : new Date().toISOString().split('T')[0], // default to today
      url: urlMatch?.[1],
    });
  }

  return blocks.slice(0, 50); // cap at 50 events
}

function normalizeDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch {}
  return new Date().toISOString().split('T')[0];
}

function guessCategory(title: string, desc: string): string {
  const text = `${title} ${desc}`.toLowerCase();
  if (text.includes('music') || text.includes('concert') || text.includes('jazz') || text.includes('dj')) return 'live_music';
  if (text.includes('art') || text.includes('exhibit') || text.includes('gallery') || text.includes('museum')) return 'art';
  if (text.includes('comedy') || text.includes('improv') || text.includes('stand-up')) return 'comedy';
  if (text.includes('food') || text.includes('tasting') || text.includes('cook')) return 'food';
  if (text.includes('outdoor') || text.includes('park') || text.includes('garden') || text.includes('walk')) return 'outdoors';
  if (text.includes('fitness') || text.includes('yoga') || text.includes('run')) return 'fitness';
  if (text.includes('theater') || text.includes('theatre') || text.includes('play')) return 'theater';
  if (text.includes('workshop') || text.includes('class') || text.includes('lecture')) return 'workshops';
  if (text.includes('popup') || text.includes('pop-up') || text.includes('market') || text.includes('sample sale')) return 'popups';
  if (text.includes('night') || text.includes('bar') || text.includes('club')) return 'nightlife';
  return 'art'; // The Skint leans heavily arts/culture
}

function inferBorough(address: string): string | undefined {
  const lower = address.toLowerCase();
  if (lower.includes('brooklyn')) return 'Brooklyn';
  if (lower.includes('queens')) return 'Queens';
  if (lower.includes('bronx')) return 'Bronx';
  if (lower.includes('staten island')) return 'Staten Island';
  if (lower.includes('manhattan') || lower.includes('new york')) return 'Manhattan';
  return undefined;
}

if (require.main === module) {
  ingestTheSkint().catch(console.error);
}
