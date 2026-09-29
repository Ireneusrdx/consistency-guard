/**
 * Live model discovery.
 *
 * The static MODEL_CATALOG only carries a couple of predefined models per
 * provider. When the user has configured an API key for a provider, the
 * evaluate screen should show ALL of that company's models — fetched live
 * from the provider's own model-list endpoint with the user's key — instead
 * of the small predefined list.
 *
 * The key is only ever used server-side (Authorization header) and is never
 * logged or returned. Results are cached per user+provider for 10 minutes so
 * page loads don't hammer provider APIs.
 */

export interface LiveModel {
  modelKey: string;
  displayName: string;
  contextLength?: number;
  speed: 'fast' | 'medium' | 'slow';
}

const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 10 * 60 * 1_000;
const MAX_MODELS = 120;

interface CacheEntry {
  fetchedAt: number;
  models: LiveModel[] | null;
}

/** userId:providerId -> entry. Null means "unsupported or last fetch failed". */
const cache = new Map<string, CacheEntry>();

async function fetchJson(url: string, headers: Record<string, string>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** "gpt-4o-mini" -> "GPT-4o Mini", "llama-3.3-70b-versatile" -> "Llama-3.3-70b Versatile" */
function prettifyModelId(id: string): string {
  return id
    .split(/([-_])/)
    .map((part, i) => {
      if (i % 2 === 1) return ' ';
      if (/^gpt$/i.test(part)) return 'GPT';
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupe(models: LiveModel[]): LiveModel[] {
  const seen = new Set<string>();
  return models.filter((m) => {
    if (!m.modelKey || seen.has(m.modelKey)) return false;
    seen.add(m.modelKey);
    return true;
  });
}

/**
 * OpenAI-compatible /models list (OpenAI, Mistral, Groq/Llama).
 * Response shape: { data: [{ id }] }.
 */
async function fetchOpenAICompatibleModels(
  baseUrl: string,
  apiKey: string,
  exclude: RegExp,
): Promise<LiveModel[]> {
  const json = await fetchJson(`${baseUrl}/models`, { Authorization: `Bearer ${apiKey}` });
  const data = Array.isArray(json?.data) ? json.data : [];
  const models: LiveModel[] = [];
  for (const m of data) {
    const id = typeof m?.id === 'string' && m.id ? m.id : null;
    if (!id || exclude.test(id)) continue;
    models.push({ modelKey: id, displayName: prettifyModelId(id), speed: 'medium' });
  }
  return dedupe(models).slice(0, MAX_MODELS);
}

const OPENAI_EXCLUDE =
  /embedding|dall-e|whisper|tts|audio|realtime|transcribe|moderation|babbage|davinci|instruct/i;

async function fetchAnthropicModels(apiKey: string): Promise<LiveModel[]> {
  const json = await fetchJson('https://api.anthropic.com/v1/models', {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  });
  const data = Array.isArray(json?.data) ? json.data : [];
  const models: LiveModel[] = [];
  for (const m of data) {
    const id = typeof m?.id === 'string' && m.id ? m.id : null;
    if (!id) continue;
    models.push({
      modelKey: id,
      displayName: typeof m?.display_name === 'string' && m.display_name ? m.display_name : prettifyModelId(id),
      speed: 'medium',
    });
  }
  return dedupe(models).slice(0, MAX_MODELS);
}

async function fetchGeminiModels(apiKey: string): Promise<LiveModel[]> {
  const json = await fetchJson('https://generativelanguage.googleapis.com/v1beta/models', {
    'x-goog-api-key': apiKey,
  });
  const data = Array.isArray(json?.models) ? json.models : [];
  const models: LiveModel[] = [];
  for (const m of data) {
    const name = typeof m?.name === 'string' ? m.name : '';
    const id = name.startsWith('models/') ? name.slice('models/'.length) : name;
    if (!id) continue;
    const methods: string[] = Array.isArray(m?.supportedGenerationMethods)
      ? m.supportedGenerationMethods
      : [];
    if (!methods.includes('generateContent')) continue;
    if (/embedding|aqa|imagen/i.test(id)) continue;
    models.push({
      modelKey: id,
      displayName: typeof m?.displayName === 'string' && m.displayName ? m.displayName : prettifyModelId(id),
      speed: 'medium',
    });
  }
  return dedupe(models).slice(0, MAX_MODELS);
}

async function fetchForProvider(providerId: string, apiKey: string): Promise<LiveModel[] | null> {
  switch (providerId) {
    case 'openai':
      return fetchOpenAICompatibleModels('https://api.openai.com/v1', apiKey, OPENAI_EXCLUDE);
    case 'mistral':
      return fetchOpenAICompatibleModels(
        'https://api.mistral.ai/v1',
        apiKey,
        /embed|audio|voxtral/i,
      );
    case 'llama': {
      // Groq-hosted OpenAI-compatible endpoint (LLAMA_BASE_URL override respected).
      const base = (process.env.LLAMA_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
      return fetchOpenAICompatibleModels(base, apiKey, /whisper|tts|audio/i);
    }
    case 'anthropic':
      return fetchAnthropicModels(apiKey);
    case 'gemini':
      return fetchGeminiModels(apiKey);
    default:
      // perplexity has no public model-list endpoint; pollinations is handled
      // by its own public registry path. Static catalog remains the fallback.
      return null;
  }
}

/**
 * Live models for a provider using the user's key.
 * Returns null when the provider has no list endpoint or the fetch fails —
 * callers fall back to the static catalog. Cached per user+provider.
 */
export async function fetchLiveModels(
  providerId: string,
  apiKey: string,
  userId: string,
): Promise<LiveModel[] | null> {
  const key = `${userId}:${providerId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.models;
  let models: LiveModel[] | null = null;
  try {
    const list = await fetchForProvider(providerId, apiKey);
    models = list && list.length > 0 ? list : null;
  } catch {
    models = null;
  }
  cache.set(key, { fetchedAt: Date.now(), models });
  return models;
}

/** For tests: clear the live-model cache. */
export function clearLiveModelCache(): void {
  cache.clear();
}
