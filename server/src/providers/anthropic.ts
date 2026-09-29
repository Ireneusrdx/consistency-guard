import {
  AIProvider,
  GenerationInput,
  GenerationResult,
  ModelMetadata,
} from './types';
import { getModelEntry } from './registry';
import { postJson, estimateTokens, timed } from './http';

export class AnthropicAdapter implements AIProvider {
  readonly id = 'anthropic';
  readonly displayName = 'Anthropic';
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
      const { result, latencyMs } = await timed(() =>
        postJson(
          this.id,
          this.displayName,
          'https://api.anthropic.com/v1/messages',
          {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          {
            model: input.model,
            max_tokens: input.maxTokens ?? 1024,
            system: input.systemPrompt,
            messages: [{ role: 'user', content: input.prompt }],
            temperature: input.temperature ?? 0.7,
          },
        ),
      );
      const json = result.json;
      const blocks: Array<{ type?: string; text?: string }> = json?.content ?? [];
      const text = blocks
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .join('\n');
      if (!text.trim()) {
        throw new Error('Anthropic returned an empty or malformed response.');
      }
      const usage = json?.usage ?? {};
      const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : estimateTokens(input.prompt);
      const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : estimateTokens(text);
      out.push({ text, inputTokens, outputTokens, latencyMs, model: input.model, providerId: this.id });
    }
    return out;
  }
}
