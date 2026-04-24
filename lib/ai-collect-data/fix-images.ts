/**
 * fix-images.ts
 *
 * Resolves a valid image URL for an event using a three-stage fallback:
 *   1. og:image — scrape the event_url page
 *   2. LLM (gpt-5.4-mini by default) — ask the model to find an image URL
 *   3. Unsplash — search by event title keywords
 *
 * Export: resolveImage(event, model?) → string | null
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function isImageUrlValid(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function ogImageFromUrl(eventUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(eventUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function llmFindImage(
  title: string,
  eventUrl: string | null,
  model: string
): Promise<string | null> {
  const urlLine = eventUrl ? `\nEvent URL: ${eventUrl}` : '';
  const prompt = `Find a direct image URL (.jpg, .jpeg, .png, or .webp) for this NYC event. The image should be a real, publicly accessible photo related to the event or venue.

Event: ${title}${urlLine}

Reply with ONLY the image URL, nothing else. If you cannot find one, reply with "none".`;

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 256,
      system: 'You are a helpful assistant. Reply with only a direct image URL or "none".',
      tools: [{ type: 'web_search_20250305', name: 'web_search' as const }],
      messages: [{ role: 'user', content: prompt }],
    });
    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
    const text = textBlocks.map(b => b.text).join('').trim();
    if (!text || text.toLowerCase() === 'none') return null;
    // Extract URL if model added extra text
    const match = text.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp)(\?\S*)?/i);
    return match ? match[0] : (text.startsWith('http') ? text : null);
  } catch (err) {
    console.warn(`[fix-images] LLM error for "${title}":`, (err as Error).message);
    return null;
  }
}

async function unsplashFindImage(title: string): Promise<string | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  const query = encodeURIComponent(title.replace(/[^\w\s]/g, ' ').trim().slice(0, 60));
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${key}` } }
    );
    const data = await res.json() as any;
    return data?.results?.[0]?.urls?.regular ?? null;
  } catch {
    return null;
  }
}

export async function resolveImage(
  event: { title: string; image_url?: string | null; event_url?: string | null },
  model = 'claude-sonnet-4-6'
): Promise<string | null> {
  const { title, image_url, event_url } = event;

  // Already valid
  if (image_url && await isImageUrlValid(image_url)) return image_url;

  console.log(`[fix-images] Resolving image for: "${title}"`);

  // Stage 1: og:image from event_url
  if (event_url) {
    const og = await ogImageFromUrl(event_url);
    if (og && await isImageUrlValid(og)) {
      console.log(`[fix-images] og:image: ${og}`);
      return og;
    }
  }

  // Stage 2: LLM
  const llm = await llmFindImage(title, event_url ?? null, model);
  if (llm && await isImageUrlValid(llm)) {
    console.log(`[fix-images] LLM image: ${llm}`);
    return llm;
  }

  // Stage 3: Unsplash
  const unsplash = await unsplashFindImage(title);
  if (unsplash) {
    console.log(`[fix-images] Unsplash image: ${unsplash}`);
    return unsplash;
  }

  console.log(`[fix-images] No valid image found for: "${title}"`);
  return null;
}
