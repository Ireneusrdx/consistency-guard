/**
 * Shared types for the Consistency Guard core evaluation flow.
 *
 * These shapes are consumed by the core pages (Auth, ProviderSetup,
 * ModelSelection, QuestionWorkspace, EvaluationRunning, Results, ModelDetail),
 * the reusable ui/* component library and lib/api.ts.
 */

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

export interface Provider {
  id: string;
  name: string;
  description: string;
  docsUrl: string;
  connected: boolean;
  maskedKey: string | null;
  models: ModelInfo[];
  /** Format hint for the key input, e.g. "sk_… / pk_…". */
  keyHint?: string;
  /** True for free-tier gateways like Pollinations. */
  freeTier?: boolean;
  /** Where to get a key (defaults to docsUrl). */
  signupUrl?: string;
  lastTestedAt?: string | null;
}

export type ModelSpeed = 'fast' | 'medium' | 'slow';

export interface ModelInfo {
  id: string;
  providerId: string;
  providerName: string;
  displayName: string;
  contextLength?: number | null;
  estCostPer1k?: number | null;
  speed: ModelSpeed;
  available: boolean;
}

export interface PromptDimension {
  name: string;
  score: number;
  detail?: string;
}

export interface PromptAnalysis {
  score: number;
  issues: string[];
  suggestions: string[];
  dimensions: PromptDimension[];
}

export type EvalModelStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'unavailable';

export interface ModelRunStatus {
  modelId: string;
  modelName: string;
  provider: string;
  status: EvalModelStatus;
  runsCompleted: number;
  runsTotal: number;
  tokens: number | null;
  cost: number | null;
  elapsedMs: number | null;
  error: string | null;
}

export type EvaluationStatusValue = 'pending' | 'running' | 'completed' | 'failed' | 'partial';

export interface EvaluationStatus {
  id?: string;
  status: EvaluationStatusValue;
  startedAt?: string;
  elapsedMs?: number;
  models: ModelRunStatus[];
  error?: string | null;
}

export interface ModelMetrics {
  /** Null when the engine did not record the metric — never 0-fallback. */
  consistency: number | null;
  agreement: number | null;
  relevance: number | null;
  completeness: number | null;
  grounding: number | null;
  instructionFollowing: number | null;
  hallucinationRate: number | null;
  responseTimeMs: number | null;
  costUsd: number | null;
}

export interface RunResult {
  runIndex: number;
  text: string;
  latencyMs: number | null;
  tokens: number | null;
}

export interface ModelResult {
  modelId: string;
  modelName: string;
  provider: string;
  /** Null when the engine did not record reliability — never 0-fallback. */
  reliability: number | null;
  /** Ground-truth accuracy when a reference answer exists, otherwise null. */
  accuracy: number | null;
  accuracyLabel?: 'ground-truth' | 'estimated';
  metrics: ModelMetrics;
  /** Human-readable explanation bullets generated from the evaluation data. */
  explanation: string[];
  runs: RunResult[];
  /** Aggregates used by the running-progress simulation. */
  totalTokens?: number | null;
  cost?: number | null;
  avgLatencyMs?: number;
}

export type ClaimStatus = 'supported' | 'contradicted' | 'unverified';

export interface ClaimItem {
  id: string;
  text: string;
  modelId: string;
  status: ClaimStatus;
  confidence: number;
}

export interface ConflictItem {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  models: string[];
  claimA?: string;
  claimB?: string;
  evidence?: string | null;
}

export interface EvidenceItem {
  id: string;
  claim: string;
  status: ClaimStatus;
  source: string;
  sourceUrl?: string | null;
  snippet?: string;
  confidence: number;
  reason: string;
}

export interface UncertaintyFlag {
  id: string;
  severity: 'low' | 'medium' | 'high';
  text: string;
  modelName?: string;
}

export interface ResultsData {
  id: string;
  question: string;
  domain: string;
  taskType: string;
  mode: string;
  createdAt: string;
  executionTimeMs: number;
  models: ModelResult[];
  claims: ClaimItem[];
  conflicts: ConflictItem[];
  evidence: EvidenceItem[];
  uncertaintyFlags: UncertaintyFlag[];
}

export interface HistoryItem {
  id: string;
  question: string;
  domain: string;
  taskType: string;
  models: string[];
  reliability: number | null;
  consistency: number | null;
  conflicts: number;
  createdAt: string;
  status: EvaluationStatusValue;
}

export interface ReportItem {
  id: string;
  title: string;
  evaluationId: string;
  createdAt: string;
  downloadUrl: string;
}

export interface DashboardSummary {
  totalEvaluations: number;
  modelsTested: number;
  avgReliability: number | null;
  avgConsistency: number | null;
  conflictsDetected: number;
  claimsVerified: number;
  reportsGenerated: number;
  reliabilityOverTime: { date: string; reliability: number }[];
  recent: HistoryItem[];
}

export interface CreateEvaluationPayload {
  question: string;
  domain: string;
  taskType: string;
  mode: string;
  modelIds: string[];
  runs: number;
  temperature: number;
  maxTokens: number;
  timeoutSec: number;
  systemInstructions?: string;
  options: {
    evidenceVerification: boolean;
    factChecking: boolean;
    promptAnalysis: boolean;
    uncertaintyAnalysis: boolean;
    conflictDetection: boolean;
  };
}
