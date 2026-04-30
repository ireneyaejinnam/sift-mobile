/**
 * extract.ts
 *
 * Extracts structured event data from post metadata using gpt-4o-mini
 * with Structured Outputs. Reuses the same OpenAI client and pattern
 * from lib/ai-collect-data/openai.ts.
 */

import { chatJSON } from '../ai-collect-data/openai';
import type { PostMetadata } from './fetch';

export interface ExtractedEvent {
  title: string;
  description: string;
  startDate: string;       // YYYY-MM-DD
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  venue: string | null;
  address: string | null;
  borough: string | null;
  price: number | null;
  priceLabel: string | null;
  category: string | null;
  ticketUrl: string | null;
  sourceUrl: string;
  imageUrl: string | null;
  confidence: number;      // 1-10
}

const EXTRACTION_SCHEMA = {
  name: 'event_extraction',
  schema: {
    type: 'object',
    properties: {
      is_event: { type: 'boolean' },
      title: { type: ['string', 'null'] },
      description: { type: ['string', 'null'] },
      start_date: { type: ['string', 'null'] },
      start_time: { type: ['string', 'null'] },
      end_date: { type: ['string', 'null'] },
      end_time: { type: ['string', 'null'] },
      venue: { type: ['string', 'null'] },
      address: { type: ['string', 'null'] },
      borough: { type: ['string', 'null'] },
      price: { type: ['number', 'null'] },
      price_label: { type: ['string', 'null'] },
      category: { type: ['string', 'null'] },
      ticket_url: { type: ['string', 'null'] },
      image_url: { type: ['string', 'null'] },
      confidence: { type: 'number' },
    },
    required: [
      'is_event', 'title', 'description', 'start_date', 'start_time',
      'end_date', 'end_time', 'venue', 'address', 'borough',
      'price', 'price_label', 'category', 'ticket_url', 'image_url', 'confidence',
    ],
    additionalProperties: false,
  },
} as const;

function buildExtractionPrompt(metadata: PostMetadata): string {
  const today = new Date().toISOString().split('T')[0];
  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  return `Today is ${dayOfWeek}, ${today}.

Extract event details from this social media post or event page. If this is not about a specific event, set is_event=false and confidence=0.

Title: ${metadata.title}
Description: ${metadata.description}
Author: ${metadata.author}
URL: ${metadata.url}
Image: ${metadata.image}

Page content:
${metadata.raw_html_snippet}

Rules:
- Anchor relative dates to today (${today}, ${dayOfWeek}). "This Friday" = the coming Friday. "Next week" = 7 days from today.
- start_date must be YYYY-MM-DD format
- NYC events only. borough must be one of: Manhattan, Brooklyn, Queens, Bronx, Staten Island
- confidence 1-10: how sure you are this is a real, specific, upcoming NYC event
  - 10: confirmed event with date, venue, and details
  - 7-9: likely event, most fields identifiable
  - 5-6: probably an event but missing key details
  - 2-4: might be an event, very uncertain
  - 0-1: not an event (meme, selfie, ad, general post)
- price: numeric value in dollars, 0 if free, null if unknown
- price_label: human-readable ("Free", "$25", "$15-30", "See tickets")
- For Instagram/TikTok posts: extract from caption, link in bio context, and any visible text
- category must match one of the valid categories exactly`;
}

/**
 * Extract event details from post metadata via gpt-4o-mini.
 * DO NOT call without explicit approval — each call costs ~$0.001.
 */
export async function extractEventFromPost(metadata: PostMetadata): Promise<ExtractedEvent> {
  const result = await chatJSON<{
    is_event: boolean;
    title: string | null;
    description: string | null;
    start_date: string | null;
    start_time: string | null;
    end_date: string | null;
    end_time: string | null;
    venue: string | null;
    address: string | null;
    borough: string | null;
    price: number | null;
    price_label: string | null;
    category: string | null;
    ticket_url: string | null;
    image_url: string | null;
    confidence: number;
  }>(
    'gpt-4o-mini',
    [
      {
        role: 'system',
        content: 'You extract structured event data from social media posts and event pages. Return accurate details only — do not guess. If unsure about a field, return null.',
      },
      { role: 'user', content: buildExtractionPrompt(metadata) },
    ],
    EXTRACTION_SCHEMA
  );

  if (!result.is_event || result.confidence <= 1) {
    return {
      title: result.title ?? '',
      description: result.description ?? '',
      startDate: result.start_date ?? '',
      startTime: null,
      endDate: null,
      endTime: null,
      venue: null,
      address: null,
      borough: null,
      price: null,
      priceLabel: null,
      category: null,
      ticketUrl: null,
      sourceUrl: metadata.url,
      imageUrl: metadata.image || null,
      confidence: result.confidence,
    };
  }

  return {
    title: result.title ?? '',
    description: result.description ?? '',
    startDate: result.start_date ?? '',
    startTime: result.start_time,
    endDate: result.end_date,
    endTime: result.end_time,
    venue: result.venue,
    address: result.address,
    borough: result.borough,
    price: result.price,
    priceLabel: result.price_label,
    category: result.category,
    ticketUrl: result.ticket_url,
    sourceUrl: metadata.url,
    imageUrl: result.image_url || metadata.image || null,
    confidence: result.confidence,
  };
}
