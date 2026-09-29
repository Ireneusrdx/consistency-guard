import {
  GenerationResult,
  InvalidApiKeyError,
  ProviderRateLimited,
  ProviderTimeout,
  ProviderError,
} from './types';

/**
 * Shared HTTP plumbing for provider adapters.
 * - Applies a request timeout via AbortController.
 * - Maps HTTP failures to typed ProviderError subclasses with user-facing
 *   messages. The API key is NEVER included in errors or logs.
 */

export const DEFAULT_TIMEOUT_MS = 60_000;

export interface CallOptions {
  timeoutMs?: number;
}

export async function postJson(
  providerId: string,
  displayName: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  opts?: CallOptions,
): Promise<{ status: number; json: any; headers: Headers }> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      throw mapHttpError(providerId, displayName, res.status, json, res.headers);
    }
    return { status: res.status, json, headers: res.headers };
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ProviderTimeout(providerId, displayName, timeoutMs);
    }
    throw new ProviderError(
      providerId,
      displayName,
      `network error: ${err instanceof Error ? err.message : 'unknown'}. Check connectivity and try again.`,
      'NETWORK_ERROR',
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

function mapHttpError(
  providerId: string,
  displayName: string,
  status: number,
  json: any,
  headers: Headers,
): ProviderError {
  // Never include request bodies/headers (which may carry the key) in messages.
  const providerMessage =
    json?.error?.message || json?.message || json?.error || undefined;

  if (status === 401 || status === 403) {
    return new InvalidApiKeyError(providerId, displayName);
  }
  if (status === 429) {
    const retryAfter = headers.get('retry-after');
    const secs = retryAfter ? parseInt(retryAfter, 10) : undefined;
    return new ProviderRateLimited(providerId, displayName, Number.isFinite(secs) ? secs : undefined);
  }
  if (status === 400) {
    return new ProviderError(
      providerId,
      displayName,
      `the request was rejected${providerMessage ? `: ${String(providerMessage).slice(0, 200)}` : ''}.`,
      'BAD_REQUEST',
      400,
    );
  }
  if (status >= 500) {
    return new ProviderError(
      providerId,
      displayName,
      'the provider service is temporarily unavailable. The evaluation will continue with remaining providers.',
      'PROVIDER_5XX',
      502,
    );
  }
  return new ProviderError(
    providerId,
    displayName,
    `unexpected response (HTTP ${status})${providerMessage ? `: ${String(providerMessage).slice(0, 200)}` : ''}.`,
    'PROVIDER_ERROR',
    502,
  );
}

/** Rough token estimate used when a provider does not return usage. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

export function timed<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const start = Date.now();
  return fn().then((result) => ({ result, latencyMs: Date.now() - start }));
}

export type { GenerationResult };
