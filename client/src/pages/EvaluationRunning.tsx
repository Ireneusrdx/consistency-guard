import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, ErrorState, LoadingState, ProgressBar } from '../components/ui/index';
import { evaluationsApi, toApiError } from '../lib/api';
import type { EvaluationStatus } from '../types';

function fmtMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return 'Unavailable';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtCost(c: number | null | undefined): string {
  if (c == null || Number.isNaN(c)) return 'Unavailable';
  return `$${c.toFixed(4)}`;
}

const STATUS_META = {
  waiting: { variant: 'default', label: 'Waiting' },
  running: { variant: 'info', label: 'Running' },
  completed: { variant: 'success', label: 'Completed' },
  failed: { variant: 'error', label: 'Failed' },
  unavailable: { variant: 'warning', label: 'Unavailable' },
} as const;

export default function EvaluationRunning() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const evaluationId = searchParams.get('evaluationId');

  const [elapsed, setElapsed] = useState(0);

  // Elapsed timer.
  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Live status polling.
  const liveQuery = useQuery({
    queryKey: ['eval-status', evaluationId],
    queryFn: () => evaluationsApi.status(evaluationId as string),
    enabled: Boolean(evaluationId),
    refetchInterval: 2000,
  });

  // Navigate when the evaluation finishes.
  useEffect(() => {
    const s = liveQuery.data?.status;
    if (s === 'completed' || s === 'partial') {
      navigate(`/evaluate/${evaluationId}/results`);
    }
  }, [liveQuery.data, evaluationId, navigate]);

  if (!evaluationId) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <ErrorState
          title="No evaluation selected"
          message="This page needs an evaluationId query parameter to track an evaluation."
        />
        <Link
          to="/evaluate/question"
          className="text-sm font-medium text-primary-600 hover:underline"
        >
          Back to question workspace
        </Link>
      </div>
    );
  }

  const status: EvaluationStatus | undefined = liveQuery.data;

  if (liveQuery.isError) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <ErrorState
          title="Failed to load evaluation status"
          message={toApiError(liveQuery.error).message}
          onRetry={() => liveQuery.refetch()}
        />
        <Button variant="ghost" onClick={() => navigate('/evaluate/question')}>
          Back to question workspace
        </Button>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <LoadingState message="Preparing evaluation..." />
      </div>
    );
  }

  const totalRuns = status.models.reduce((sum, m) => sum + m.runsTotal, 0);
  const doneRuns = status.models.reduce((sum, m) => sum + m.runsCompleted, 0);
  const overallPct = totalRuns > 0 ? Math.round((doneRuns / totalRuns) * 100) : 0;
  const isDone = status.status === 'completed';

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  const statusText = isDone
    ? 'Evaluation completed.'
    : `${doneRuns} of ${totalRuns} runs completed.`;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Card title="Evaluation in progress">
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-stone-600 dark:text-stone-300">
            <span>
              Evaluation ID:{' '}
              <code className="font-mono text-stone-800 dark:text-stone-100" title={evaluationId}>
                {evaluationId.slice(0, 18)}…
              </code>
            </span>
            <span>
              Elapsed:{' '}
              <span className="font-mono">
                {mm}:{ss}
              </span>
            </span>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-stone-600 dark:text-stone-300">Overall progress</span>
              <span className="font-medium text-stone-700 dark:text-stone-200">
                {doneRuns} / {totalRuns} runs
              </span>
            </div>
            <ProgressBar value={overallPct} />
          </div>
          <div aria-live="polite" className="text-sm text-stone-600 dark:text-stone-300">
            {statusText}
          </div>
          <div className="flex flex-wrap gap-2">
            {isDone && (
              <Button onClick={() => navigate(`/evaluate/${evaluationId}/results`)}>
                View Results
              </Button>
            )}
            <Button variant="ghost" onClick={() => navigate('/evaluate/question')}>
              Cancel
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {status.models.map((m) => {
          const meta = STATUS_META[m.status] ?? STATUS_META.waiting;
          const pct = m.runsTotal > 0 ? Math.round((m.runsCompleted / m.runsTotal) * 100) : 0;
          return (
            <Card key={m.modelId}>
              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-stone-900 dark:text-stone-100">{m.modelName}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">{m.provider}</p>
                  </div>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-stone-500 dark:text-stone-400">
                    <span>
                      Run {m.runsCompleted} / {m.runsTotal}
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <ProgressBar value={pct} />
                </div>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-stone-500 dark:text-stone-400">Tokens</dt>
                    <dd className="font-medium text-stone-800 dark:text-stone-100">
                      {m.tokens != null ? m.tokens.toLocaleString() : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-500 dark:text-stone-400">Cost</dt>
                    <dd className="font-medium text-stone-800 dark:text-stone-100">
                      {fmtCost(m.cost)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-500 dark:text-stone-400">Elapsed</dt>
                    <dd className="font-medium text-stone-800 dark:text-stone-100">
                      {fmtMs(m.elapsedMs)}
                    </dd>
                  </div>
                </dl>
                {m.error && (
                  <div>
                    <p className="text-sm text-red-600 dark:text-red-400">{m.error}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      Marked unavailable — continuing with other models.
                    </p>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
