import { normalizeEvent } from './normalize';
import { upsertEvents } from './upsert';
import { SiftEvent } from './schema';

/**
 * Resident Advisor scraper — electronic music, DJ sets, club nights.
 * Scrapes public listing pages (no API key needed).
 * Expected yield: 30-60 events
 */

const LISTING_URL = 'https://ra.co/graphql';

export async function ingestResidentAdvisor(): Promise<void> {
  console.log('[RA] Starting ingest...');
  const allEvents: SiftEvent[] = [];

  try {
    // RA uses a GraphQL API — try the public query
    const query = {
      query: `
        query GET_POPULAR_EVENTS($filters: FilterInputDtoInput) {
          eventListings(filters: $filters, pageSize: 50) {
            data {
              event {
                id
                title
                date
                startTime
                endTime
                contentUrl
                flyerFront
                isTicketed
                cost
                venue {
                  name
                  address
                  area {
                    name
                  }
                }
                pick {
                  blurb
                }
              }
            }
          }
        }
      `,
      variables: {
        filters: {
          areas: { eq: 8 }, // New York area ID
          listing_date: {
            gte: new Date().toISOString().split('T')[0],
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
          },
        },
      },
    };

    const res = await fetch(LISTING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Sift/1.0 (event discovery)',
        Referer: 'https://ra.co/events/us/newyork',
      },
      body: JSON.stringify(query),
    });

    if (!res.ok) {
      console.warn(`[RA] GraphQL returned ${res.status}, trying HTML fallback...`);
      await scrapeRAHtml(allEvents);
    } else {
      const json = await res.json();
      const listings = json?.data?.eventListings?.data ?? [];

      for (const listing of listings) {
        const ev = listing.event;
        if (!ev) continue;

        const normalized = normalizeEvent({
          source: 'resident_advisor',
          source_id: String(ev.id),
          title: ev.title,
          description: ev.pick?.blurb || undefined,
          category: 'live_music',
          start_date: ev.date || ev.startTime,
          end_date: ev.endTime || undefined,
          venue_name: ev.venue?.name,
          address: ev.venue?.address,
          borough: inferBorough(ev.venue?.area?.name, ev.venue?.address),
          price_min: ev.cost ? parseCost(ev.cost) : undefined,
          is_free: ev.cost === 'Free' || ev.cost === '0',
          ticket_url: ev.contentUrl
            ? `https://ra.co${ev.contentUrl}`
            : undefined,
          event_url: ev.contentUrl
            ? `https://ra.co${ev.contentUrl}`
            : undefined,
          image_url: ev.flyerFront,
          tags: ['electronic', 'dj', 'club'].filter(Boolean),
        });

        if (normalized) allEvents.push(normalized);
      }
    }
  } catch (e) {
    console.error('[RA] Error:', e);
    // Try HTML fallback
    await scrapeRAHtml(allEvents);
  }

  console.log(`[RA] Fetched ${allEvents.length} events total`);
  if (allEvents.length > 0) {
    const result = await upsertEvents(allEvents);
    console.log(`[RA] Upserted: ${result.inserted}, Errors: ${result.errors}`);
  }
}

async function scrapeRAHtml(allEvents: SiftEvent[]): Promise<void> {
  try {
    const res = await fetch('https://ra.co/events/us/newyork', {
      headers: {
        'User-Agent': 'Sift/1.0 (event discovery)',
        Accept: 'text/html',
      },
    });

    if (!res.ok) {
      console.error(`[RA] HTML scrape failed: ${res.status}`);
      return;
    }

    const html = await res.text();

    // Extract JSON-LD structured data
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
            if (
              item['@type'] === 'Event' ||
              item['@type'] === 'MusicEvent' ||
              item['@type'] === 'DanceEvent'
            ) {
              const normalized = normalizeEvent({
                source: 'resident_advisor',
                source_id: `ra-${item.name?.replace(/\s+/g, '-').toLowerCase().slice(0, 50)}`,
                title: item.name,
                description: item.description,
                category: 'live_music',
                start_date: item.startDate,
                end_date: item.endDate,
                venue_name: item.location?.name,
                address: item.location?.address?.streetAddress,
                borough: inferBorough(
                  item.location?.address?.addressLocality,
                  item.location?.address?.streetAddress
                ),
                price_min: item.offers?.price
                  ? parseFloat(item.offers.price)
                  : undefined,
                is_free: item.isAccessibleForFree === true,
                ticket_url: item.offers?.url || item.url,
                event_url: item.url,
                image_url:
                  typeof item.image === 'string'
                    ? item.image
                    : item.image?.[0],
                tags: ['electronic', 'ra'],
              });
              if (normalized) allEvents.push(normalized);
            }
          }
        } catch {
          // skip malformed
        }
      }
    }
  } catch (e) {
    console.error('[RA] HTML scrape error:', e);
  }
}

function parseCost(cost: string): number {
  if (!cost) return 0;
  const num = parseFloat(cost.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? 0 : num;
}

function inferBorough(area?: string, address?: string): string | undefined {
  const text = `${area || ''} ${address || ''}`.toLowerCase();
  if (text.includes('brooklyn')) return 'Brooklyn';
  if (text.includes('queens')) return 'Queens';
  if (text.includes('bronx')) return 'Bronx';
  if (text.includes('staten island')) return 'Staten Island';
  return 'Manhattan';
}

if (require.main === module) {
  ingestResidentAdvisor().catch(console.error);
}
