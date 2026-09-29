import { AIProvider } from './types';
import { OpenAIAdapter } from './openai';
import { AnthropicAdapter } from './anthropic';
import { GeminiAdapter } from './gemini';
import { MistralAdapter } from './mistral';
import { LlamaAdapter } from './llama';
import { PerplexityAdapter } from './perplexity';
import {
  PollinationsAdapter,
  isPollinationsModelKey,
} from './pollinations';
import type { PollinationsTextModel } from './pollinations';

/**
 * Curated Pollinations fallback catalog — used when the live registry
 * cannot be reached. Lives here (not in pollinations.ts) so the static
 * MODEL_CATALOG below can spread it at module load without a
 * circular-import initialization cycle.
 */
export const POLLINATIONS_FALLBACK_MODELS: PollinationsTextModel[] = [
  { modelKey: 'openai/gpt-5.4-nano', displayName: 'GPT-5.4 Nano', contextLength: 400000, speed: 'fast' },
  { modelKey: 'openai/gpt-5.3-codex', displayName: 'GPT-5.3 Codex', contextLength: 400000, speed: 'medium' },
  { modelKey: 'anthropic/claude-opus-5.5', displayName: 'Claude Opus 5.5', contextLength: 1000000, speed: 'medium' },
  { modelKey: 'deepseek/deepseek-v4.1-flash', displayName: 'DeepSeek V4.1 Flash', contextLength: 1048576, speed: 'fast' },
  { modelKey: 'qwen/qwen3.8-flash', displayName: 'Qwen 3.8 Flash', contextLength: 1000000, speed: 'fast' },
  { modelKey: 'x-ai/grok-4.7', displayName: 'Grok 4.7', contextLength: 500000, speed: 'medium' },
];

export interface ProviderDefinition {
  id: string;
  displayName: string;
  docsUrl: string;
  /** Human hint shown next to the key input, e.g. "sk-…" */
  keyHint: string;
  /** Short marketing-style description for the provider card. */
  description: string;
  /** Lightweight format check applied before storing. */
  keyPattern?: RegExp;
  minKeyLength: number;
}

export interface ModelCatalogEntry {
  providerId: string;
  modelKey: string;
  displayName: string;
  contextLength?: number;
  costPer1kInputUsd?: number;
  costPer1kOutputUsd?: number;
  speed: 'fast' | 'medium' | 'slow';
}

export const PROVIDERS: ProviderDefinition[] = [
  // Default recommended gateway: one free key unlocks 40+ models.
  {
    id: 'pollinations',
    displayName: 'Pollinations',
    docsUrl: 'https://enter.pollinations.ai/api/docs',
    keyHint: 'sk_… / pk_…',
    description: 'One free key for 40+ models from OpenAI, Anthropic, Google, DeepSeek, Qwen and more — routed through Pollinations.',
    minKeyLength: 12,
  },
  { id: 'openai', displayName: 'OpenAI', docsUrl: 'https://platform.openai.com/docs', keyHint: 'sk-…', description: 'GPT models via the official OpenAI API.', keyPattern: /^sk-[A-Za-z0-9-_]{16,}$/, minKeyLength: 20 },
  { id: 'anthropic', displayName: 'Anthropic', docsUrl: 'https://docs.anthropic.com', keyHint: 'sk-ant-…', description: 'Claude models via the official Anthropic API.', keyPattern: /^sk-ant-[A-Za-z0-9-_]{16,}$/, minKeyLength: 20 },
  { id: 'gemini', displayName: 'Google Gemini', docsUrl: 'https://ai.google.dev/docs', keyHint: 'AIza…', description: 'Gemini models via the Google AI API.', keyPattern: /^AIza[A-Za-z0-9-_]{30,}$/, minKeyLength: 30 },
  { id: 'mistral', displayName: 'Mistral', docsUrl: 'https://docs.mistral.ai', keyHint: '…', description: 'Mistral models via the official Mistral API.', minKeyLength: 16 },
  { id: 'llama', displayName: 'Meta Llama', docsUrl: 'https://www.llama.com/docs', keyHint: 'gsk_… / provider key', description: 'Llama models via an OpenAI-compatible endpoint.', minKeyLength: 16 },
  { id: 'perplexity', displayName: 'Perplexity', docsUrl: 'https://docs.perplexity.ai', keyHint: 'pplx-…', description: 'Sonar models via the official Perplexity API.', keyPattern: /^pplx-[A-Za-z0-9]{16,}$/, minKeyLength: 20 },
];

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  // Pollinations routed models — no USD pricing (Pollen credits), so the UI
  // shows "Unavailable" for cost instead of a fabricated figure.
  ...POLLINATIONS_FALLBACK_MODELS.map((m) => ({
    providerId: 'pollinations',
    modelKey: m.modelKey,
    displayName: m.displayName,
    contextLength: m.contextLength,
    speed: m.speed,
  })),
  { providerId: 'openai', modelKey: 'gpt-4o-mini', displayName: 'GPT-4o mini', contextLength: 128000, costPer1kInputUsd: 0.00015, costPer1kOutputUsd: 0.0006, speed: 'fast' },
  { providerId: 'openai', modelKey: 'gpt-4o', displayName: 'GPT-4o', contextLength: 128000, costPer1kInputUsd: 0.0025, costPer1kOutputUsd: 0.01, speed: 'medium' },
  { providerId: 'anthropic', modelKey: 'claude-3-5-haiku', displayName: 'Claude 3.5 Haiku', contextLength: 200000, costPer1kInputUsd: 0.0008, costPer1kOutputUsd: 0.004, speed: 'fast' },
  { providerId: 'anthropic', modelKey: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet', contextLength: 200000, costPer1kInputUsd: 0.003, costPer1kOutputUsd: 0.015, speed: 'medium' },
  { providerId: 'gemini', modelKey: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', contextLength: 1000000, costPer1kInputUsd: 0.000075, costPer1kOutputUsd: 0.0003, speed: 'fast' },
  { providerId: 'gemini', modelKey: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', contextLength: 2000000, costPer1kInputUsd: 0.00125, costPer1kOutputUsd: 0.005, speed: 'medium' },
  { providerId: 'mistral', modelKey: 'mistral-small', displayName: 'Mistral Small', contextLength: 32000, costPer1kInputUsd: 0.0002, costPer1kOutputUsd: 0.0006, speed: 'fast' },
  { providerId: 'mistral', modelKey: 'mistral-large', displayName: 'Mistral Large', contextLength: 128000, costPer1kInputUsd: 0.002, costPer1kOutputUsd: 0.006, speed: 'medium' },
  { providerId: 'llama', modelKey: 'llama-3.3-70b', displayName: 'Llama 3.3 70B', contextLength: 128000, costPer1kInputUsd: 0.00059, costPer1kOutputUsd: 0.00079, speed: 'medium' },
  { providerId: 'perplexity', modelKey: 'sonar', displayName: 'Sonar', contextLength: 127072, costPer1kInputUsd: 0.001, costPer1kOutputUsd: 0.001, speed: 'fast' },
  { providerId: 'perplexity', modelKey: 'sonar-pro', displayName: 'Sonar Pro', contextLength: 200000, costPer1kInputUsd: 0.003, costPer1kOutputUsd: 0.015, speed: 'medium' },
];

export function getProviderDefinition(providerId: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === providerId);
}

export function getModelEntry(modelKey: string): ModelCatalogEntry | undefined {
  return MODEL_CATALOG.find((m) => m.modelKey === modelKey);
}

export function getProviderIdForModel(modelKey: string): string | undefined {
  return (
    getModelEntry(modelKey)?.providerId ??
    (isPollinationsModelKey(modelKey) ? 'pollinations' : undefined)
  );
}

/** Lightweight API-key format validation. Returns an issue string or null. */
export function validateKeyFormat(providerId: string, key: string): string | null {
  const def = getProviderDefinition(providerId);
  if (!def) return `Unknown provider "${providerId}".`;
  const trimmed = key.trim();
  if (trimmed.length < def.minKeyLength) {
    return `The key looks too short for ${def.displayName} (expected at least ${def.minKeyLength} characters).`;
  }
  if (def.keyPattern && !def.keyPattern.test(trimmed)) {
    return `The key does not match the expected ${def.displayName} format (${def.keyHint}).`;
  }
  return null;
}

/**
 * Resolves an AIProvider for a provider id.
 * Throws when the provider id is unknown or no API key is supplied —
 * production has no mock/demo fallback.
 */
export function resolveProvider(providerId: string, apiKey: string): AIProvider {
  if (!apiKey) {
    throw new Error(`No API key configured for provider "${providerId}". Add it in Provider Setup.`);
  }
  switch (providerId) {
    case 'pollinations': return new PollinationsAdapter(apiKey);
    case 'openai': return new OpenAIAdapter(apiKey);
    case 'anthropic': return new AnthropicAdapter(apiKey);
    case 'gemini': return new GeminiAdapter(apiKey);
    case 'mistral': return new MistralAdapter(apiKey);
    case 'llama': return new LlamaAdapter(apiKey);
    case 'perplexity': return new PerplexityAdapter(apiKey);
    default: throw new Error(`Unknown provider: "${providerId}".`);
  }
}

/** Resolve a provider for a specific catalog model key. Throws on unknown keys. */
export function resolveProviderForModel(modelKey: string, apiKey: string): AIProvider {
  const providerId = getProviderIdForModel(modelKey);
  if (!providerId) {
    throw new Error(`Unknown model: "${modelKey}".`);
  }
  return resolveProvider(providerId, apiKey);
}
