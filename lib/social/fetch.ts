/**
 * fetch.ts
 *
 * Fetches metadata from a URL by parsing Open Graph, JSON-LD, and Twitter card meta tags.
 * Works for public Instagram, TikTok, venue sites, and general event pages.
 */

export interface PostMetadata {
  title: string;
  description: string;
  image: string;
  author: string;
  url: string;
  raw_html_snippet: string;
}

/**
 * Detect platform from URL.
 */
export function detectPlatform(url: string): 'instagram' | 'tiktok' | 'other' {
  if (/instagram\.com|instagr\.am/i.test(url)) return 'instagram';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  return 'other';
}

function isPrivateUrl(urlStr: string): boolean {
  try {
    const h = new URL(urlStr).hostname.toLowerCase();
    return (
      h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' ||
      h === '::1' || h === '[::1]' ||
      h.startsWith('10.') || h.startsWith('172.') || h.startsWith('192.168.') ||
      h.startsWith('169.254.') || h.startsWith('fc') || h.startsWith('fd') ||
      h.endsWith('.internal') || h.endsWith('.local') ||
      /^\[.*\]$/.test(h)
    );
  } catch { return false; }
}

const EMPTY_META = (url: string): PostMetadata => ({
  title: '', description: '', image: '', author: '', url, raw_html_snippet: '',
});

const FETCH_HEADERS = {
  'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Fetch and parse metadata from a URL.
 * SSRF prevention: initial URL is validated in api/submit-event.ts before this is called.
 * Redirects are followed normally (needed for Instagram/TikTok).
 */
export async function fetchPostMetadata(url: string): Promise<PostMetadata> {
  if (isPrivateUrl(url)) return EMPTY_META(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: FETCH_HEADERS,
      redirect: 'follow',
    });
    clearTimeout(timer);

    if (!res.ok) return EMPTY_META(url);

    const html = await res.text();
    return parseHtmlMetadata(html, url);
  } catch {
    clearTimeout(timer);
    return EMPTY_META(url);
  }
}

/**
 * Parse metadata from raw HTML string.
 * Exported separately for unit testing with mocked HTML.
 */
export function parseHtmlMetadata(html: string, url: string): PostMetadata {
  const og = extractMetaContent(html, 'og:title');
  const ogDesc = extractMetaContent(html, 'og:description');
  const ogImage = extractMetaContent(html, 'og:image');
  const twTitle = extractMetaContent(html, 'twitter:title');
  const twDesc = extractMetaContent(html, 'twitter:description');
  const twImage = extractMetaContent(html, 'twitter:image');

  // HTML <title> fallback
  const htmlTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? '';

  // JSON-LD structured data
  const jsonLd = extractJsonLd(html);

  // Author from meta or JSON-LD
  const author =
    extractMetaContent(html, 'author') ||
    extractMetaContent(html, 'twitter:creator') ||
    jsonLd?.author?.name ||
    jsonLd?.organizer?.name ||
    '';

  // Strip HTML from the body for raw context (first 8K chars)
  const rawSnippet = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);

  return {
    title: og || twTitle || jsonLd?.name || htmlTitle,
    description: ogDesc || twDesc || jsonLd?.description || '',
    image: ogImage || twImage || jsonLd?.image || '',
    author,
    url,
    raw_html_snippet: rawSnippet,
  };
}

function extractMetaContent(html: string, property: string): string {
  // property="..." content="..."
  const propMatch = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRegex(property)}["'][^>]+content=["']([^"']+)["']`, 'i')
  );
  if (propMatch) return propMatch[1];

  // content="..." property="..." (reversed order)
  const revMatch = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapeRegex(property)}["']`, 'i')
  );
  return revMatch?.[1] ?? '';
}

function extractJsonLd(html: string): any {
  const blocks = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
  for (const m of blocks) {
    try {
      const data = JSON.parse(m[1]);
      // Return the first Event-type object found
      if (data['@type'] === 'Event' || data['@type'] === 'MusicEvent' || data['@type'] === 'TheaterEvent') {
        return data;
      }
      if (Array.isArray(data)) {
        const event = data.find((d: any) => d['@type']?.includes?.('Event'));
        if (event) return event;
      }
      if (data['@graph']) {
        const event = data['@graph'].find((d: any) => d['@type']?.includes?.('Event'));
        if (event) return event;
      }
      // Return any structured data as fallback
      if (!data['@type'] || data['@type'] === 'WebPage') continue;
      return data;
    } catch { /* skip malformed */ }
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
