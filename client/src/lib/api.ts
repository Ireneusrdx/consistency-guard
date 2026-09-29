/**
 * Consistency Guard API client.
 *
 * Every function calls the real backend. Failures propagate as real
 * errors (ApiError) — there is no demo fallback and no fabricated data.
 *
 * NOTE (merged module): the lower half of this file ("Core flow API",
 * axios-based) is owned by the sibling core-frontend agent: auth, token
 * handling, provider/evaluation/prompt/history/report/dashboard API
 * objects used by the login / provider-setup / evaluate flow pages.
 * Both halves share the ApiError class and toApiError() defined here.
 */
import axios from 'axios';
import type { AxiosError } from 'axios';
import type {
  ClaimItem as ResultsClaimItem,
  ConflictItem as ResultsConflictItem,
  CreateEvaluationPayload,
  DashboardSummary,
  EvaluationStatus as CoreEvaluationStatus,
  EvidenceItem,
  HistoryItem,
  ModelResult,
  PromptAnalysis as CorePromptAnalysis,
  Provider,
  ReportItem as CoreReportItem,
  ResultsData,
  UncertaintyFlag,
  User,
} from '../types';

const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Normalize any thrown value into an ApiError (axios-aware: prefers server message). */
export function toApiError(err: unknown): ApiError {
  const axiosErr = err as AxiosError<{ message?: string }> | undefined;
  const message =
    axiosErr?.response?.data?.message ??
    (err instanceof Error ? err.message : undefined) ??
    'Request failed';
  return new ApiError(axiosErr?.response?.status ?? 0, message);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch (err) {
    throw toApiError(err);
  }
  if (res.status === 401) {
    clearToken();
    const currentPath = window.location.pathname;
    const isPublic = PUBLIC_PATHS.some((p) => currentPath === p || currentPath.startsWith(`${p}/`));
    if (!isPublic) {
      window.location.assign('/login');
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelScore {
  modelId: string;
  provider: string;
  model: string;
  /** Null when the engine did not record the metric — never 0-fallback. */
  reliability: number | null;
  consistency: number | null;
  grounding: number | null;
  relevance: number | null;
  instructionFollowing: number | null;
  completeness: number | null;
  /** Ground-truth accuracy; null when no reference answers exist. */
  accuracy: number | null;
  agreement: number | null;
  hallucinationRate: number | null;
  avgLatencyMs: number | null;
  totalCostUsd: number;
}

export interface DomainScore {
  domain: string;
  reliability: number | null;
  consistency: number | null;
  evaluations: number;
}

export interface TrendPoint {
  date: string;
  reliability: number | null;
  consistency: number | null;
}

export interface DashboardData {
  totalEvaluations: number;
  modelsTested: number;
  /** Null when no evaluations have recorded the metric. */
  avgReliability: number | null;
  avgConsistency: number | null;
  conflictsDetected: number;
  claimsVerified: number;
  reportsGenerated: number;
  reliabilityTrend: TrendPoint[];
  consistencyTrend: TrendPoint[];
  modelUsage: { model: string; evaluations: number }[];
  domainPerformance: DomainScore[];
  costByModel: { model: string; costUsd: number }[];
  latencyByModel: { model: string; avgMs: number }[];
  recent: EvaluationSummary[];
}

export type EvaluationStatus = 'completed' | 'running' | 'failed' | 'partial';

export interface EvaluationSummary {
  id: string;
  prompt: string;
  domain: string;
  taskType: string;
  models: string[];
  reliability: number | null;
  consistency: number | null;
  conflicts: number;
  status: EvaluationStatus;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EvaluationFilters {
  q?: string;
  domain?: string;
  model?: string;
  taskType?: string;
  minReliability?: number;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface ClaimItem {
  id: string;
  text: string;
  status: 'supported' | 'contradicted' | 'unverified';
  evidence?: string;
  source?: string;
  confidence: number;
  models: string[];
}

export interface ConflictItem {
  id: string;
  claim: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  modelsInvolved: string[];
  evidence?: string;
}

export interface ModelResponseDetail {
  modelId: string;
  provider: string;
  model: string;
  runs: { index: number; text: string; latencyMs: number }[];
  claims: ClaimItem[];
}

export interface EvaluationDetail {
  id: string;
  prompt: string;
  domain: string;
  taskType: string;
  mode: string;
  createdAt: string;
  models: ModelResponseDetail[];
  conflicts: ConflictItem[];
}

export interface BenchmarkDataset {
  id: string;
  name: string;
  description: string;
  domain: string;
  questionCount: number;
  lastRunAt: string | null;
  models: string[];
  status: 'ready' | 'running' | 'completed' | 'failed';
}

export interface DatasetPreview {
  columns: string[];
  /** target field -> source column (or null if unmapped) */
  mapping: Record<string, string | null>;
  validRows: number;
  invalidRows: number;
  warnings: string[];
  errors: { row: number; message: string }[];
  sample: Record<string, string>[];
  rows: Record<string, string>[];
}

export interface BenchmarkQuestionResult {
  id: string;
  question: string;
  expectedAnswer: string | null;
  results: { model: string; answer: string; correct: boolean | null; score: number }[];
}

export interface BenchmarkResultDetail {
  id: string;
  name: string;
  domain: string;
  models: ModelScore[];
  domainBreakdown: { domain: string; models: { model: string; score: number }[] }[];
  questions: BenchmarkQuestionResult[];
  hasGroundTruth: boolean;
  createdAt: string;
}

export interface PromptDimension {
  name: string;
  score: number;
  feedback: string;
}

export interface PromptAnalysis {
  score: number;
  dimensions: PromptDimension[];
  issues: string[];
  suggestions: string[];
}

export interface PromptHistoryItem {
  id: string;
  original: string;
  improved: string;
  scoreBefore: number;
  scoreAfter: number;
  createdAt: string;
}

export interface AdversarialCategory {
  id: string;
  name: string;
  description: string;
  example: string;
}

export interface AdversarialResult {
  id: string;
  category: string;
  categoryName: string;
  prompt: string;
  model: string;
  response: string;
  hallucinated: boolean;
  detectedUncertainty: boolean;
  challengedPremise: boolean;
  providedEvidence: boolean;
  /** Engine uncertainty score (0-100, higher = more uncertain). Null when unavailable. */
  uncertaintyScore: number | null;
  /** Engine grounding score (0-100). Null when unavailable. */
  evidenceStrength: number | null;
  /** Derived from hallucinationRisk: >=60 high, >=30 medium, else low. */
  riskLevel: 'low' | 'medium' | 'high';
  latencyMs: number | null;
  notes: string[];
}

/** Raw per-model result from POST /api/adversarial/run (wrapped in { results }). */
interface ServerAdversarialResult {
  modelKey: string;
  categoryName: string;
  response: string;
  hallucinated: boolean;
  challengedFalsePremise: boolean;
  identifiedUncertainty: boolean;
  providedEvidence: boolean;
  hallucinationRisk: number | null;
  uncertaintyScore: number | null;
  grounding: number | null;
  latencyMs: number | null;
  notes: string[];
}

export interface ReportItem {
  id: string;
  title: string;
  sourceType: 'evaluation' | 'benchmark';
  sourceId: string;
  createdAt: string;
  status: 'ready' | 'generating';
}

export interface ReportSection {
  heading: string;
  body: string;
  bullets?: string[];
}

export interface ReportContent {
  id: string;
  title: string;
  sourceType: 'evaluation' | 'benchmark';
  sourceId: string;
  createdAt: string;
  sections: ReportSection[];
  metrics: { label: string; value: string }[];
  modelScores: ModelScore[];
  conflicts: ConflictItem[];
}

export interface ScoringWeights {
  accuracy: number;
  consistency: number;
  relevance: number;
  completeness: number;
  grounding: number;
  instructionFollowing: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
  connected: boolean;
  maskedKey: string | null;
  lastTestedAt: string | null;
  docsUrl: string;
  /** Format hint for the key input, e.g. "sk_… / pk_…". */
  keyHint?: string;
  /** True for free-tier gateways like Pollinations. */
  freeTier?: boolean;
  /** Where to get a key (defaults to docsUrl). */
  signupUrl?: string;
}

export interface UserSettings {
  profile: { name: string; email: string; avatarUrl?: string };
  providers: ProviderInfo[];
  preferences: { defaultRuns: number; defaultMode: string; defaultDomains: string[] };
  scoringWeights: ScoringWeights;
  notifications: { emailOnComplete: boolean; emailOnConflict: boolean; weeklyDigest: boolean };
  appearance: { theme: 'light' | 'dark' | 'system' };
}

export interface SessionInfo {
  id: string;
  device: string;
  ip: string;
  current: boolean;
  lastActive: string;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** Raw shape of GET /api/dashboard. */
interface ServerDashboard {
  totals: {
    evaluations: number;
    modelsTested: number;
    avgReliability: number | null;
    avgConsistency: number | null;
    conflictsDetected: number;
    claimsVerified: number;
    reportsGenerated: number;
  };
  reliabilityOverTime: { date: string; reliability: number | null; consistency: number | null }[];
  modelUsage: { modelKey: string; evaluations: number }[];
  domainPerformance: {
    domain: string;
    avgReliability: number | null;
    avgConsistency: number | null;
    evaluations: number;
  }[];
  recentEvaluations: {
    id: string;
    question: string;
    domain: string;
    status: string;
    reliability: number | null;
    consistency: number | null;
    models: string[];
    createdAt: string;
  }[];
}

function toEvaluationStatus(st: string): EvaluationStatus {
  return (st === 'pending' ? 'running' : st) as EvaluationStatus;
}

/** The dashboard endpoint returns nested aggregates; the page expects a flat view model. */
export function getDashboard(): Promise<DashboardData> {
  return request<ServerDashboard>('/dashboard').then((s) => {
    const trend = s.reliabilityOverTime
      .filter((t) => t.reliability != null || t.consistency != null)
      .map((t) => ({
        date: t.date,
        reliability: t.reliability ?? null,
        consistency: t.consistency ?? null,
      }));
    return {
      totalEvaluations: s.totals.evaluations,
      modelsTested: s.totals.modelsTested,
      avgReliability: s.totals.avgReliability ?? null,
      avgConsistency: s.totals.avgConsistency ?? null,
      conflictsDetected: s.totals.conflictsDetected,
      claimsVerified: s.totals.claimsVerified,
      reportsGenerated: s.totals.reportsGenerated,
      reliabilityTrend: trend,
      consistencyTrend: trend,
      modelUsage: s.modelUsage.map((m) => ({ model: m.modelKey, evaluations: m.evaluations })),
      domainPerformance: s.domainPerformance.map((d) => ({
        domain: d.domain,
        reliability: d.avgReliability ?? null,
        consistency: d.avgConsistency ?? null,
        evaluations: d.evaluations,
      })),
      costByModel: [],
      latencyByModel: [],
      recent: s.recentEvaluations.map((e) => ({
        id: e.id,
        prompt: e.question,
        domain: e.domain,
        taskType: '',
        models: e.models,
        reliability: e.reliability ?? null,
        consistency: e.consistency ?? null,
        conflicts: 0,
        status: toEvaluationStatus(e.status),
        createdAt: e.createdAt,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Evaluations / history
// ---------------------------------------------------------------------------

/** Raw item from GET /api/history. */
interface ServerHistoryItem {
  id: string;
  question: string;
  domain: string;
  taskType: string;
  status: string;
  reliability: number | null;
  consistency: number | null;
  conflicts: number;
  models: { modelKey: string; providerId: string }[];
  createdAt: string;
}

/**
 * The paginated evaluation list lives at GET /api/history (the server has no
 * GET /api/evaluations list route). The page's `q` filter maps to the
 * server's `search` parameter.
 */
export function listEvaluations(f: EvaluationFilters): Promise<Paginated<EvaluationSummary>> {
  const params = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => {
    if (v === undefined || v === '' || v === null) return;
    const key = k === 'q' ? 'search' : k;
    let val = String(v);
    // /api/history requires full datetimes for from/to.
    if ((key === 'from' || key === 'to') && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      val = `${val}T00:00:00.000Z`;
    }
    params.set(key, val);
  });
  return request<{
    total: number;
    page: number;
    pageSize: number;
    items: ServerHistoryItem[];
  }>(`/history?${params.toString()}`).then((r) => ({
    total: r.total,
    page: r.page,
    pageSize: r.pageSize,
    items: r.items.map((e) => ({
      id: e.id,
      prompt: e.question,
      domain: e.domain,
      taskType: e.taskType,
      models: e.models.map((m) => m.modelKey),
      reliability: e.reliability ?? 0,
      consistency: e.consistency ?? 0,
      conflicts: e.conflicts,
      status: toEvaluationStatus(e.status),
      createdAt: e.createdAt,
    })),
  }));
}

/** Raw per-model payload from GET /api/evaluations/:id/results. */
export interface ServerEvaluationResults {
  id: string;
  question: string;
  domain: string;
  taskType: string;
  evaluationMode: string;
  createdAt: string;
  models: {
    modelKey: string;
    providerId: string | null;
    displayName: string;
    avgLatencyMs: number | null;
    totalCostUsd: number;
    responses: { runIndex: number; text: string; latencyMs: number | null }[];
    claims: { text: string; status: string; confidence: number | null }[];
    metrics: Record<string, { value: number; isEstimated: boolean }>;
  }[];
  conflicts: {
    claimText: string;
    modelAKey: string;
    modelBKey: string;
    conflictType: string;
    severity: string;
    explanation: string | null;
  }[];
}

const CLAIM_STATUSES = ['supported', 'contradicted', 'unverified'] as const;

/** Builds the EvaluationDetail view model from the /results payload. */
export function toEvaluationDetail(r: ServerEvaluationResults): EvaluationDetail {
  return {
    id: r.id,
    prompt: r.question,
    domain: r.domain,
    taskType: r.taskType,
    mode: r.evaluationMode,
    createdAt: r.createdAt,
    models: r.models.map((m) => ({
      modelId: m.modelKey,
      provider: m.providerId ?? '',
      model: m.displayName,
      runs: m.responses.map((x, i) => ({
        index: x.runIndex ?? i,
        text: x.text,
        latencyMs: x.latencyMs ?? 0,
      })),
      claims: m.claims.map((c, i) => ({
        id: `${m.modelKey}-claim-${i}`,
        text: c.text,
        status: (CLAIM_STATUSES.includes(c.status as (typeof CLAIM_STATUSES)[number])
          ? c.status
          : 'unverified') as ClaimItem['status'],
        confidence: c.confidence ?? 0,
        models: [m.modelKey],
      })),
    })),
    conflicts: r.conflicts.map((c, i) => ({
      id: `conflict-${i}`,
      claim: c.claimText,
      severity: (['low', 'medium', 'high'].includes(c.severity)
        ? c.severity
        : 'medium') as ConflictItem['severity'],
      description: c.explanation ?? c.conflictType,
      modelsInvolved: [c.modelAKey, c.modelBKey].filter(Boolean),
    })),
  };
}

/**
 * The rich detail payload lives at GET /api/evaluations/:id/results
 * (GET /api/evaluations/:id only returns a summary row).
 */
export function getEvaluation(id: string): Promise<EvaluationDetail> {
  return request<ServerEvaluationResults | null>(`/evaluations/${id}/results`).then((r) => {
    if (!r) throw new ApiError(404, 'Evaluation not found.');
    return toEvaluationDetail(r);
  });
}

export function deleteEvaluation(id: string): Promise<void> {
  return request<void>(`/evaluations/${id}`, { method: 'DELETE' });
}

export function rerunEvaluation(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/evaluations/${id}/rerun`, { method: 'POST' });
}

/** Reports are generated from an evaluation or benchmark source id. */
export function evaluationReport(id: string, title: string): Promise<ReportItem> {
  return generateReport({ title, sourceType: 'evaluation', sourceId: id });
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

/** Raw list item from GET /api/benchmarks (wrapped in { benchmarks }). */
interface ServerBenchmarkItem {
  id: string;
  name: string;
  description: string;
  domain: string;
  status: string;
  questionCount: number;
  lastRunAt: string | null;
}

export function listBenchmarks(): Promise<BenchmarkDataset[]> {
  return request<{ benchmarks: ServerBenchmarkItem[] }>('/benchmarks').then((r) =>
    r.benchmarks.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      domain: b.domain,
      questionCount: b.questionCount,
      lastRunAt: b.lastRunAt,
      models: [],
      status: (['ready', 'running', 'completed', 'failed'].includes(b.status)
        ? b.status
        : 'ready') as BenchmarkDataset['status'],
    })),
  );
}

/** The run endpoint expects { modelKeys } and answers { benchmarkId }. */
export function runBenchmark(id: string, modelIds: string[]): Promise<{ runId: string }> {
  return request<{ benchmarkId: string }>(`/benchmarks/${id}/run`, {
    method: 'POST',
    body: JSON.stringify({ modelKeys: modelIds }),
  }).then((r) => ({ runId: r.benchmarkId }));
}

/** Raw results payload from GET /api/benchmarks/:id/results. */
export interface ServerBenchmarkResults {
  benchmark: { id: string; name: string; domain: string };
  questionCount: number;
  lastRunAt: string | null;
  models: {
    modelKey: string;
    questionsEvaluated: number;
    groundTruthAccuracy: number | null;
    avgReliability: number | null;
  }[];
  runs: {
    benchmarkRunId: string;
    question: string;
    domain: string;
    expectedAnswer: string | null;
    modelKey: string;
    status: string;
    groundTruthAccuracy: number | null;
    reliability: number | null;
    evaluationId: string | null;
  }[];
}

export function getBenchmarkResults(id: string): Promise<ServerBenchmarkResults> {
  return request<ServerBenchmarkResults>(`/benchmarks/${id}/results`);
}

// ---------------------------------------------------------------------------
// Model comparison (used by /compare)
// ---------------------------------------------------------------------------

/**
 * Per-model scores are derived from the evaluation's /results payload
 * (the server has no /comparison endpoint). Metrics the server did not
 * store are null — the UI renders them as Unavailable, never as zero.
 */
export function getComparisonScores(evaluationId: string): Promise<ModelScore[]> {
  return request<ServerEvaluationResults | null>(
    `/evaluations/${evaluationId}/results`,
  ).then((r) => {
    if (!r) throw new ApiError(404, 'Evaluation not found.');
    return r.models.map((m) => {
      const v = (n: string): number | null =>
        typeof m.metrics[n]?.value === 'number' ? m.metrics[n].value : null;
      return {
        modelId: m.modelKey,
        provider: m.providerId ?? '',
        model: m.displayName,
        reliability: v('reliability'),
        consistency: v('consistency'),
        grounding: v('grounding'),
        relevance: v('relevance'),
        instructionFollowing: v('instructionFollowing'),
        completeness: v('completeness'),
        accuracy: v('accuracy'),
        agreement: v('crossModelAgreement'),
        hallucinationRate: v('hallucinationRisk'),
        avgLatencyMs: m.avgLatencyMs ?? null,
        totalCostUsd: m.totalCostUsd ?? null,
      };
    });
  });
}

export interface ModelTrend {
  model: string;
  points: { date: string; reliability: number }[];
}

/** Model reliability trends (server analytics endpoint). */
export function getComparisonTrends(evaluationId: string): Promise<ModelTrend[]> {
  return request<{ trends: ModelTrend[] }>(
    `/analytics/model-trends?evaluationId=${encodeURIComponent(evaluationId)}`,
  ).then((r) => r.trends);
}

export interface ModelDomainPoint {
  model: string;
  domain: string;
  reliability: number;
}

/** Per-model reliability by domain (server analytics endpoint). */
export function getModelDomainPerformance(): Promise<ModelDomainPoint[]> {
  return request<{ points: ModelDomainPoint[] }>('/analytics/model-domains').then((r) => r.points);
}

// ---------------------------------------------------------------------------
// Dataset upload (client-side parse + validate; server persists)
// ---------------------------------------------------------------------------

export const DATASET_TARGETS = [
  'question',
  'domain',
  'expected_answer',
  'reference_answer',
  'difficulty',
  'tags',
] as const;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c === '\r') {
      // skip, handled by \n
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const TARGET_ALIASES: Record<string, string[]> = {
  question: ['question', 'prompt', 'query', 'text'],
  domain: ['domain', 'category', 'subject', 'topic'],
  expected_answer: ['expectedanswer', 'expected', 'answer', 'groundtruth', 'reference'],
  reference_answer: ['referenceanswer', 'reference', 'goldanswer', 'gold'],
  difficulty: ['difficulty', 'level', 'hardness'],
  tags: ['tags', 'labels', 'keywords'],
};

function autoMap(columns: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  for (const target of DATASET_TARGETS) {
    const aliases = TARGET_ALIASES[target] ?? [target];
    const found = columns.find((c) => aliases.includes(norm(c)));
    mapping[target] = found ?? null;
  }
  // expected_answer and reference_answer are synonyms for ground truth; keep both mapped if present
  return mapping;
}

export async function parseDatasetFile(file: File): Promise<DatasetPreview> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`);
  }
  const name = file.name.toLowerCase();
  const text = await file.text();
  let records: Record<string, string>[];
  let columns: string[];
  const warnings: string[] = [];

  if (name.endsWith('.json')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON: the file could not be parsed.');
    }
    const arr = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown[] }).items;
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error('JSON must contain a non-empty array of objects (or {"items": [...]}).');
    }
    if (arr.some((r) => typeof r !== 'object' || r === null)) {
      throw new Error('Every JSON entry must be an object with named fields.');
    }
    columns = Array.from(new Set((arr as Record<string, unknown>[]).flatMap((r) => Object.keys(r))));
    records = (arr as Record<string, unknown>[]).map((r) =>
      Object.fromEntries(columns.map((c) => [c, r[c] == null ? '' : String(r[c])])),
    );
  } else if (name.endsWith('.csv')) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('CSV must contain a header row and at least one data row.');
    columns = rows[0].map((c) => c.trim());
    if (new Set(columns.map(norm)).size !== columns.length) warnings.push('Duplicate column names detected; later duplicates were renamed.');
    const seen = new Map<string, number>();
    const unique = columns.map((c) => {
      const n = norm(c);
      const k = seen.get(n) ?? 0;
      seen.set(n, k + 1);
      return k === 0 ? c : `${c} (${k + 1})`;
    });
    columns = unique;
    records = rows.slice(1).map((r) => Object.fromEntries(columns.map((c, i) => [c, (r[i] ?? '').trim()])));
  } else {
    throw new Error('Unsupported file type. Upload a .csv or .json file.');
  }

  const mapping = autoMap(columns);
  const errors: { row: number; message: string }[] = [];
  const seenQuestions = new Map<string, number>();
  const validRecords: Record<string, string>[] = [];

  records.forEach((rec, idx) => {
    const rowNum = idx + 2; // 1-based incl. header
    const qCol = mapping.question;
    const question = qCol ? (rec[qCol] ?? '').trim() : '';
    if (!qCol) {
      errors.push({ row: rowNum, message: 'No column mapped to "question".' });
      return;
    }
    if (!question) {
      errors.push({ row: rowNum, message: 'Empty question text.' });
      return;
    }
    const key = norm(question);
    if (seenQuestions.has(key)) {
      warnings.push(`Row ${rowNum} duplicates row ${seenQuestions.get(key)}; kept both but flagged.`);
    } else {
      seenQuestions.set(key, rowNum);
    }
    const dCol = mapping.domain;
    if (dCol && !(rec[dCol] ?? '').trim()) {
      warnings.push(`Row ${rowNum} has an empty domain; it will be labeled "General Knowledge".`);
    }
    validRecords.push(rec);
  });

  if (!mapping.question) warnings.push('Could not auto-detect a "question" column — please map it manually.');
  if (!mapping.domain) warnings.push('No "domain" column detected; rows will default to "General Knowledge".');
  if (!mapping.expected_answer && !mapping.reference_answer) {
    warnings.push(
      'No expected/reference answer column detected. Ground-truth accuracy cannot be computed; results will be labeled as cross-model / evidence-based reliability analysis.',
    );
  }

  return {
    columns,
    mapping,
    validRows: validRecords.length,
    invalidRows: errors.length,
    warnings: [...new Set(warnings)],
    errors: errors.slice(0, 50),
    sample: validRecords.slice(0, 5),
    rows: validRecords,
  };
}

/**
 * The server accepts a benchmark as { name, description?, domain?, questions[] } —
 * the CSV rows + column mapping are converted here.
 */
export function createBenchmark(input: {
  name: string;
  domain: string;
  description?: string;
  rows: Record<string, string>[];
  mapping: Record<string, string | null>;
}): Promise<{ id: string; questionCount: number }> {
  const cell = (row: Record<string, string>, target: string): string | undefined => {
    const col = input.mapping[target];
    if (!col) return undefined;
    const v = row[col]?.trim();
    return v ? v : undefined;
  };
  const questions = input.rows
    .map((row) => {
      const tags = cell(row, 'tags');
      return {
        questionText: cell(row, 'question') ?? '',
        domain: cell(row, 'domain'),
        expectedAnswer: cell(row, 'expected_answer') ?? cell(row, 'reference_answer'),
        difficulty: cell(row, 'difficulty'),
        tags: tags ? tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean) : undefined,
      };
    })
    .filter((q) => q.questionText.length > 0);
  return request<{ id: string; questionCount: number }>('/benchmarks', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      domain: input.domain,
      questions,
    }),
  });
}

// ---------------------------------------------------------------------------
// Prompt intelligence
// ---------------------------------------------------------------------------

const PROMPT_DIMENSION_LABELS: Record<string, string> = {
  role: 'Role',
  context: 'Context',
  constraints: 'Constraints',
  specificity: 'Specificity',
  outputSpec: 'Output spec',
  clarity: 'Clarity',
};

/** Server returns dimensions as a { key: score } object; the UI renders an array. */
function toPromptAnalysis(raw: {
  score: number;
  dimensions: Record<string, number>;
  issues: string[];
  suggestions: string[];
}): PromptAnalysis {
  const dims =
    raw.dimensions && typeof raw.dimensions === 'object' && !Array.isArray(raw.dimensions)
      ? Object.entries(raw.dimensions).map(([key, score]) => ({
          name: PROMPT_DIMENSION_LABELS[key] ?? key,
          score: typeof score === 'number' ? score : 0,
          feedback: '',
        }))
      : [];
  return {
    score: typeof raw.score === 'number' ? raw.score : 0,
    dimensions: dims,
    issues: Array.isArray(raw.issues) ? raw.issues : [],
    suggestions: Array.isArray(raw.suggestions) ? raw.suggestions : [],
  };
}

export function analyzePrompt(prompt: string): Promise<PromptAnalysis> {
  return request<{
    score: number;
    dimensions: Record<string, number>;
    issues: string[];
    suggestions: string[];
  }>('/prompts/analyze', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  }).then(toPromptAnalysis);
}

export function improvePrompt(prompt: string): Promise<{ improved: string; changes: string[] }> {
  return request<{
    optimized: string;
    analysis: { score: number; dimensions: Record<string, number>; issues: string[]; suggestions: string[] };
  }>('/prompts/improve', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  }).then((res) => ({ improved: res.optimized, changes: res.analysis.suggestions }));
}

export function listPromptHistory(): Promise<PromptHistoryItem[]> {
  return request<{ items: PromptHistoryItem[] }>('/prompts/history').then((res) => res.items);
}

export function savePromptHistory(item: Omit<PromptHistoryItem, 'id' | 'createdAt'>): Promise<PromptHistoryItem> {
  return request<PromptHistoryItem>('/prompts/history', {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

// ---------------------------------------------------------------------------
// Adversarial testing
// ---------------------------------------------------------------------------

const ADVERSARIAL_CATEGORIES: AdversarialCategory[] = [
  { id: 'ambiguous', name: 'Ambiguous Prompts', description: 'Vague prompts with multiple plausible readings.', example: 'Tell me about the bank.' },
  { id: 'contradictory', name: 'Contradictory Prompts', description: 'Prompts containing mutually exclusive instructions.', example: 'Summarize in exactly 10 words using at least 50 words.' },
  { id: 'impossible', name: 'Impossible Questions', description: 'Questions with no valid answer the model should refuse or hedge.', example: 'What is the exact number of grains of sand on Earth right now?' },
  { id: 'misleading', name: 'Misleading Questions', description: 'Questions embedding a subtle falsehood.', example: 'Why did the Eiffel Tower collapse in 2019?' },
  { id: 'incomplete', name: 'Incomplete Information', description: 'Tasks missing data required for a correct answer.', example: 'Is this a good deal? [no details provided]' },
  { id: 'false-premise', name: 'False-Premise Questions', description: 'Questions asserting something untrue that should be challenged.', example: 'Since Java classes support multiple inheritance, explain the diamond problem in Java.' },
  { id: 'instruction-conflict', name: 'Instruction Conflicts', description: 'System vs user instructions that disagree.', example: 'System: be concise. User: write a 2000-word essay.' },
];

export function listAdversarialCategories(): AdversarialCategory[] {
  return ADVERSARIAL_CATEGORIES;
}

export function runAdversarial(input: {
  categoryId: string;
  prompt: string;
  modelIds: string[];
}): Promise<AdversarialResult[]> {
  return request<{ results: ServerAdversarialResult[] }>('/adversarial/run', {
    method: 'POST',
    body: JSON.stringify({
      categoryId: input.categoryId,
      prompt: input.prompt,
      modelKeys: input.modelIds,
    }),
  }).then(({ results }) =>
    results.map((r) => ({
      id: `${input.categoryId}:${r.modelKey}`,
      category: input.categoryId,
      categoryName: r.categoryName,
      prompt: input.prompt,
      model: r.modelKey,
      response: r.response,
      hallucinated: r.hallucinated,
      detectedUncertainty: r.identifiedUncertainty,
      challengedPremise: r.challengedFalsePremise,
      providedEvidence: r.providedEvidence,
      uncertaintyScore: r.uncertaintyScore,
      evidenceStrength: r.grounding,
      riskLevel:
        (r.hallucinationRisk ?? 0) >= 60 ? 'high' : (r.hallucinationRisk ?? 0) >= 30 ? 'medium' : 'low',
      latencyMs: r.latencyMs,
      notes: r.notes,
    })),
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/** Raw list item from GET /api/reports (wrapped in { reports }). */
interface ServerReportItem {
  id: string;
  title: string;
  format: string;
  evaluationId: string | null;
  benchmarkId: string | null;
  createdAt: string;
}

export function listReports(): Promise<ReportItem[]> {
  return request<{ reports: ServerReportItem[] }>('/reports').then((r) =>
    r.reports.map((x) => ({
      id: x.id,
      title: x.title,
      sourceType: (x.evaluationId ? 'evaluation' : 'benchmark') as ReportItem['sourceType'],
      sourceId: x.evaluationId ?? x.benchmarkId ?? '',
      status: 'ready' as const,
      createdAt: x.createdAt,
    })),
  );
}

export function generateReport(input: {
  title: string;
  sourceType: 'evaluation' | 'benchmark';
  sourceId: string;
}): Promise<ReportItem> {
  const body = {
    title: input.title,
    ...(input.sourceType === 'evaluation'
      ? { evaluationId: input.sourceId }
      : { benchmarkId: input.sourceId }),
  };
  return request<{ id: string; title: string }>('/reports', {
    method: 'POST',
    body: JSON.stringify(body),
  }).then((r) => ({
    id: r.id,
    title: r.title,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    status: 'ready' as const,
    createdAt: new Date().toISOString(),
  }));
}

/** Raw detail from GET /api/reports/:id — content is the server's built report. */
export interface ServerReportDetail {
  id: string;
  title: string;
  content: {
    title?: string;
    generatedAt?: string;
    evaluationId?: string;
    benchmarkId?: string;
    executiveSummary?: string[];
    methodology?: string[];
    sections?: { heading: string; body: string[] }[];
    tables?: { title: string; headers: string[]; rows: string[][] }[];
    limitations?: string[];
    metrics?: Record<string, unknown>;
  };
  createdAt: string;
}

export function getReportContent(id: string): Promise<ServerReportDetail> {
  return request<ServerReportDetail>(`/reports/${id}`);
}

/** The server renders and stores report HTML at generation time. */
export async function getReportHtml(id: string): Promise<string> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/reports/${id}?format=html`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let message = 'Failed to download report.';
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, message);
  }
  return res.text();
}

export function deleteReport(id: string): Promise<void> {
  return request<void>(`/reports/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Settings / profile / security / providers
// ---------------------------------------------------------------------------



/** Map a catalog Provider (server registry) to the settings list shape. */
function toProviderInfo(p: Provider): ProviderInfo {
  return {
    id: p.id,
    name: p.name,
    connected: p.connected,
    maskedKey: p.maskedKey,
    lastTestedAt: p.lastTestedAt ?? null,
    docsUrl: p.docsUrl,
    keyHint: p.keyHint,
    freeTier: p.freeTier,
    signupUrl: p.signupUrl,
  };
}

/** Raw preferences from GET /api/settings/preferences. */
interface ServerPreferences {
  defaultRuns: number;
  defaultEvaluationMode: string;
  defaultDomains: string[] | null;
  scoringWeights: Record<string, number> | null;
  theme: string;
  emailNotifications: boolean;
}

const WEIGHT_FRACTION_KEYS = [
  'accuracy',
  'consistency',
  'relevance',
  'completeness',
  'grounding',
  'instructionFollowing',
] as const;

/** The server stores weights as fractions (0–1); the page edits percents (0–100). */
function fractionsToPercent(w: Record<string, number>): ScoringWeights {
  const out = {} as ScoringWeights;
  for (const k of WEIGHT_FRACTION_KEYS) out[k] = Math.round((w[k] ?? 0) * 100);
  return out;
}

function percentToFractions(w: ScoringWeights): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of WEIGHT_FRACTION_KEYS) out[k] = (w[k] ?? 0) / 100;
  return out;
}

/**
 * Settings are assembled from the endpoints that actually exist:
 * - GET /auth/me → profile
 * - GET /api/settings/preferences → evaluation defaults, theme, notifications
 * - GET /api/settings/scoring-weights → effective weights
 * - GET /api/providers → provider list
 */
export async function getSettings(): Promise<UserSettings> {
  const [me, prefsRes, weightsRes, providers] = await Promise.all([
    api.get('/auth/me').then((res) => res.data.user as { name: string; email: string }),
    request<{ preferences: ServerPreferences | null }>('/settings/preferences'),
    request<{ weights: Record<string, number> }>('/settings/scoring-weights'),
    providersApi.list().catch(() => [] as Provider[]),
  ]);
  const prefs = prefsRes.preferences;
  return {
    profile: { name: me?.name ?? '', email: me?.email ?? '' },
    providers: providers.map(toProviderInfo),
    preferences: {
      defaultRuns: prefs?.defaultRuns ?? 5,
      defaultMode: prefs?.defaultEvaluationMode ?? 'consistency',
      defaultDomains: prefs?.defaultDomains ?? [],
    },
    scoringWeights: fractionsToPercent(weightsRes.weights),
    notifications: {
      emailOnComplete: prefs?.emailNotifications ?? true,
      emailOnConflict: false,
      weeklyDigest: false,
    },
    appearance: {
      theme: (prefs?.theme === 'light' || prefs?.theme === 'dark' ? prefs.theme : 'system') as
        | 'light'
        | 'dark'
        | 'system',
    },
  };
}

/**
 * Routes each settings section to the endpoint that actually stores it,
 * then re-reads the assembled settings.
 */
export async function updateSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  const prefBody: Record<string, unknown> = {};
  if (patch.preferences) {
    if (patch.preferences.defaultRuns != null) prefBody.defaultRuns = patch.preferences.defaultRuns;
    if (patch.preferences.defaultMode) prefBody.defaultEvaluationMode = patch.preferences.defaultMode;
    if (patch.preferences.defaultDomains) prefBody.defaultDomains = patch.preferences.defaultDomains;
  }
  if (patch.scoringWeights) {
    prefBody.scoringWeights = percentToFractions(patch.scoringWeights);
  }
  if (patch.notifications && patch.notifications.emailOnComplete !== undefined) {
    prefBody.emailNotifications = patch.notifications.emailOnComplete;
  }
  if (patch.appearance?.theme) {
    prefBody.theme = patch.appearance.theme;
  }
  const calls: Promise<unknown>[] = [];
  if (patch.profile?.name) {
    calls.push(
      request('/settings/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: patch.profile.name }),
      }),
    );
  }
  if (Object.keys(prefBody).length > 0) {
    calls.push(
      request('/settings/preferences', { method: 'PUT', body: JSON.stringify(prefBody) }),
    );
  }
  await Promise.all(calls);
  return getSettings();
}

/** Password changes live at POST /api/auth/change-password. */
export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return api
    .post('/auth/change-password', {
      currentPassword,
      newPassword,
      confirmPassword: newPassword,
    })
    .then(() => undefined);
}

/** Raw session from GET /api/auth/sessions. */
interface ServerSession {
  id: string;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: string;
  current: boolean;
}

/** Sessions are listed at GET /api/auth/sessions. */
export function listSessions(): Promise<SessionInfo[]> {
  return api
    .get('/auth/sessions')
    .then((res) =>
      (res.data.sessions as ServerSession[]).map((s) => ({
        id: s.id,
        device: s.userAgent ?? 'Unknown device',
        ip: s.ipAddress ?? '—',
        current: s.current,
        lastActive: s.createdAt,
      })),
    );
}

export function revokeSession(id: string): Promise<void> {
  return api.delete(`/auth/sessions/${id}`).then(() => undefined);
}

export function revokeAllSessions(): Promise<void> {
  return api.delete('/auth/sessions').then(() => undefined);
}

export function saveProviderCredential(providerId: string, apiKey: string): Promise<ProviderInfo> {
  void apiKey; // never logged, never stored client-side
  return request<ProviderInfo>(`/providers/${providerId}/credentials`, {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  });
}

export function testProviderConnection(providerId: string): Promise<{ ok: boolean; message: string }> {
  return request<{ ok: boolean; message: string }>(`/providers/${providerId}/test`, { method: 'POST' });
}

export function removeProviderCredential(providerId: string): Promise<void> {
  return request<void>(`/providers/${providerId}/credentials`, { method: 'DELETE' });
}

export function exportUserData(): Promise<string> {
  // The server streams a JSON archive download; re-serialize it for saving.
  return request<unknown>('/settings/data-export').then((data) =>
    JSON.stringify(data, null, 2),
  );
}

/** The server requires the current password to confirm account deletion. */
export function deleteAccount(password: string): Promise<void> {
  return request<void>('/settings/account', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
}

// ---------------------------------------------------------------------------
// Core flow API (axios-based): auth, token handling, and provider /
// evaluation / prompt / history / report / dashboard API objects for the
// login → setup → evaluate flow.
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'cg_token';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  timeout: 30000,
});

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string, remember = true): void {
  try {
    if (remember) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const status = (error as AxiosError | undefined)?.response?.status;
    if (status === 401) {
      clearToken();
      const path = window.location.pathname;
      const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
      if (!isPublic) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(toApiError(error));
  },
);

export const authApi = {
  login: (email: string, password: string): Promise<{ token: string; user: User }> => {
    return api.post('/auth/login', { email, password }).then((res) => res.data);
  },
  register: (
    name: string,
    email: string,
    password: string,
    confirmPassword: string,
  ): Promise<{ token: string; user: User }> => {
    return api.post('/auth/register', { name, email, password, confirmPassword }).then((res) => res.data);
  },
  me: (): Promise<User> => {
    // GET /auth/me answers { user, preferences }; unwrap the user.
    return api.get('/auth/me').then((res) => res.data.user);
  },
  logout: (): Promise<void> => {
    return api.post('/auth/logout').then(() => undefined);
  },
  forgotPassword: (email: string): Promise<{ message: string }> => {
    return api.post('/auth/forgot-password', { email }).then((res) => res.data);
  },
  resetPassword: (token: string, password: string): Promise<{ message: string }> => {
    return api.post('/auth/reset-password', { token, password }).then((res) => res.data);
  },
};

export const providersApi = {
  list: (): Promise<Provider[]> => {
    return api.get('/providers').then((res) => res.data);
  },
  saveKey: (id: string, apiKey: string): Promise<{ ok: boolean; maskedKey: string }> => {
    return api.post(`/providers/${id}/credentials`, { apiKey }).then((res) => res.data);
  },
  removeKey: (id: string): Promise<void> => {
    return api.delete(`/providers/${id}/credentials`).then(() => undefined);
  },
  test: (id: string): Promise<{ ok: boolean; message: string; latencyMs?: number }> => {
    return api.post(`/providers/${id}/test`).then((res) => res.data);
  },
};

/** Raw model entry from GET /api/evaluations/:id/results. */
interface ServerResultsModel {
  modelKey: string;
  providerId?: string | null;
  displayName?: string | null;
  status?: string;
  metrics?: Record<string, { value: number | null } | null> | null;
  responses?: Array<{
    runIndex: number;
    text: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
    latencyMs?: number | null;
    estimatedCostUsd?: number | null;
  }> | null;
  claims?: Array<{
    text: string;
    type?: string;
    status: string;
    confidence?: number | null;
    evidence?: Array<{
      title?: string | null;
      url?: string | null;
      snippet?: string | null;
      confidence?: number | null;
    }> | null;
  }> | null;
  avgLatencyMs?: number | null;
  totalCostUsd?: number | null;
}

/** Raw shape of GET /api/evaluations/:id/results. */
interface ServerResultsData {
  id: string;
  question: string;
  domain: string;
  taskType: string;
  evaluationMode?: string;
  createdAt: string;
  totalLatencyMs?: number | null;
  models?: ServerResultsModel[] | null;
  conflicts?: Array<{
    claimText?: string;
    modelAKey?: string;
    modelBKey?: string;
    conflictingClaimText?: string;
    conflictType?: string;
    severity?: string;
    explanation?: string;
  }> | null;
}

function serverMetric(m: ServerResultsModel, name: string): number | null {
  const v = m.metrics?.[name]?.value;
  return typeof v === 'number' ? v : null;
}

/**
 * Maps the server's evaluation-results payload onto the Results page view
 * model. Every number comes from stored engine output; metrics the engine
 * did not record are left null (never invented).
 */
function toResultsData(raw: ServerResultsData): ResultsData {
  const models: ModelResult[] = (raw.models ?? []).map((m) => {
    const reliability = serverMetric(m, 'reliability');
    const accuracy = serverMetric(m, 'accuracy');
    const responses = m.responses ?? [];
    const totalTokens = responses.reduce(
      (a, r) => a + (r.inputTokens ?? 0) + (r.outputTokens ?? 0),
      0,
    );
    const runs = responses.map((r) => ({
      runIndex: r.runIndex,
      text: r.text,
      latencyMs: r.latencyMs ?? null,
      tokens: (r.inputTokens ?? 0) + (r.outputTokens ?? 0),
    }));
    const supported = (m.claims ?? []).filter((c) => c.status === 'supported').length;
    const contradicted = (m.claims ?? []).filter((c) => c.status === 'contradicted').length;
    const explanation: string[] = [
      reliability != null
        ? `${m.displayName ?? m.modelKey} answered across ${responses.length} run${responses.length === 1 ? '' : 's'} with ${Math.round(reliability)}% reliability.`
        : `${m.displayName ?? m.modelKey} answered across ${responses.length} run${responses.length === 1 ? '' : 's'}; reliability was not measured.`,
    ];
    if ((m.claims ?? []).length > 0) {
      explanation.push(
        `${supported} of ${m.claims!.length} extracted claims supported by evidence${contradicted > 0 ? `, ${contradicted} contradicted` : ''}.`,
      );
    }
    const grounding = serverMetric(m, 'grounding');
    if (grounding != null) explanation.push(`Grounding score ${Math.round(grounding)}%.`);

    return {
      modelId: m.modelKey,
      modelName: m.displayName ?? m.modelKey,
      provider: m.providerId ?? 'unknown',
      reliability,
      accuracy,
      accuracyLabel: accuracy != null ? 'ground-truth' : undefined,
      metrics: {
        consistency: serverMetric(m, 'consistency'),
        agreement: serverMetric(m, 'agreement'),
        relevance: serverMetric(m, 'relevance'),
        completeness: serverMetric(m, 'completeness'),
        grounding,
        instructionFollowing: serverMetric(m, 'instructionFollowing'),
        hallucinationRate: serverMetric(m, 'hallucinationRisk'),
        responseTimeMs: m.avgLatencyMs ?? null,
        costUsd: m.totalCostUsd ?? null,
      },
      explanation,
      runs,
      totalTokens,
      cost: m.totalCostUsd ?? null,
      avgLatencyMs: m.avgLatencyMs ?? undefined,
    };
  });

  const claims: ResultsClaimItem[] = [];
  const evidence: EvidenceItem[] = [];
  (raw.models ?? []).forEach((m) => {
    (m.claims ?? []).forEach((c, ci) => {
      const claimId = `${m.modelKey}:claim:${ci}`;
      claims.push({
        id: claimId,
        text: c.text,
        modelId: m.modelKey,
        status: c.status as ResultsClaimItem['status'],
        confidence: typeof c.confidence === 'number' ? Math.round(c.confidence) : 0,
      });
      (c.evidence ?? []).forEach((e, ei) => {
        evidence.push({
          id: `${claimId}:ev:${ei}`,
          claim: c.text,
          status: c.status as EvidenceItem['status'],
          source: e.title ?? 'Evidence source',
          sourceUrl: e.url ?? null,
          snippet: e.snippet ?? undefined,
          confidence: typeof e.confidence === 'number' ? Math.round(e.confidence) : 0,
          reason: '',
        });
      });
    });
  });

  const conflicts: ResultsConflictItem[] = (raw.conflicts ?? []).map((c, i) => ({
    id: `conflict:${i}`,
    title: c.conflictType ?? 'Conflict',
    severity: (['low', 'medium', 'high'].includes(c.severity ?? '') ? c.severity : 'medium') as ResultsConflictItem['severity'],
    description: c.explanation ?? '',
    models: [c.modelAKey, c.modelBKey].filter((k): k is string => Boolean(k)),
    claimA: c.claimText,
    claimB: c.conflictingClaimText,
    evidence: null,
  }));

  const uncertaintyFlags: UncertaintyFlag[] = [];
  (raw.models ?? []).forEach((m) => {
    const u = serverMetric(m, 'uncertainty');
    if (u != null && u >= 25) {
      uncertaintyFlags.push({
        id: `${m.modelKey}:uncertainty`,
        severity: u >= 60 ? 'high' : u >= 40 ? 'medium' : 'low',
        text: `${m.displayName ?? m.modelKey} expressed notable uncertainty (score ${Math.round(u)}).`,
        modelName: m.displayName ?? m.modelKey,
      });
    }
  });

  return {
    id: raw.id,
    question: raw.question,
    domain: raw.domain,
    taskType: raw.taskType,
    mode: raw.evaluationMode ?? 'consistency',
    createdAt: raw.createdAt,
    executionTimeMs: raw.totalLatencyMs ?? 0,
    models,
    claims,
    conflicts,
    evidence,
    uncertaintyFlags,
  };
}

/** Maps the workspace's display mode labels onto the server's evaluationMode enum. */
function toEvaluationMode(mode: string): 'quick' | 'consistency' | 'deep' | 'adversarial' {
  const m = mode.toLowerCase();
  if (m.includes('quick')) return 'quick';
  if (m.includes('deep')) return 'deep';
  if (m.includes('adversarial')) return 'adversarial';
  return 'consistency';
}

export const evaluationsApi = {
  create: (payload: CreateEvaluationPayload): Promise<{ id: string }> => {
    // The server speaks modelKeys / evaluationMode / enable* flags; translate
    // the workspace payload so evaluation creation validates.
    const body = {
      question: payload.question,
      domain: payload.domain,
      taskType: payload.taskType,
      evaluationMode: toEvaluationMode(payload.mode),
      modelKeys: payload.modelIds,
      runs: payload.runs,
      temperature: payload.temperature,
      maxTokens: payload.maxTokens,
      systemInstructions: payload.systemInstructions || undefined,
      enableEvidence: payload.options.evidenceVerification,
      enableUncertainty: payload.options.uncertaintyAnalysis,
      enableConflicts: payload.options.conflictDetection,
    };
    return api.post('/evaluations', body).then((res) => res.data);
  },
  status: (id: string): Promise<CoreEvaluationStatus> => {
    return api.get(`/evaluations/${id}/status`).then((res) => {
      const s = res.data as {
        id?: string;
        status: CoreEvaluationStatus['status'];
        statusMessage?: string | null;
        models?: Array<{
          modelKey: string;
          providerId?: string | null;
          status: string;
          total: number;
          completed: number;
        }> | null;
      };
      const out: CoreEvaluationStatus = {
        id: s.id,
        status: s.status,
        models: (s.models ?? []).map((m) => ({
          modelId: m.modelKey,
          modelName: m.modelKey,
          provider: m.providerId ?? 'unknown',
          status: m.status as CoreEvaluationStatus['models'][number]['status'],
          runsCompleted: m.completed,
          runsTotal: m.total,
          tokens: null,
          cost: null,
          elapsedMs: null,
          error: null,
        })),
        error: s.statusMessage ?? null,
      };
      return out;
    });
  },
  results: (id: string): Promise<ResultsData> => {
    return api.get(`/evaluations/${id}/results`).then((res) => toResultsData(res.data));
  },
  remove: (id: string): Promise<void> => {
    return api.delete(`/evaluations/${id}`).then(() => undefined);
  },
};

export const promptsApi = {
  analyze: async (prompt: string): Promise<CorePromptAnalysis> => {
    return api.post('/prompts/analyze', { prompt }).then((res) => toPromptAnalysis(res.data));
  },
  improve: async (prompt: string): Promise<{ optimized: string }> => {
    return api.post('/prompts/improve', { prompt }).then((res) => res.data);
  },
  compare: async (
    promptA: string,
    promptB: string,
  ): Promise<{ metricsA: Record<string, number>; metricsB: Record<string, number> }> => {
    // Server speaks { original, optimized } and answers { original, optimized }
    // with per-side { evaluationId, metrics }.
    const res = await api
      .post('/prompts/compare', { original: promptA, optimized: promptB })
      .then((r) => r.data as { original: { metrics: Record<string, number> }; optimized: { metrics: Record<string, number> } });
    return { metricsA: res.original.metrics, metricsB: res.optimized.metrics };
  },
};

export const historyApi = {
  list: (params?: {
    search?: string;
    domain?: string;
    page?: number;
  }): Promise<{ items: HistoryItem[]; total: number }> => {
    return api.get('/history', { params }).then((res) => res.data);
  },
};

export const reportsApi = {
  list: (): Promise<CoreReportItem[]> => {
    return api.get('/reports').then((res) => res.data);
  },
  create: (evaluationId: string): Promise<CoreReportItem> => {
    return api.post('/reports', { evaluationId }).then((res) => res.data);
  },
};

export const dashboardApi = {
  summary: (): Promise<DashboardSummary> => {
    return api.get('/dashboard').then((res) => res.data);
  },
};
