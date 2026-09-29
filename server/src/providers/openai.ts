import {
  AIProvider,
  GenerationInput,
  GenerationResult,
  ModelMetadata,
} from './types';
import { getModelEntry } from './registry';
import { postJson, estimateTokens, timed } from './http';

/** Shared base for OpenAI-compatible /chat/completions APIs. */
export abstract class OpenAICompatibleAdapter implements AIProvider {
  abstract readonly id: string;
  abstract readonly displayName: string;
  protected abstract baseUrl: string;
  protected readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getModelMetadata(model: string): ModelMetadata {
    const entry = getModelEntry(model);
    return {
      providerId: this.id,
      model,
      displayName: entry?.displayName ?? model,
      contextLength: entry?.contextLength,
      costPer1kInputUsd: entry?.costPer1kInputUsd,
      costPer1kOutputUsd: entry?.costPer1kOutputUsd,
      speed: entry?.speed ?? 'medium',
    };
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    const entry = getModelEntry(model);
    if (entry?.costPer1kInputUsd == null || entry?.costPer1kOutputUsd == null) return 0;
    return (inputTokens / 1000) * entry.costPer1kInputUsd + (outputTokens / 1000) * entry.costPer1kOutputUsd;
  }

  async generateResponse(input: GenerationInput): Promise<GenerationResult> {
    const results = await this.generateMultipleResponses(input, 1);
    return results[0];
  }

  async generateMultipleResponses(input: GenerationInput, runs: number): Promise<GenerationResult[]> {
    const out: GenerationResult[] = [];
    for (let i = 0; i < runs; i++) {
      out.push(await this.singleCall(input));
    }
    return out;
  }

  protected async singleCall(input: GenerationInput): Promise<GenerationResult> {
    const messages: Array<{ role: string; content: string }> = [];
    if (input.systemPrompt) messages.push({ role: 'system', content: input.systemPrompt });
    messages.push({ role: 'user', content: input.prompt });

    const { result, latencyMs } = await timed(() =>
      postJson(this.id, this.displayName, `${this.baseUrl}/chat/completions`, this.authHeaders(), {
        model: input.model,
        messages,
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens ?? 1024,
      }),
    );
    const json = result.json;
    const text: string | undefined = json?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error(`${this.displayName} returned an empty or malformed response.`);
    }
    const usage = json?.usage ?? {};
    const inputTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : estimateTokens(input.prompt);
    const outputTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : estimateTokens(text);
    return {
      text,
      inputTokens,
      outputTokens,
      latencyMs,
      model: input.model,
      providerId: this.id,
    };
  }

  protected authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }
}

export class OpenAIAdapter extends OpenAICompatibleAdapter {
  readonly id = 'openai';
  readonly displayName = 'OpenAI';
  protected baseUrl = 'https://api.openai.com/v1';
}

export class MistralAdapter extends OpenAICompatibleAdapter {
  readonly id = 'mistral';
  readonly displayName = 'Mistral';
  protected baseUrl = 'https://api.mistral.ai/v1';
}

export class LlamaAdapter extends OpenAICompatibleAdapter {
  readonly id = 'llama';
  readonly displayName = 'Meta Llama';
  protected baseUrl = process.env.LLAMA_BASE_URL || 'https://api.groq.com/openai/v1';
}

export class PerplexityAdapter extends OpenAICompatibleAdapter {
  readonly id = 'perplexity';
  readonly displayName = 'Perplexity';
  protected baseUrl = 'https://api.perplexity.ai';
}
