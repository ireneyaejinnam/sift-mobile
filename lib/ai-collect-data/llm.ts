/**
 * llm.ts
 *
 * Vendor-agnostic LLM router for the AI data collection pipeline.
 *
 * Reads LLM_PROVIDER env var:
 *   'auto'    (default) — Claude for discovery (web search), OpenAI for everything else
 *   'claude'  — use Claude for all calls
 *   'openai'  — use OpenAI for all calls (discovery will lack web search)
 */

export type LLMProvider = 'auto' | 'claude' | 'openai';

export type PipelineStage = 'discovery' | 'enrich' | 'dedup' | 'hooks' | 'images';

export function getProvider(): LLMProvider {
  const env = (process.env.LLM_PROVIDER ?? 'auto').toLowerCase();
  if (env === 'claude' || env === 'openai') return env;
  return 'auto';
}

/**
 * Resolve which vendor to use for a given pipeline stage.
 */
export function resolveVendor(stage: PipelineStage): 'claude' | 'openai' {
  const provider = getProvider();
  if (provider === 'claude') return 'claude';
  if (provider === 'openai') return 'openai';

  // 'auto': Claude for discovery only, OpenAI for everything else
  if (stage === 'discovery') return 'claude';
  return 'openai';
}

/** Default models per vendor */
export const DEFAULT_MODELS = {
  claude: {
    discovery: 'claude-sonnet-4-6',
    enrich: 'claude-sonnet-4-6',
    dedup: 'claude-haiku-4-5-20251001',
    hooks: 'claude-haiku-4-5-20251001',
    images: 'claude-sonnet-4-6',
  },
  openai: {
    discovery: 'gpt-4o-mini', // not recommended (no web search)
    enrich: 'gpt-4o-mini',
    dedup: 'gpt-4o-mini',
    hooks: 'gpt-4o-mini',
    images: 'gpt-4o-mini',
  },
} as const;

/**
 * Get the default model for a stage based on current provider setting.
 */
export function getDefaultModel(stage: PipelineStage): string {
  const vendor = resolveVendor(stage);
  return DEFAULT_MODELS[vendor][stage];
}
