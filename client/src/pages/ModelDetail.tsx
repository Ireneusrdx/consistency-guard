import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  ProgressBar,
  ResponseViewer,
  ScoreRing,
  Select,
  Tabs,
} from '../components/ui/index';
import { EvidenceCard } from '../components/ui/EvidenceCard';
import { useToast } from '../components/ui/Toast';
import { evaluationsApi, toApiError } from '../lib/api';
import type { ResultsData } from '../types';

function fmtMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return 'Unavailable';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtCost(c: number | null | undefined): string {
  if (c == null || Number.isNaN(c)) return 'Unavailable';
  return `$${c.toFixed(4)}`;
}

function formatConfidence(c: number): string {
  const pct = c <= 1 ? Math.round(c * 100) : Math.round(c);
  return `${pct}%`;
}

type NumericMetricKey =
  | 'consistency'
  | 'agreement'
  | 'relevance'
  | 'completeness'
  | 'grounding'
  | 'instructionFollowing';

const METRIC_ROWS: { key: NumericMetricKey; label: string }[] = [
  { key: 'consistency', label: 'Consistency' },
  { key: 'agreement', label: 'Agreement' },
  { key: 'relevance', label: 'Relevance' },
  { key: 'completeness', label: 'Completeness' },
  { key: 'grounding', label: 'Grounding' },
  { key: 'instructionFollowing', label: 'Instruction Following' },
];

function claimStatusVariant(status: string): 'success' | 'error' | 'warning' {
  if (status === 'supported') return 'success';
  if (status === 'contradicted') return 'error';
  return 'warning';
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ModelDetail() {
  const { evaluationId: id, modelId } = useParams();
  const { toast } = useToast();

  const [activeRun, setActiveRun] = useState('0');
  const [compareWith, setCompareWith] = useState('');

  const query = useQuery({
    queryKey: ['results', id],
    queryFn: () => evaluationsApi.results(id as string),
    enabled: Boolean(id),
  });
  const data: ResultsData | undefined = query.data;

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <LoadingState message="Loading model details..." />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <ErrorState
          title="Failed to load model details"
          message={toApiError(query.error).message}
          onRetry={() => query.refetch()}
        />
        <Link
          to={`/evaluate/${id}/results`}
          className="text-sm font-medium text-primary-600 hover:underline"
        >
          ← Back to results
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <ErrorState
          title="No results"
          message="No result data was returned for this evaluation."
        />
      </div>
    );
  }

  const model = data.models.find((m) => m.modelId === modelId);

  if (!model) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Link
          to={`/evaluate/${id}/results`}
          className="text-sm font-medium text-primary-600 hover:underline"
        >
          ← Back to results
        </Link>
        <ErrorState
          title="Model not found"
          message={`No model with id "${modelId}" was found in this evaluation.`}
        />
      </div>
    );
  }

  const runs = model.runs;
  const latestRun = runs[runs.length - 1];
  const active = runs.find((r) => String(r.runIndex) === activeRun) ?? latestRun;
  const otherModels = data.models.filter((m) => m.modelId !== model.modelId);
  const compareModel = otherModels.find((m) => m.modelId === compareWith);
  const compareLatest = compareModel?.runs[compareModel.runs.length - 1];
  const modelClaims = data.claims.filter((c) => c.modelId === model.modelId);

  const copyResponse = async () => {
    try {
      await navigator.clipboard.writeText(latestRun?.text ?? '');
      toast('Response copied to clipboard.', 'success');
    } catch {
      toast('Could not access the clipboard.', 'error');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <Link
        to={`/evaluate/${id}/results`}
        className="text-sm font-medium text-primary-600 hover:underline"
      >
        ← Back to results
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        {model.reliability != null ? (
          <ScoreRing score={model.reliability} size={96} label={`${model.modelName} reliability`} />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-stone-100 text-xs italic text-stone-400 dark:bg-stone-800 dark:text-stone-500">
            Unavailable
          </div>
        )}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">
            {model.modelName}
          </h1>
          <div className="flex flex-wrap gap-2">
            <Badge>{model.provider}</Badge>
            <Badge variant={model.accuracyLabel === 'ground-truth' ? 'info' : 'warning'}>
              {model.accuracyLabel === 'ground-truth'
                ? 'Ground-truth accuracy'
                : 'Accuracy unavailable'}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-4 lg:col-span-2">
          <Card title="Full response" subtitle="Latest run output.">
            <div className="p-5">
              <ResponseViewer text={latestRun?.text ?? 'No response recorded.'} />
            </div>
          </Card>

          <Card title="Run-by-run responses">
            <div className="space-y-4 p-5">
              {runs.length > 0 ? (
                <>
                  <Tabs
                    tabs={runs.map((r) => ({
                      id: String(r.runIndex),
                      label: `Run ${r.runIndex + 1}`,
                    }))}
                    value={activeRun}
                    onChange={setActiveRun}
                  />
                  <ResponseViewer text={active?.text ?? 'No response recorded.'} />
                  <div className="flex flex-wrap gap-4 text-sm text-stone-600 dark:text-stone-300">
                    <span>Latency: {fmtMs(active?.latencyMs)}</span>
                    <span>
                      Run {(active?.runIndex ?? 0) + 1} of {runs.length}
                    </span>
                  </div>
                </>
              ) : (
                <EmptyState title="No runs" description="This model has no recorded runs." />
              )}
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <Card title="Metrics">
            <div className="space-y-3 p-5">
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-stone-600 dark:text-stone-300">Reliability</span>
                  <span className="font-medium text-stone-700 dark:text-stone-200">
                    {model.reliability != null ? `${model.reliability}%` : 'Unavailable'}
                  </span>
                </div>
                {model.reliability != null ? (
                  <ProgressBar value={model.reliability} />
                ) : (
                  <p className="text-xs italic text-slate-400 dark:text-slate-500">Not measured.</p>
                )}
              </div>
              {METRIC_ROWS.map(({ key, label }) => (
                <div key={key}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-stone-600 dark:text-stone-300">{label}</span>
                    <span className="font-medium text-stone-700 dark:text-stone-200">
                      {model.metrics[key] != null ? model.metrics[key] : 'Unavailable'}
                    </span>
                  </div>
                  {model.metrics[key] != null ? (
                    <ProgressBar value={model.metrics[key] as number} />
                  ) : (
                    <p className="text-xs italic text-slate-400 dark:text-slate-500">Not measured.</p>
                  )}
                </div>
              ))}
              <div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-600 dark:text-stone-300">Accuracy</span>
                  <span className="font-medium text-stone-700 dark:text-stone-200">
                    {model.accuracy != null ? `${model.accuracy}%` : 'Unavailable'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                  {model.accuracy != null
                    ? 'Measured against ground truth.'
                    : 'No reference answers were provided for this evaluation.'}
                </p>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-stone-600 dark:text-stone-300">Hallucination Rate</span>
                  <span className="font-medium text-stone-700 dark:text-stone-200">
                    {model.metrics.hallucinationRate != null ? `${model.metrics.hallucinationRate}%` : 'Unavailable'}
                  </span>
                </div>
                {model.metrics.hallucinationRate != null ? (
                  <ProgressBar value={model.metrics.hallucinationRate} tone="error" />
                ) : (
                  <p className="text-xs italic text-slate-400 dark:text-slate-500">Not measured.</p>
                )}
                <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                  Lower is better.
                </p>
              </div>
            </div>
          </Card>

          <Card title="Metadata">
            <dl className="space-y-2 p-5 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-500 dark:text-stone-400">Latency</dt>
                <dd className="font-medium text-stone-800 dark:text-stone-100">
                  {fmtMs(model.avgLatencyMs)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-500 dark:text-stone-400">Tokens</dt>
                <dd className="font-medium text-stone-800 dark:text-stone-100">
                  {model.totalTokens != null ? model.totalTokens.toLocaleString() : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-500 dark:text-stone-400">Cost</dt>
                <dd className="font-medium text-stone-800 dark:text-stone-100">
                  {fmtCost(model.cost)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-500 dark:text-stone-400">Provider</dt>
                <dd className="font-medium text-stone-800 dark:text-stone-100">
                  {model.provider}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-stone-500 dark:text-stone-400">Model ID</dt>
                <dd className="break-all font-mono text-xs text-stone-800 dark:text-stone-100">
                  {model.modelId}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={copyResponse}>
          Copy response
        </Button>
        <Button variant="outline" onClick={() => downloadJson(`model-${modelId}.json`, model)}>
          Export JSON
        </Button>
        <div className="flex items-center gap-2">
          <label
            htmlFor="md-compare"
            className="text-sm font-medium text-stone-700 dark:text-stone-200"
          >
            Compare with
          </label>
          <Select
            id="md-compare"
            value={compareWith}
            onChange={(e) => setCompareWith(e.target.value)}
            options={[
              { value: '', label: 'Select a model' },
              ...otherModels.map((m) => ({ value: m.modelId, label: m.modelName })),
            ]}
          />
        </div>
      </div>

      {compareModel && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title={`${model.modelName} — latest run`}>
            <div className="p-5">
              <ResponseViewer text={latestRun?.text ?? 'No response recorded.'} />
            </div>
          </Card>
          <Card title={`${compareModel.modelName} — latest run`}>
            <div className="p-5">
              <ResponseViewer text={compareLatest?.text ?? 'No response recorded.'} />
            </div>
          </Card>
        </div>
      )}

      {/* Claims */}
      <Card title="Claims" subtitle={`Claims extracted from ${model.modelName}.`}>
        <div className="p-5">
          <DataTable
            rows={modelClaims}
            keyOf={(c) => c.id}
            emptyMessage="No claims were extracted for this model."
            columns={[
              {
                key: 'claim',
                header: 'Claim',
                className: 'max-w-md',
                render: (c) => c.text,
              },
              {
                key: 'status',
                header: 'Status',
                render: (c) => <Badge variant={claimStatusVariant(c.status)}>{c.status}</Badge>,
              },
              {
                key: 'confidence',
                header: 'Confidence',
                render: (c) => formatConfidence(c.confidence),
              },
            ]}
          />
        </div>
      </Card>

      {/* Evidence */}
      <div>
        <h2 className="mb-1 text-lg font-semibold text-stone-900 dark:text-stone-100">Evidence</h2>
        <p className="mb-3 text-sm text-stone-500 dark:text-stone-400">
          Sources are external references, distinct from AI-generated analysis.
        </p>
        <div className="space-y-3">
          {data.evidence.length === 0 ? (
            <EmptyState title="No evidence" description="No evidence was attached to these claims." />
          ) : (
            data.evidence.map((e) => <EvidenceCard key={e.id} evidence={e} />)
          )}
        </div>
      </div>
    </div>
  );
}
