import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  PageHeader,
  ProgressBar,
  TableShell,
  Td,
  Th,
} from '../components/ui';
import { getBenchmarkResults, type ServerBenchmarkResults } from '../lib/api';
import { formatDate, truncate } from '../lib/utils';
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

type RunRow = ServerBenchmarkResults['runs'][number];

function shortName(model: string): string {
  return model.replace(/-class model$/i, '').trim();
}

function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)}%`;
}

export default function BenchmarkResults() {
  const { benchmarkId } = useParams<{ benchmarkId: string }>();
  const [data, setData] = useState<ServerBenchmarkResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = async () => {
    if (!benchmarkId) return;
    setLoading(true);
    setError(null);
    try {
      setData(await getBenchmarkResults(benchmarkId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load benchmark results.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchmarkId]);

  const hasGroundTruth = useMemo(
    () => data?.models.some((m) => m.groundTruthAccuracy != null) ?? false,
    [data],
  );

  const compareData = useMemo(
    () =>
      data?.models.map((m) => ({
        name: shortName(m.modelKey),
        Reliability: m.avgReliability ?? null,
        ...(m.groundTruthAccuracy != null ? { Accuracy: m.groundTruthAccuracy } : {}),
      })) ?? [],
    [data],
  );

  const questions = useMemo(() => {
    if (!data) return [];
    const groups = new Map<string, RunRow[]>();
    for (const r of data.runs) {
      const list = groups.get(r.question) ?? [];
      list.push(r);
      groups.set(r.question, list);
    }
    return [...groups.entries()].map(([question, runs]) => ({
      question,
      expectedAnswer: runs[0]?.expectedAnswer ?? null,
      runs,
    }));
  }, [data]);

  if (!benchmarkId) {
    return (
      <div>
        <PageHeader title="Benchmark Results" />
        <ErrorState message="Missing benchmark id in the URL." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={data ? data.benchmark.name : 'Benchmark Results'}
        description={
          data
            ? `Domain: ${data.benchmark.domain} · ${
                data.lastRunAt ? formatDate(data.lastRunAt) : 'never run'
              } · ${data.questionCount} questions`
            : undefined
        }
        crumbs={[{ label: 'Benchmarks' }, { label: 'Results' }]}
        actions={
          <Link to="/benchmarks">
            <Button variant="outline">
              <Icon name="arrowRight" className="h-4 w-4 rotate-180" />
              Back to Benchmarks
            </Button>
          </Link>
        }
      />

      {loading ? (
        <LoadingState label="Loading benchmark results…" />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchResults} />
      ) : !data ? (
        <EmptyState icon="chart" title="No results" description="No results were found for this benchmark." />
      ) : data.models.length === 0 ? (
        <EmptyState
          icon="chart"
          title="No runs yet"
          description="This benchmark has not been run yet. Run it from the Benchmarks page to see results here."
          action={
            <Link to="/benchmarks">
              <Button variant="primary">Go to Benchmarks</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {!hasGroundTruth && (
            <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
              <CardContent className="flex gap-3 py-5">
                <Icon name="alert" className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    Cross-Model / Evidence-Based Reliability Analysis
                  </p>
                  <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                    This dataset has no reference answers, so ground-truth accuracy is not reported.
                    Scores below reflect cross-model agreement and evidence-based reliability — not
                    absolute truth.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Model summary"
              description="Per-model aggregates from the latest completed runs."
            />
            <CardContent className="pt-0">
              <TableShell ariaLabel="Benchmark model summary">
                <thead>
                  <tr>
                    <Th>Model</Th>
                    <Th>Questions evaluated</Th>
                    <Th>Avg reliability</Th>
                    {hasGroundTruth && <Th>Ground-truth accuracy</Th>}
                  </tr>
                </thead>
                <tbody>
                  {data.models.map((m) => (
                    <tr key={m.modelKey}>
                      <Td className="font-medium text-slate-900 dark:text-white">
                        {shortName(m.modelKey)}
                      </Td>
                      <Td className="tabular-nums">{m.questionsEvaluated}</Td>
                      <Td>
                        <div className="flex min-w-40 items-center gap-2">
                          {m.avgReliability != null ? (
                            <>
                              <ProgressBar value={m.avgReliability} className="flex-1" />
                              <span className="text-sm tabular-nums">{pct(m.avgReliability)}</span>
                            </>
                          ) : (
                            <span className="text-sm italic text-slate-400 dark:text-slate-500">Unavailable</span>
                          )}
                        </div>
                      </Td>
                      {hasGroundTruth && <Td className="tabular-nums">{pct(m.groundTruthAccuracy)}</Td>}
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Model comparison"
              description="Average reliability per model across all runs."
            />
            <CardContent className="pt-0">
              <div className="h-72" role="img" aria-label="Bar chart comparing average reliability per model">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compareData} margin={{ top: 8, right: 16, bottom: 4, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-20} dy={10} height={60} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Reliability" fill="#0d9488" radius={[4, 4, 0, 0]} />
                    {hasGroundTruth && <Bar dataKey="Accuracy" fill="#6366f1" radius={[4, 4, 0, 0]} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Run details"
              description="Every benchmark run, grouped by question. Only metrics the server records are shown."
            />
            <CardContent className="space-y-5 pt-0">
              {questions.map((q, qi) => (
                <div
                  key={qi}
                  className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
                >
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    Q{qi + 1}. {q.question}
                  </p>
                  {q.expectedAnswer && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Reference answer: {truncate(q.expectedAnswer, 200)}
                    </p>
                  )}
                  <div className="mt-3 space-y-2">
                    {q.runs.map((r) => (
                      <div
                        key={r.benchmarkRunId}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
                      >
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {shortName(r.modelKey)}
                        </span>
                        <Badge
                          tone={
                            r.status === 'completed'
                              ? 'success'
                              : r.status === 'failed'
                                ? 'danger'
                                : 'info'
                          }
                        >
                          {r.status}
                        </Badge>
                        <span className="text-slate-500 dark:text-slate-400">
                          Reliability: <span className="tabular-nums">{pct(r.reliability)}</span>
                        </span>
                        {r.groundTruthAccuracy != null && (
                          <span className="text-slate-500 dark:text-slate-400">
                            Accuracy:{' '}
                            <span className="tabular-nums">{pct(r.groundTruthAccuracy)}</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
