import { ModelMetadata } from './types';
import { OpenAICompatibleAdapter } from './openai';
import { POLLINATIONS_FALLBACK_MODELS } from './registry';

/**
 * Pollinations provider — a free multi-model gateway.
 *
 * One API key (free at https://enter.pollinations.ai, no credit card)
 * unlocks 40+ text models from OpenAI, Anthropic, Google, DeepSeek, Qwen,
 * xAI and others through a single OpenAI-compatible endpoint.
 *
 * The model catalog is fetched live from the Pollinations registry and
 * cached for 6 hours, so new models appear without code changes. A curated
 * static fallback keeps the provider working when the registry is
 * unreachable. Pricing is denominated in Pollen credits, not USD — cost
 * estimates intentionally return 0 so the UI shows "Unavailable" rather
 * than a fabricated dollar figure.
 */

export const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai';
const MODELS_URL = `${POLLINATIONS_BASE_URL}/v1/models`;
/**
 * OpenAI-compatible chat endpoint. Note: this is intentionally different
 * from the legacy text.pollinations.ai host — the full registry model keys
 * (e.g. "openai/gpt-5.4-nano") are only served by the v1 API on
 * gen.pollinations.ai, which requires the user's API key.
 */
export const POLLINATIONS_CHAT_BASE_URL = 'https://gen.pollinations.ai/v1';
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

export interface PollinationsTextModel {
  /** API model id, e.g. "openai/gpt-5.4-nano" (aliases also accepted). */
  modelKey: string;
  displayName: string;
  contextLength?: number;
  speed: 'fast' | 'medium' | 'slow';
}

let liveCache: { fetchedAt: number; models: PollinationsTextModel[] } | null = null;

/**
 * Live text-model catalog from the Pollinations registry.
 * Cached for 6h; falls back to the curated static list on any failure.
 */
export async function getPollinationsTextModels(): Promise<PollinationsTextModel[]> {
  if (liveCache && Date.now() - liveCache.fetchedAt < CATALOG_TTL_MS) {
    return liveCache.models;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(MODELS_URL, { signal: controller.signal });
      if (!res.ok) throw new Error(`registry responded HTTP ${res.status}`);
      const json: any = await res.json();
      const data = Array.isArray(json?.data) ? json.data : [];
      const models: PollinationsTextModel[] = [];
      for (const m of data) {
        if (m?.category !== 'text') continue;
        const id = typeof m.id === 'string' && m.id ? m.id : null;
        if (!id) continue;
        models.push({
          modelKey: id,
          displayName: typeof m.title === 'string' && m.title ? m.title : id,
          contextLength: typeof m.context_length === 'number' ? m.context_length : undefined,
          speed: 'medium',
        });
      }
      if (models.length === 0) throw new Error('registry returned no text models');
      liveCache = { fetchedAt: Date.now(), models };
      return models;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return liveCache?.models ?? POLLINATIONS_FALLBACK_MODELS;
  }
}

/** True for curated ids and any id seen in the live catalog cache. */
export function isPollinationsModelKey(modelKey: string): boolean {
  if (POLLINATIONS_FALLBACK_MODELS.some((m) => m.modelKey === modelKey)) return true;
  return liveCache?.models.some((m) => m.modelKey === modelKey) ?? false;
}

export class PollinationsAdapter extends OpenAICompatibleAdapter {
  readonly id = 'pollinations';
  readonly displayName = 'Pollinations';
  protected baseUrl = POLLINATIONS_CHAT_BASE_URL;

  /**
   * Pricing is denominated in Pollen credits, not USD. Returning 0 keeps
   * cost displays honest ("Unavailable") instead of fabricating dollars.
   */
  estimateCost(_inputTokens: number, _outputTokens: number, _model: string): number {
    return 0;
  }

  getModelMetadata(model: string): ModelMetadata {
    const base = super.getModelMetadata(model);
    const known =
      liveCache?.models.find((m) => m.modelKey === model) ??
      POLLINATIONS_FALLBACK_MODELS.find((m) => m.modelKey === model);
    return {
      ...base,
      providerId: this.id,
      displayName: known?.displayName ?? base.displayName,
      contextLength: known?.contextLength ?? base.contextLength,
      costPer1kInputUsd: undefined,
      costPer1kOutputUsd: undefined,
      speed: known?.speed ?? base.speed,
    };
  }
}
