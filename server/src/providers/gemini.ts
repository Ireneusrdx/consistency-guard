import {
  AIProvider,
  GenerationInput,
  GenerationResult,
  ModelMetadata,
} from './types';
import { getModelEntry } from './registry';
import { postJson, estimateTokens, timed } from './http';

export class GeminiAdapter implements AIProvider {
  readonly id = 'gemini';
  readonly displayName = 'Google Gemini';
  private readonly apiKey: string;

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
      const parts: Array<{ text: string }> = [];
      if (input.systemPrompt) parts.push({ text: `System instructions: ${input.systemPrompt}` });
      parts.push({ text: input.prompt });
      // Note: the key travels as a query parameter per Google's API design.
      // It is never logged or persisted by this server.
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent` +
        `?key=${encodeURIComponent(this.apiKey)}`;
      const { result, latencyMs } = await timed(() =>
        postJson(this.id, this.displayName, url, {}, {
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: input.temperature ?? 0.7,
            maxOutputTokens: input.maxTokens ?? 1024,
          },
        }),
      );
      const json = result.json;
      const candidates: any[] = json?.candidates ?? [];
      const textParts: any[] = candidates[0]?.content?.parts ?? [];
      const text = textParts.map((p) => p.text).filter((t) => typeof t === 'string').join('\n');
      if (!text.trim()) {
        const blockReason = candidates[0]?.finishReason;
        throw new Error(
          `Google Gemini returned an empty response${blockReason ? ` (finishReason: ${blockReason})` : ''}.`,
        );
      }
      const usage = json?.usageMetadata ?? {};
      const inputTokens =
        typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : estimateTokens(input.prompt);
      const outputTokens =
        typeof usage.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : estimateTokens(text);
      out.push({ text, inputTokens, outputTokens, latencyMs, model: input.model, providerId: this.id });
    }
    return out;
  }
}
