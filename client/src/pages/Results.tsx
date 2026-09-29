import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Badge,
  Button,
  Card,
  ChartCard,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  ProgressBar,
  ScoreRing,
  Tabs,
} from '../components/ui/index';
import { ConflictCard } from '../components/ui/ConflictCard';
import { EvidenceCard } from '../components/ui/EvidenceCard';
import { useToast } from '../components/ui/Toast';
import { evaluationsApi, reportsApi, toApiError } from '../lib/api';
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

type TabId = 'overview' | 'compare' | 'consistency' | 'claims' | 'conflicts';

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

function severityVariant(severity: string): 'error' | 'warning' | 'info' {
  if (severity === 'high') return 'error';
  if (severity === 'medium') return 'warning';
  return 'info';
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

export default function Results() {
  const { evaluationId: id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [tab, setTab] = useState<TabId>('overview');
  const [reportBusy, setReportBusy] = useState(false);

  const query = useQuery({
    queryKey: ['results', id],
    queryFn: () => evaluationsApi.results(id as string),
    enabled: Boolean(id),
  });
  const data: ResultsData | undefined = query.data;

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <LoadingState message="Loading results..." />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <ErrorState
          title="Failed to load results"
          message={toApiError(query.error).message}
          onRetry={() => query.refetch()}
        />
        <Button variant="ghost" onClick={() => navigate('/evaluate/question')}>
          Back to question workspace
        </Button>
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

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'compare', label: 'Model Comparison' },
    { id: 'consistency', label: 'Consistency' },
    { id: 'claims', label: 'Claims & Evidence' },
    { id: 'conflicts', label: 'Conflicts', badge: data.conflicts.length },
  ];

  const modelNames = new Map(data.models.map((m) => [m.modelId, m.modelName]));

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(data.id);
      toast('Evaluation ID copied to clipboard.', 'success');
    } catch {
      toast('Could not access the clipboard.', 'error');
    }
  };

  const handleReport = async () => {
    if (!id) return;
    setReportBusy(true);
    try {
      await reportsApi.create(id);
      toast('Report generated successfully.', 'success');
    } catch (err) {
      toast(toApiError(err).message, 'error');
    } finally {
      setReportBusy(false);
    }
  };

  const compareChartData = data.models.map((m) => ({
    name: m.modelName.split(' ').slice(0, 2).join(' '),
    Reliability: m.reliability,
    Consistency: m.metrics.consistency,
    Grounding: m.metrics.grounding,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <Card>
        <div className="space-y-4 p-5">
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">{data.question}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge>{data.domain}</Badge>
            <Badge>{data.taskType}</Badge>
            <Badge>{data.mode}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
            <div>
              <p className="text-xs text-stone-500 dark:text-stone-400">Models tested</p>
              <p className="font-medium text-stone-900 dark:text-stone-100">{data.models.length}</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {data.models.map((m) => m.modelName).join(', ')}
              </p>
            </div>
            <div>
              <p className="text-xs text-stone-500 dark:text-stone-400">Execution time</p>
              <p className="font-medium text-stone-900 dark:text-stone-100">
                {fmtMs(data.executionTimeMs)}
              </p>
            </div>
            <div>
              <p className="text-xs text-stone-500 dark:text-stone-400">Evaluation date</p>
              <p className="font-medium text-stone-900 dark:text-stone-100">
                {new Date(data.createdAt).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-stone-500 dark:text-stone-400">Evaluation ID</p>
              <p className="flex items-center gap-2">
                <code
                  className="font-mono text-stone-800 dark:text-stone-100"
                  title={data.id}
                >
                  {data.id.slice(0, 12)}…
                </code>
                <button
                  type="button"
                  onClick={copyId}
                  className="text-xs font-medium text-primary-600 hover:underline"
                >
                  Copy
                </button>
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => downloadJson(`results-${id}.json`, data)}>
          Export JSON
        </Button>
        <Button onClick={handleReport} loading={reportBusy}>
          Generate Report
        </Button>
        <Button variant="ghost" onClick={() => navigate('/evaluate/question')}>
          Run Again
        </Button>
        <Button variant="ghost" onClick={() => navigate('/compare')}>
          Compare
        </Button>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} value={tab} onChange={(v) => setTab(v as TabId)} />

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          {data.models.map((m) => {
            return (
              <Card key={m.modelId}>
                <div className="space-y-4 p-5">
                  <div className="flex items-center gap-4">
                    {m.reliability != null ? (
                      <ScoreRing score={m.reliability} size={96} label={`${m.modelName} reliability`} />
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-stone-100 text-xs italic text-stone-400 dark:bg-stone-800 dark:text-stone-500">
                        Unavailable
                      </div>
                    )}
                    <div className="space-y-1">
                      <p className="font-semibold text-stone-900 dark:text-stone-100">
                        {m.modelName}
                      </p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">{m.provider}</p>
                      <Badge variant={m.accuracyLabel === 'ground-truth' ? 'info' : 'warning'}>
                        {m.accuracyLabel === 'ground-truth'
                          ? 'Ground-truth accuracy'
                          : 'Accuracy unavailable'}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {METRIC_ROWS.map(({ key, label }) => (
                      <div key={key}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="text-stone-600 dark:text-stone-300">{label}</span>
                          <span className="font-medium text-stone-700 dark:text-stone-200">
                            {m.metrics[key] != null ? m.metrics[key] : 'Unavailable'}
                          </span>
                        </div>
                        {m.metrics[key] != null ? (
                          <ProgressBar value={m.metrics[key] as number} />
                        ) : (
                          <p className="text-xs italic text-slate-400 dark:text-slate-500">Not measured.</p>
                        )}
                      </div>
                    ))}
                    <div>
                      <div className="flex justify-between text-sm">
                        <span className="text-stone-600 dark:text-stone-300">Accuracy</span>
                        <span className="font-medium text-stone-700 dark:text-stone-200">
                          {m.accuracy != null ? `${m.accuracy}%` : 'Unavailable'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                        {m.accuracy != null
                          ? 'Measured against ground truth.'
                          : 'No reference answers were provided for this evaluation.'}
                      </p>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm">
                        <span className="text-stone-600 dark:text-stone-300">
                          Hallucination Rate
                        </span>
                        <span className="font-medium text-stone-700 dark:text-stone-200">
                          {m.metrics.hallucinationRate != null ? `${m.metrics.hallucinationRate}%` : 'Unavailable'}
                        </span>
                      </div>
                      {m.metrics.hallucinationRate != null ? (
                        <ProgressBar value={m.metrics.hallucinationRate} tone="error" />
                      ) : (
                        <p className="text-xs italic text-slate-400 dark:text-slate-500">Not measured.</p>
                      )}
                      <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                        Lower is better.
                      </p>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-600 dark:text-stone-300">Response Time</span>
                      <span className="font-medium text-stone-700 dark:text-stone-200">
                        {fmtMs(m.avgLatencyMs)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-600 dark:text-stone-300">Cost</span>
                      <span className="font-medium text-stone-700 dark:text-stone-200">
                        {fmtCost(m.cost)}
                      </span>
                    </div>
                  </div>
                  <details className="text-sm">
                    <summary className="cursor-pointer font-medium text-stone-800 dark:text-stone-100">
                      Why this score?
                    </summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-600 dark:text-stone-300">
                      {m.explanation.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </details>
                  <Link to={`/evaluate/${id}/model/${m.modelId}`}>
                    <Button variant="outline" fullWidth>
                      View details
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Model comparison */}
      {tab === 'compare' && (
        <div className="space-y-4">
          <ChartCard title="Metric comparison" height={340}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compareChartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Reliability" fill="#4f46e5" />
                <Bar dataKey="Consistency" fill="#16a34a" />
                <Bar dataKey="Grounding" fill="#d97706" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <DataTable
            rows={data.models}
            keyOf={(m) => m.modelId}
            emptyMessage="No models in this evaluation."
            columns={[
              { key: 'model', header: 'Model', render: (m) => m.modelName },
              { key: 'reliability', header: 'Reliability', render: (m) => m.reliability },
              {
                key: 'consistency',
                header: 'Consistency',
                render: (m) => m.metrics.consistency,
              },
              { key: 'agreement', header: 'Agreement', render: (m) => m.metrics.agreement },
              { key: 'relevance', header: 'Relevance', render: (m) => m.metrics.relevance },
              {
                key: 'completeness',
                header: 'Completeness',
                render: (m) => m.metrics.completeness,
              },
              { key: 'grounding', header: 'Grounding', render: (m) => m.metrics.grounding },
              {
                key: 'accuracy',
                header: 'Accuracy',
                render: (m) => (m.accuracy != null ? `${m.accuracy}%` : 'Unavailable'),
              },
              {
                key: 'hallucination',
                header: 'Hallucination %',
                render: (m) => (m.metrics.hallucinationRate != null ? `${m.metrics.hallucinationRate}%` : 'Unavailable'),
              },
              { key: 'latency', header: 'Latency', render: (m) => fmtMs(m.avgLatencyMs) },
              { key: 'cost', header: 'Cost', render: (m) => fmtCost(m.cost) },
            ]}
          />
        </div>
      )}

      {/* Consistency */}
      {tab === 'consistency' && (
        <div className="space-y-4">
          {data.models.map((m) => (
            <Card key={m.modelId} title={m.modelName} subtitle={m.provider}>
              <div className="space-y-3 p-5">
                <div className="flex items-center gap-4">
                  {m.metrics.consistency != null ? (
                    <ScoreRing
                      score={m.metrics.consistency}
                      size={72}
                      label={`${m.modelName} consistency`}
                    />
                  ) : (
                    <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-stone-100 text-xs italic text-stone-400 dark:bg-stone-800 dark:text-stone-500">
                      Unavailable
                    </div>
                  )}
                  <p className="text-sm text-stone-600 dark:text-stone-300">
                    Based on semantic agreement across {m.runs.length} runs (not exact string
                    match).
                  </p>
                </div>
                <ul className="space-y-2">
                  {m.runs.map((r) => (
                    <li
                      key={r.runIndex}
                      className="rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-800"
                    >
                      <div className="mb-1 flex justify-between text-xs text-stone-500 dark:text-stone-400">
                        <span>Run {r.runIndex + 1}</span>
                        <span>{fmtMs(r.latencyMs)}</span>
                      </div>
                      <p className="text-stone-700 dark:text-stone-200">
                        {r.text.slice(0, 140)}
                        {r.text.length > 140 ? '…' : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Claims & Evidence */}
      {tab === 'claims' && (
        <div className="space-y-6">
          <DataTable
            rows={data.claims}
            keyOf={(c) => c.id}
            emptyMessage="No claims were extracted from this evaluation."
            columns={[
              {
                key: 'claim',
                header: 'Claim',
                className: 'max-w-md',
                render: (c) => c.text,
              },
              {
                key: 'model',
                header: 'Model',
                render: (c) => modelNames.get(c.modelId) ?? c.modelId,
              },
              {
                key: 'status',
                header: 'Status',
                render: (c) => (
                  <Badge variant={claimStatusVariant(c.status)}>{c.status}</Badge>
                ),
              },
              {
                key: 'confidence',
                header: 'Confidence',
                render: (c) => formatConfidence(c.confidence),
              },
            ]}
          />
          <div>
            <h3 className="mb-1 text-lg font-semibold text-stone-900 dark:text-stone-100">
              Evidence
            </h3>
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
      )}

      {/* Conflicts */}
      {tab === 'conflicts' && (
        <div className="space-y-6">
          <div className="space-y-3">
            {data.conflicts.length === 0 ? (
              <EmptyState
                title="No conflicts detected"
                description="Models agreed on all analyzed claims."
              />
            ) : (
              data.conflicts.map((c) => <ConflictCard key={c.id} conflict={c} />)
            )}
          </div>
          <div>
            <h3 className="mb-3 text-lg font-semibold text-stone-900 dark:text-stone-100">
              Uncertainty flags
            </h3>
            {data.uncertaintyFlags.length === 0 ? (
              <EmptyState
                title="No uncertainty flags"
                description="No responses were flagged as uncertain."
              />
            ) : (
              <ul className="space-y-2">
                {data.uncertaintyFlags.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-start gap-2 rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-800"
                  >
                    <Badge variant={severityVariant(f.severity)}>{f.severity}</Badge>
                    <span className="text-stone-700 dark:text-stone-200">{f.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
