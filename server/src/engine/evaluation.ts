import { prisma } from '../db';
import { decryptApiKey } from '../utils/crypto';
import {
  resolveProviderForModel,
  getModelEntry,
  getProviderIdForModel,
} from '../providers/registry';
import { fetchLiveModels } from '../providers/liveModels';
import { GenerationResult, ProviderError } from '../providers/types';
import { normalizeText } from './normalize';
import { extractClaims, ExtractedClaim } from './claims';
import { calculateConsistency, crossModelAgreement } from './consistency';
import { detectConflicts, ClaimWithModel } from './conflicts';
import { retrieveEvidence, verifyClaim } from './evidence';
import { analyzeUncertainty } from './uncertainty';
import {
  ScoringWeights,
  DEFAULT_WEIGHTS,
  normalizeWeights,
  calculateRelevance,
  calculateCompleteness,
  calculateGrounding,
  calculateInstructionFollowing,
  calculateGroundTruthAccuracy,
  calculateHallucinationRisk,
  calculateReliability,
} from './scoring';
import { analyzePrompt, optimizePrompt } from './promptAnalysis';
import { jsonStringify, jsonParse } from '../utils/json';

/**
 * Evaluation engine pipeline:
 *
 *   validate prompt → prompt analysis → provider selection →
 *   repeated model calls (Promise.allSettled per model; partial failures
 *   mark that model "unavailable" without failing the evaluation) →
 *   normalization → claim extraction → conflict detection →
 *   evidence retrieval → grounding/uncertainty → metric calculation →
 *   reliability scoring → explainability → persist → return.
 */

export type EvaluationMode = 'quick' | 'consistency' | 'deep' | 'adversarial';

export interface EvaluationRequest {
  userId: string;
  question: string;
  domain?: string;
  taskType?: string;
  evaluationMode?: EvaluationMode;
  modelKeys: string[];
  runs?: number;
  temperature?: number;
  maxTokens?: number;
  systemInstructions?: string;
  referenceAnswer?: string;
  enableEvidence?: boolean;
  enableUncertainty?: boolean;
  enableConflicts?: boolean;
  weights?: Partial<ScoringWeights>;
}

const MODE_DEFAULT_RUNS: Record<EvaluationMode, number> = {
  quick: 3,
  consistency: 5,
  deep: 5,
  adversarial: 3,
};

function defaultRunsFor(mode: EvaluationMode): number {
  return MODE_DEFAULT_RUNS[mode] ?? 5;
}

interface ModelCredential {
  providerId: string;
  apiKey?: string;
}

async function resolveCredentials(userId: string, modelKeys: string[]): Promise<Map<string, ModelCredential>> {
  const creds = await prisma.userApiCredential.findMany({
    where: { userId, isActive: true },
    include: { provider: true },
  });
  const byProvider = new Map<string, string>();
  for (const c of creds) {
    try {
      byProvider.set(c.provider.key, decryptApiKey(c.encryptedKey));
    } catch {
      // Corrupt credential → treat as missing; the model errors instead of demoing.
    }
  }
  const map = new Map<string, ModelCredential>();
  for (const modelKey of modelKeys) {
    let providerId = getProviderIdForModel(modelKey);
    if (!providerId) {
      // Live-discovered model (not in the static catalog): find which of the
      // user's keyed providers actually serves it.
      providerId = await resolveLiveProviderId(userId, byProvider, modelKey);
    }
    providerId = providerId ?? 'unknown';
    map.set(modelKey, { providerId, apiKey: byProvider.get(providerId) });
  }
  return map;
}

/**
 * Finds the provider serving a live-discovered model key by checking the
 * cached live model lists of each provider the user has a key for.
 */
async function resolveLiveProviderId(
  userId: string,
  byProvider: Map<string, string>,
  modelKey: string,
): Promise<string | undefined> {
  for (const [providerId, apiKey] of byProvider) {
    try {
      const live = await fetchLiveModels(providerId, apiKey, userId);
      if (live?.some((m) => m.modelKey === modelKey)) return providerId;
    } catch {
      // Try the next provider.
    }
  }
  return undefined;
}

function userMessageFor(error: unknown, providerDisplayName: string): string {
  if (error instanceof ProviderError) return error.message;
  const msg = error instanceof Error ? error.message : 'unknown error';
  return `${providerDisplayName} request failed: ${msg.slice(0, 300)}`;
}

/** Creates the evaluation record and kicks off background execution. */
export async function createEvaluation(req: EvaluationRequest): Promise<string> {
  const question = req.question?.trim();
  if (!question) throw Object.assign(new Error('Prompt must not be empty.'), { statusCode: 400 });
  if (question.length > 20000) throw Object.assign(new Error('Prompt exceeds the 20,000 character limit.'), { statusCode: 400 });
  if (!req.modelKeys || req.modelKeys.length === 0) {
    throw Object.assign(new Error('Select at least one model to evaluate.'), { statusCode: 400 });
  }
  if (req.modelKeys.length > 6) {
    throw Object.assign(new Error('A maximum of 6 models can be evaluated at once.'), { statusCode: 400 });
  }
  const mode: EvaluationMode = req.evaluationMode ?? 'consistency';
  const runs = Math.min(10, Math.max(1, req.runs ?? defaultRunsFor(mode)));
  const weights = normalizeWeights(req.weights ?? {});

  // Per-user concurrency cap. Each evaluation fans out to models × runs
  // provider calls in the background; without a cap one account could queue
  // unbounded spend (their own key) and exhaust shared server resources.
  // This is the single choke point: direct evaluations, reruns, and every
  // benchmark question all flow through createEvaluation.
  const MAX_CONCURRENT_EVALUATIONS = 3;
  const activeCount = await prisma.evaluation.count({
    where: { userId: req.userId, status: { in: ['pending', 'running'] } },
  });
  if (activeCount >= MAX_CONCURRENT_EVALUATIONS) {
    throw Object.assign(
      new Error(
        `You already have ${MAX_CONCURRENT_EVALUATIONS} evaluations running. Wait for one to finish before starting another.`,
      ),
      { statusCode: 429 },
    );
  }

  const questionRow = await prisma.question.create({
    data: {
      userId: req.userId,
      text: question,
      domain: req.domain ?? 'general',
      taskType: req.taskType ?? 'qa',
      systemInstructions: req.systemInstructions,
      referenceAnswer: req.referenceAnswer,
    },
  });

  const evaluation = await prisma.evaluation.create({
    data: {
      userId: req.userId,
      questionId: questionRow.id,
      questionText: question,
      domain: req.domain ?? 'general',
      taskType: req.taskType ?? 'qa',
      evaluationMode: mode,
      runs,
      status: 'pending',
      weights: jsonStringify(weights),
    },
  });

  // Pre-create run rows so the status endpoint can report progress immediately.
  const creds = await resolveCredentials(req.userId, req.modelKeys);
  for (const modelKey of req.modelKeys) {
    const entry = getModelEntry(modelKey);
    const providerId = getProviderIdForModel(modelKey) ?? 'unknown';
    const modelRow = entry
      ? await prisma.aIModel.findFirst({
          where: { provider: { key: providerId }, modelKey },
        })
      : null;
    for (let i = 0; i < runs; i++) {
      await prisma.evaluationRun.create({
        data: {
          evaluationId: evaluation.id,
          modelId: modelRow?.id,
          modelKey,
          providerId,
          runIndex: i,
          status: 'pending',
        },
      });
    }
    void creds; // resolved again inside executeEvaluation
  }

  // Background execution — never await in the request path.
  void executeEvaluation(evaluation.id, req).catch((err) => {
    console.error(`[evaluation ${evaluation.id}] background failure:`, err instanceof Error ? err.message : err);
  });

  return evaluation.id;
}

interface PerModelOutcome {
  modelKey: string;
  providerId: string;
  displayName: string;
  results: GenerationResult[]; // successful runs only
  error?: string; // set when the whole model failed
}

/** Full pipeline for one evaluation. Safe to run in the background. */
export async function executeEvaluation(evaluationId: string, req?: EvaluationRequest): Promise<void> {
  const evaluation = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
  if (!evaluation) throw new Error(`Evaluation ${evaluationId} not found.`);

  const userId = req?.userId ?? evaluation.userId;
  const question = req?.question ?? evaluation.questionText;
  const mode = (req?.evaluationMode ?? evaluation.evaluationMode) as EvaluationMode;
  const runs = req?.runs ?? evaluation.runs;
  const temperature = req?.temperature ?? 0.7;
  const systemInstructions = req?.systemInstructions;
  const referenceAnswer = req?.referenceAnswer;
  const enableEvidence = req?.enableEvidence ?? true;
  const enableUncertainty = req?.enableUncertainty ?? true;
  const enableConflicts = req?.enableConflicts ?? true;
  const weights = normalizeWeights(jsonParse<Partial<ScoringWeights> | null>(evaluation.weights, null) ?? req?.weights ?? {});
  const modelKeys: string[] = req?.modelKeys ?? (await prisma.evaluationRun.findMany({
    where: { evaluationId },
    distinct: ['modelKey'],
    select: { modelKey: true },
  })).map((r) => r.modelKey);

  await prisma.evaluation.update({ where: { id: evaluationId }, data: { status: 'running' } });

  // --- Prompt analysis (persisted for the results page) ---
  const promptAnalysis = analyzePrompt(question);
  const optimized = optimizePrompt(question, promptAnalysis);
  const analysisRow = await prisma.promptAnalysis.create({
    data: {
      evaluationId,
      userId,
      promptText: question,
      score: promptAnalysis.score,
      dimensions: jsonStringify(promptAnalysis.dimensions),
      issues: jsonStringify(promptAnalysis.issues),
      suggestions: jsonStringify(promptAnalysis.suggestions),
    },
  });
  await prisma.promptSuggestion.create({
    data: { evaluationId, promptAnalysisId: analysisRow.id, originalPrompt: question, optimizedPrompt: optimized },
  });

  // --- Provider selection ---
  const creds = await resolveCredentials(userId, modelKeys);

  // --- Repeated model calls (parallel across models, sequential runs) ---
  const runRows = await prisma.evaluationRun.findMany({ where: { evaluationId } });
  const runRowsByModel = new Map<string, typeof runRows>();
  for (const r of runRows) {
    if (!runRowsByModel.has(r.modelKey)) runRowsByModel.set(r.modelKey, []);
    runRowsByModel.get(r.modelKey)!.push(r);
  }

  const outcomes = await Promise.allSettled(
    modelKeys.map(async (modelKey): Promise<PerModelOutcome> => {
      const displayName = getModelEntry(modelKey)?.displayName ?? modelKey;
      const cred = creds.get(modelKey);
      const providerId = cred?.providerId ?? 'unknown';
      const missingOutcome = (error: string): PerModelOutcome => ({
        modelKey,
        providerId,
        displayName,
        results: [],
        error,
      });
      if (!cred?.providerId || cred.providerId === 'unknown') {
        return missingOutcome(`Unknown model "${modelKey}".`);
      }
      if (!cred.apiKey) {
        return missingOutcome(`No API key configured for ${displayName}. Add it in Provider Setup.`);
      }
      const provider = resolveProviderForModel(modelKey, cred.apiKey);
      const rows = (runRowsByModel.get(modelKey) ?? []).sort((a, b) => a.runIndex - b.runIndex);
      const results: GenerationResult[] = [];
      try {
        const generated = await provider.generateMultipleResponses(
          { prompt: question, systemPrompt: systemInstructions, temperature, maxTokens: 1024, model: modelKey },
          runs,
        );
        for (let i = 0; i < generated.length; i++) {
          const g = generated[i];
          results.push(g);
          const row = rows[i];
          if (row) {
            await prisma.evaluationRun.update({
              where: { id: row.id },
              data: { status: 'completed', startedAt: row.startedAt ?? new Date(), completedAt: new Date(), latencyMs: g.latencyMs },
            });
          }
          const modelRow = rows[i]?.modelId
            ? await prisma.aIModel.findUnique({ where: { id: rows[i].modelId as string } })
            : null;
          await prisma.modelResponse.create({
            data: {
              evaluationId,
              runId: row?.id,
              modelId: modelRow?.id,
              providerId: cred.providerId,
              modelKey,
              runIndex: i,
              responseText: g.text,
              normalizedText: normalizeText(g.text),
              inputTokens: g.inputTokens,
              outputTokens: g.outputTokens,
              latencyMs: g.latencyMs,
              estimatedCostUsd: provider.estimateCost(g.inputTokens, g.outputTokens, modelKey),
              status: 'completed',
            },
          });
        }
        return { modelKey, providerId: cred.providerId, displayName, results };
      } catch (err) {
        const message = userMessageFor(err, provider.displayName);
        for (const row of rows) {
          await prisma.evaluationRun.update({
            where: { id: row.id },
            data: { status: 'failed', errorMessage: message, completedAt: new Date() },
          });
          await prisma.modelResponse.create({
            data: {
              evaluationId,
              runId: row.id,
              modelId: row.modelId,
              providerId: cred.providerId,
              modelKey,
              runIndex: row.runIndex,
              responseText: '',
              status: 'unavailable',
              errorMessage: message,
            },
          });
        }
        return { modelKey, providerId: cred.providerId, displayName, results: [], error: message };
      }
    }),
  );

  const perModel: PerModelOutcome[] = outcomes.map((o, i) =>
    o.status === 'fulfilled'
      ? o.value
      : {
          modelKey: modelKeys[i],
          providerId: 'unknown',
          displayName: modelKeys[i],
          results: [],
          error: o.reason instanceof Error ? o.reason.message : 'Unknown error',
        },
  );

  const succeeded = perModel.filter((m) => m.results.length > 0);
  if (succeeded.length === 0) {
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: { status: 'failed', statusMessage: 'All providers failed. Check credentials and try again.' },
    });
    return;
  }

  // --- Normalization + claim extraction + consistency ---
  const textsByModel = new Map<string, string[]>();
  const claimsByModel = new Map<string, ExtractedClaim[][]>();
  for (const m of succeeded) {
    textsByModel.set(m.modelKey, m.results.map((r) => r.text));
    claimsByModel.set(m.modelKey, m.results.map((r) => extractClaims(r.text)));
  }

  const consistencyByModel = new Map<string, ReturnType<typeof calculateConsistency>>();
  for (const m of succeeded) {
    consistencyByModel.set(
      m.modelKey,
      calculateConsistency(textsByModel.get(m.modelKey)!, claimsByModel.get(m.modelKey)!),
    );
  }
  const agreementByModel = crossModelAgreement(textsByModel);

  // --- Conflict detection (cross-model) ---
  const allClaims: ClaimWithModel[] = [];
  for (const m of succeeded) {
    for (const runClaims of claimsByModel.get(m.modelKey)!) {
      for (const c of runClaims) allClaims.push({ ...c, modelKey: m.modelKey });
    }
  }
  const conflicts = enableConflicts ? detectConflicts(allClaims) : [];
  for (const c of conflicts) {
    await prisma.conflict.create({
      data: {
        evaluationId,
        claimText: c.claimText,
        modelAKey: c.modelAKey,
        modelBKey: c.modelBKey,
        conflictType: c.conflictType,
        severity: c.severity,
        explanation: c.explanation,
      },
    });
  }
  const contradictedTexts = new Set(conflicts.filter((c) => c.conflictType === 'direct_contradiction').map((c) => c.claimText));

  // --- Evidence + grounding + uncertainty + metrics (per model) ---
  const metricRows: Array<{ modelKey: string; modelId?: string; metricName: string; value: number; isEstimated: boolean; explanation?: string }> = [];
  let totalCost = 0;
  let totalLatency = 0;
  let reliabilitySum = 0;
  let consistencySum = 0;

  for (const m of succeeded) {
    const texts = textsByModel.get(m.modelKey)!;
    const runClaims = claimsByModel.get(m.modelKey)!;
    const consistency = consistencyByModel.get(m.modelKey)!;
    const modelRow = await prisma.aIModel.findFirst({
      where: { provider: { key: m.providerId }, modelKey: m.modelKey },
    });

    // Dedupe claims per model for evidence work.
    const uniqueClaims = new Map<string, ExtractedClaim>();
    for (const rc of runClaims) for (const c of rc) if (!uniqueClaims.has(c.text)) uniqueClaims.set(c.text, c);

    let supported = 0;
    let contradicted = 0;
    if (enableEvidence) {
      for (const claim of uniqueClaims.values()) {
        const evidence = retrieveEvidence(claim);
        const verification = verifyClaim(claim, evidence, contradictedTexts.has(claim.text));
        if (verification.status === 'supported') supported++;
        if (verification.status === 'contradicted') contradicted++;
        const factClaim = await prisma.factClaim.create({
          data: {
            evaluationId,
            modelId: modelRow?.id,
            modelKey: m.modelKey,
            claimText: claim.text,
            claimType: claim.type,
            status: verification.status,
            confidence: verification.confidence,
          },
        });
        for (const e of evidence) {
          await prisma.evidenceSource.create({
            data: {
              evaluationId,
              factClaimId: factClaim.id,
              title: e.title,
              url: e.url,
              snippet: e.snippet,
              sourceType: e.sourceType,
              confidence: e.confidence,
              isAiGenerated: e.isAiGenerated,
            },
          });
        }
      }
    }

    const totalClaims = uniqueClaims.size;
    const grounding = calculateGrounding(supported, totalClaims);
    const evidenceStrength = totalClaims === 0 ? 0.5 : supported / totalClaims;
    const uncertainty = enableUncertainty
      ? analyzeUncertainty(texts.join('\n'), evidenceStrength)
      : { hedgeCount: 0, hasRefusal: false, confidentStatementCount: 0, uncertaintyScore: 0, highConfidenceWeakEvidence: false, flags: [] as string[] };

    const relevance = Math.round(texts.reduce((a, t) => a + calculateRelevance(question, t), 0) / texts.length);
    const completeness = Math.round(texts.reduce((a, t) => a + calculateCompleteness(question, t), 0) / texts.length);
    const instructionFollowing = Math.round(
      texts.reduce((a, t) => a + calculateInstructionFollowing(question, t, systemInstructions), 0) / texts.length,
    );

    let accuracy: number | null = null;
    let accuracyIsEstimated = true;
    let accuracyExplanation: string | undefined;
    if (referenceAnswer && referenceAnswer.trim()) {
      accuracy = Math.round(texts.reduce((a, t) => a + calculateGroundTruthAccuracy(t, referenceAnswer), 0) / texts.length);
      accuracyIsEstimated = false;
      accuracyExplanation = 'Ground-truth accuracy vs the provided reference answer.';
    } else {
      accuracy = agreementByModel.get(m.modelKey) ?? 0;
      accuracyIsEstimated = true;
      accuracyExplanation = 'Estimated from cross-model semantic agreement (no reference answer provided).';
    }

    const hallucinationRisk = calculateHallucinationRisk(contradicted, totalClaims, uncertainty.uncertaintyScore, uncertainty.highConfidenceWeakEvidence);

    const reliability = calculateReliability(
      {
        accuracy,
        accuracyIsEstimated,
        consistency: consistency.score,
        relevance,
        completeness,
        grounding,
        instructionFollowing,
      },
      weights,
    );

    const push = (metricName: string, value: number, isEstimated = false, explanation?: string) =>
      metricRows.push({ modelKey: m.modelKey, modelId: modelRow?.id, metricName, value, isEstimated, explanation });

    push('accuracy', accuracy ?? 0, accuracyIsEstimated, accuracyExplanation);
    push('consistency', consistency.score, false, consistency.explanation);
    push('relevance', relevance);
    push('completeness', completeness);
    push('grounding', grounding, false, `${supported}/${totalClaims} extracted claims supported by retrieved evidence.`);
    push('instructionFollowing', instructionFollowing);
    push('reliability', reliability.score, accuracyIsEstimated, reliability.explanation.join(' '));
    push('hallucinationRisk', hallucinationRisk, false, `${contradicted} contradicted claim(s); uncertainty score ${uncertainty.uncertaintyScore}.`);
    push('uncertainty', uncertainty.uncertaintyScore, false, uncertainty.flags.join(' ') || 'No significant uncertainty detected.');
    push('crossModelAgreement', agreementByModel.get(m.modelKey) ?? 0);

    const modelCost = m.results.reduce((a, r) => a + (r.inputTokens + r.outputTokens), 0);
    void modelCost;
    const costRows = await prisma.modelResponse.findMany({ where: { evaluationId, modelKey: m.modelKey, status: 'completed' } });
    const cost = costRows.reduce((a, r) => a + (r.estimatedCostUsd ?? 0), 0);
    const latency = m.results.reduce((a, r) => a + r.latencyMs, 0);
    totalCost += cost;
    totalLatency += latency;
    reliabilitySum += reliability.score;
    consistencySum += consistency.score;
  }

  for (const mr of metricRows) {
    await prisma.metricResult.create({
      data: {
        evaluationId,
        modelId: mr.modelId,
        modelKey: mr.modelKey,
        metricName: mr.metricName,
        value: mr.value,
        isEstimated: mr.isEstimated,
        explanation: mr.explanation,
      },
    });
  }

  const avgReliability = Math.round(reliabilitySum / succeeded.length);
  const avgConsistency = Math.round(consistencySum / succeeded.length);
  const partial = succeeded.length < perModel.length;

  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: {
      status: partial ? 'partial' : 'completed',
      statusMessage: partial
        ? `${perModel.length - succeeded.length} model(s) unavailable; results cover ${succeeded.length} model(s).`
        : null,
      avgReliability,
      avgConsistency,
      totalCostUsd: Math.round(totalCost * 1e6) / 1e6,
      totalLatencyMs: totalLatency,
      summary: jsonStringify({
        modelsEvaluated: succeeded.length,
        modelsRequested: perModel.length,
        unavailableModels: perModel.filter((m) => m.results.length === 0).map((m) => ({ modelKey: m.modelKey, error: m.error })),
        conflictsDetected: conflicts.length,
        highSeverityConflicts: conflicts.filter((c) => c.severity === 'high').length,
      }),
    },
  });

  await prisma.history.create({
    data: {
      userId,
      action: 'evaluation.completed',
      entityType: 'evaluation',
      entityId: evaluationId,
      evaluationId,
      metadata: jsonStringify({ avgReliability, models: succeeded.map((m) => m.modelKey) }),
    },
  });
}

/** Polling-friendly progress snapshot. */
export async function getEvaluationStatus(evaluationId: string) {
  const evaluation = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
  if (!evaluation) return null;
  const runs = await prisma.evaluationRun.findMany({ where: { evaluationId } });
  const byModel = new Map<string, { modelKey: string; providerId: string; total: number; completed: number; failed: number; status: string; error?: string }>();
  for (const r of runs) {
    if (!byModel.has(r.modelKey)) {
      byModel.set(r.modelKey, { modelKey: r.modelKey, providerId: r.providerId, total: 0, completed: 0, failed: 0, status: 'pending' });
    }
    const entry = byModel.get(r.modelKey)!;
    entry.total++;
    if (r.status === 'completed') entry.completed++;
    if (r.status === 'failed') {
      entry.failed++;
      entry.error = r.errorMessage ?? undefined;
    }
  }
  for (const entry of byModel.values()) {
    entry.status = entry.failed === entry.total && entry.total > 0 ? 'unavailable' : entry.completed === entry.total ? 'completed' : entry.completed > 0 || entry.failed > 0 ? 'running' : 'pending';
  }
  const models = [...byModel.values()];
  const totalRuns = runs.length;
  const doneRuns = runs.filter((r) => r.status === 'completed' || r.status === 'failed').length;
  return {
    id: evaluation.id,
    status: evaluation.status,
    statusMessage: evaluation.statusMessage,
    progress: totalRuns === 0 ? 0 : Math.round((doneRuns / totalRuns) * 100),
    models,
  };
}

/** Full results payload for the results dashboard. */
export async function getEvaluationResults(evaluationId: string) {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: {
      responses: { orderBy: [{ modelKey: 'asc' }, { runIndex: 'asc' }] },
      metrics: true,
      conflicts: { orderBy: { createdAt: 'asc' } },
      claims: { include: { evidence: true } },
      analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
      suggestions: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!evaluation) return null;

  const metricsByModel = new Map<string, Record<string, { value: number; isEstimated: boolean; explanation?: string | null }>>();
  for (const m of evaluation.metrics) {
    if (!metricsByModel.has(m.modelKey)) metricsByModel.set(m.modelKey, {});
    metricsByModel.get(m.modelKey)![m.metricName] = { value: m.value, isEstimated: m.isEstimated, explanation: m.explanation };
  }
  const responsesByModel = new Map<string, typeof evaluation.responses>();
  for (const r of evaluation.responses) {
    if (!responsesByModel.has(r.modelKey)) responsesByModel.set(r.modelKey, []);
    responsesByModel.get(r.modelKey)!.push(r);
  }
  const claimsByModel = new Map<string, typeof evaluation.claims>();
  for (const c of evaluation.claims) {
    if (!claimsByModel.has(c.modelKey)) claimsByModel.set(c.modelKey, []);
    claimsByModel.get(c.modelKey)!.push(c);
  }

  const models = [...responsesByModel.keys()].map((modelKey) => {
    const responses = responsesByModel.get(modelKey)!;
    const completed = responses.filter((r) => r.status === 'completed');
    return {
      modelKey,
      providerId: responses[0]?.providerId,
      displayName: getModelEntry(modelKey)?.displayName ?? modelKey,
      status: completed.length > 0 ? 'completed' : 'unavailable',
      metrics: metricsByModel.get(modelKey) ?? {},
      responses: completed.map((r) => ({
        runIndex: r.runIndex,
        text: r.responseText,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        latencyMs: r.latencyMs,
        estimatedCostUsd: r.estimatedCostUsd,
      })),
      unavailableReason: completed.length === 0 ? responses[0]?.errorMessage : undefined,
      claims: (claimsByModel.get(modelKey) ?? []).map((c) => ({
        text: c.claimText,
        type: c.claimType,
        status: c.status,
        confidence: c.confidence,
        evidence: c.evidence.map((e) => ({
          title: e.title,
          url: e.url,
          snippet: e.snippet,
          sourceType: e.sourceType,
          confidence: e.confidence,
          isAiGenerated: e.isAiGenerated,
        })),
      })),
      avgLatencyMs: completed.length ? Math.round(completed.reduce((a, r) => a + (r.latencyMs ?? 0), 0) / completed.length) : null,
      totalCostUsd: completed.reduce((a, r) => a + (r.estimatedCostUsd ?? 0), 0),
    };
  });

  return {
    id: evaluation.id,
    question: evaluation.questionText,
    domain: evaluation.domain,
    taskType: evaluation.taskType,
    evaluationMode: evaluation.evaluationMode,
    runs: evaluation.runs,
    status: evaluation.status,
    statusMessage: evaluation.statusMessage,
    createdAt: evaluation.createdAt,
    avgReliability: evaluation.avgReliability,
    avgConsistency: evaluation.avgConsistency,
    totalCostUsd: evaluation.totalCostUsd,
    totalLatencyMs: evaluation.totalLatencyMs,
    summary: jsonParse<Record<string, unknown> | null>(evaluation.summary, null),
    weights: jsonParse<Record<string, number> | null>(evaluation.weights, null),
    promptAnalysis: evaluation.analyses[0]
      ? {
          score: evaluation.analyses[0].score,
          dimensions: jsonParse(evaluation.analyses[0].dimensions, {}),
          issues: jsonParse<string[]>(evaluation.analyses[0].issues, []),
          suggestions: jsonParse<string[]>(evaluation.analyses[0].suggestions, []),
        }
      : null,
    promptSuggestion: evaluation.suggestions[0]
      ? { original: evaluation.suggestions[0].originalPrompt, optimized: evaluation.suggestions[0].optimizedPrompt }
      : null,
    models,
    conflicts: evaluation.conflicts.map((c) => ({
      claimText: c.claimText,
      modelAKey: c.modelAKey,
      modelBKey: c.modelBKey,
      conflictingClaimText: (c as unknown as { conflictingClaimText?: string }).conflictingClaimText,
      conflictType: c.conflictType,
      severity: c.severity,
      explanation: c.explanation,
    })),
  };
}

/** Waits (polling) for a background evaluation to finish — used by benchmarks. */
export async function waitForEvaluation(evaluationId: string, timeoutMs = 180_000): Promise<string> {
  const start = Date.now();
  for (;;) {
    const e = await prisma.evaluation.findUnique({ where: { id: evaluationId }, select: { status: true } });
    if (!e) throw new Error('Evaluation disappeared while waiting.');
    if (['completed', 'partial', 'failed'].includes(e.status)) return e.status;
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for evaluation to finish.');
    await new Promise((r) => setTimeout(r, 1000));
  }
}
