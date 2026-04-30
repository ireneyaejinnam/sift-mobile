/**
 * openai.ts
 *
 * Shared OpenAI client and helpers for the AI data collection pipeline.
 * Uses Structured Outputs (response_format: json_schema) for guaranteed valid JSON.
 */

import OpenAI from 'openai';

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export const MODELS = {
  fast: 'gpt-4o-mini' as const,
  standard: 'gpt-4o-mini' as const,
} as const;

/**
 * Call OpenAI with Structured Outputs (json_schema response_format).
 * Returns the parsed JSON object directly.
 */
export async function chatJSON<T = unknown>(
  model: string,
  messages: OpenAI.ChatCompletionMessageParam[],
  schema: {
    name: string;
    schema: Record<string, unknown>;
  }
): Promise<T> {
  const response = await openai.chat.completions.create({
    model,
    messages,
    response_format: {
      type: 'json_schema' as const,
      json_schema: {
        name: schema.name,
        strict: true,
        schema: schema.schema,
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty content');
  return JSON.parse(content) as T;
}

/**
 * Simple text completion (no structured output).
 */
export async function chatText(
  model: string,
  messages: OpenAI.ChatCompletionMessageParam[]
): Promise<string> {
  const response = await openai.chat.completions.create({
    model,
    messages,
    max_tokens: 256,
  });
  return response.choices[0]?.message?.content?.trim() ?? '';
}
