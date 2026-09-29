/**
 * Provider abstraction layer.
 *
 * Every AI provider adapter implements AIProvider so evaluation logic never
 * depends on a specific vendor SDK or API shape.
 */

export interface GenerationInput {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  model: string; // catalog modelKey, e.g. "gpt-4o"
}

export interface GenerationResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model: string;
  providerId: string;
}

export interface ModelMetadata {
  providerId: string;
  model: string;
  displayName: string;
  contextLength?: number;
  costPer1kInputUsd?: number;
  costPer1kOutputUsd?: number;
  speed: 'fast' | 'medium' | 'slow';
}

export interface AIProvider {
  readonly id: string;
  readonly displayName: string;

  /** Single completion. */
  generateResponse(input: GenerationInput): Promise<GenerationResult>;
  /** N controlled completions (used for repeated consistency runs). */
  generateMultipleResponses(input: GenerationInput, runs: number): Promise<GenerationResult[]>;
  /** USD estimate for a call. Returns 0 when pricing is unknown — never fabricate. */
  estimateCost(inputTokens: number, outputTokens: number, model: string): number;
  getModelMetadata(model: string): ModelMetadata;
}

/** Base error for provider failures. Never carries the API key. */
export class ProviderError extends Error {
  public readonly providerId: string;
  public readonly code: string;
  public readonly statusCode: number;

  constructor(providerId: string, displayName: string, message: string, code = 'PROVIDER_ERROR', statusCode = 502) {
    super(`${displayName} request failed: ${message}`);
    this.name = 'ProviderError';
    this.providerId = providerId;
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ProviderUnavailable extends ProviderError {
  constructor(providerId: string, displayName: string, reason: string) {
    super(providerId, displayName, reason, 'PROVIDER_UNAVAILABLE', 503);
    this.name = 'ProviderUnavailable';
  }
}

export class InvalidApiKeyError extends ProviderError {
  constructor(providerId: string, displayName: string) {
    super(
      providerId,
      displayName,
      'the configured API key was rejected. Check the credential in provider settings.',
      'INVALID_API_KEY',
      401,
    );
    this.name = 'InvalidApiKeyError';
  }
}

export class ProviderRateLimited extends ProviderError {
  constructor(providerId: string, displayName: string, retryAfterSec?: number) {
    super(
      providerId,
      displayName,
      `rate limit exceeded${retryAfterSec ? ` (retry after ~${retryAfterSec}s)` : ''}. The evaluation will continue with remaining providers.`,
      'RATE_LIMITED',
      429,
    );
    this.name = 'ProviderRateLimited';
  }
}

export class ProviderTimeout extends ProviderError {
  constructor(providerId: string, displayName: string, timeoutMs: number) {
    super(
      providerId,
      displayName,
      `timed out after ${Math.round(timeoutMs / 1000)}s. The evaluation will continue with remaining providers.`,
      'PROVIDER_TIMEOUT',
      504,
    );
    this.name = 'ProviderTimeout';
  }
}
