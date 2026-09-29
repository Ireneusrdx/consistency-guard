import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import {
  getComparisonScores,
  getComparisonTrends,
  getEvaluation,
  getModelDomainPerformance,
  listEvaluations,
  type EvaluationDetail,
  type EvaluationSummary,
  type ModelDomainPoint,
  type ModelScore,
  type ModelTrend,
} from '../lib/api';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  ProgressBar,
  Select,
  Tabs,
} from '../components/ui';
import { cn, formatDate, formatMs, formatUsd, truncate } from '../lib/utils';

type TabId = 'overview' | 'domains' | 'strengths' | 'responses' | 'trends' | 'cost';

type MetricKey =
  | 'reliability'
  | 'consistency'
  | 'grounding'
  | 'relevance'
  | 'instructionFollowing'
  | 'completeness';

const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'reliability', label: 'Reliability' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'grounding', label: 'Grounding' },
  { key: 'relevance', label: 'Relevance' },
  { key: 'instructionFollowing', label: 'Instruction Following' },
  { key: 'completeness', label: 'Completeness' },
];

const QUALITY_METRICS = METRICS.filter((m) =>
  ['reliability', 'consistency', 'grounding', 'relevance', 'instructionFollowing'].includes(m.key),
);

const PALETTE = ['#0d9488', '#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444'];
const MUTED = '#94a3b8';

const normalizeText = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

const modelLabel = (s: ModelScore): string => s.model;

/** Peer average over models that actually have the metric; null when none do. */
function peerAvg(scores: ModelScore[], key: MetricKey): number | null {
  const vals = scores.map((s) => s[key]).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, v) => a + v, 0) / vals.length;
}

// ---------------------------------------------------------------------------
// Weighted task-type blends (contextual recommendation, no universal winner)
// ---------------------------------------------------------------------------
function taskWeights(taskType: string): { weights: Partial<Record<MetricKey, number>>; rationale: string } {
  const t = taskType.toLowerCase();
  if (t.includes('cod') || t.includes('debug')) {
    return {
      weights: { consistency: 0.5, instructionFollowing: 0.5 },
      rationale: 'consistency and instruction following are weighted most for coding-style work',
    };
  }
  if (t.includes('research') || t.includes('expl')) {
    return {
      weights: { grounding: 0.5, relevance: 0.5 },
      rationale: 'grounding and relevance are weighted most for research/explanation work',
    };
  }
  if (t.includes('summar')) {
    return { weights: { completeness: 0.5, relevance: 0.5 }, rationale: 'completeness and relevance are weighted most for summarization work' };
  }
  if (t.includes('reason')) {
    return { weights: { consistency: 0.5, relevance: 0.5 }, rationale: 'consistency and relevance are weighted most for reasoning work' };
  }
  return { weights: { reliability: 1 }, rationale: 'overall reliability is used as the blend for this task type' };
}

/** Weighted blend over metrics the model actually has; null when none are available. */
function blendedScore(s: ModelScore, weights: Partial<Record<MetricKey, number>>): number | null {
  const keys = (Object.keys(weights) as MetricKey[]).filter((k) => s[k] != null);
  if (keys.length === 0) return null;
  const total = keys.reduce((a, k) => a + (weights[k] ?? 0), 0) || 1;
  return keys.reduce((a, k) => a + (s[k] as number) * (weights[k] ?? 0), 0) / total;
}

// ---------------------------------------------------------------------------
export default function Compare() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabId>('overview');

  const [evals, setEvals] = useState<EvaluationSummary[]>([]);
  const [evalsLoading, setEvalsLoading] = useState(true);
  const [evalsError, setEvalsError] = useState<string | null>(null);

  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null);

  const [detail, setDetail] = useState<EvaluationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [scores, setScores] = useState<ModelScore[]>([]);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [scoresError, setScoresError] = useState<string | null>(null);

  const [trends, setTrends] = useState<ModelTrend[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);

  const [domainPoints, setDomainPoints] = useState<ModelDomainPoint[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(true);
  const [domainsError, setDomainsError] = useState<string | null>(null);

  const [responseModelIds, setResponseModelIds] = useState<string[]>([]);
  const colRefs = useRef(new Map<string, HTMLDivElement>());
  const syncingRef = useRef(false);

  // ---- load evaluation list ---------------------------------------------
  const loadEvals = () => {
    setEvalsLoading(true);
    setEvalsError(null);
    let cancelled = false;
    listEvaluations({ pageSize: 20 })
      .then((p) => {
        if (cancelled) return;
        setEvals(p.items);
        setEvalsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setEvalsError(err instanceof Error ? err.message : 'Failed to load evaluations.');
        setEvalsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };
  useEffect(loadEvals, []);

  // ---- preselect from ?eval= or first item -------------------------------
  useEffect(() => {
    if (evalsLoading || selectedEvalId) return;
    const fromParam = searchParams.get('eval');
    const match = fromParam ? evals.find((e) => e.id === fromParam) : undefined;
    const next = match ?? evals[0];
    if (next) {
      setSelectedEvalId(next.id);
      if (!match) setSearchParams({ eval: next.id }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evalsLoading, evals]);

  // ---- load detail + scores in parallel when selection changes ------------
  const loadEvalData = (id: string) => {
    let cancelled = false;
    setDetailLoading(true);
    setScoresLoading(true);
    setDetailError(null);
    setScoresError(null);
    getEvaluation(id)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setDetailLoading(false);
        setResponseModelIds(d.models.slice(0, 3).map((m) => m.modelId));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDetailError(err instanceof Error ? err.message : 'Failed to load evaluation detail.');
        setDetailLoading(false);
      });
    getComparisonScores(id)
      .then((s) => {
        if (cancelled) return;
        setScores(s);
        setScoresLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setScoresError(err instanceof Error ? err.message : 'Failed to load comparison scores.');
        setScoresLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };
  useEffect(() => {
    if (!selectedEvalId) return;
    return loadEvalData(selectedEvalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvalId]);

  // ---- domain performance (global, once) ----------------------------------
  const loadDomains = () => {
    setDomainsLoading(true);
    setDomainsError(null);
    let cancelled = false;
    getModelDomainPerformance()
      .then((p) => {
        if (cancelled) return;
        setDomainPoints(p);
        setDomainsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDomainsError(err instanceof Error ? err.message : 'Failed to load domain performance.');
        setDomainsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };
  useEffect(loadDomains, []);

  // ---- reliability trends (lazily, when tab is active) --------------------
  const loadTrends = (id: string) => {
    setTrendsLoading(true);
    setTrendsError(null);
    let cancelled = false;
    getComparisonTrends(id)
      .then((t) => {
        if (cancelled) return;
        setTrends(t);
        setTrendsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTrendsError(err instanceof Error ? err.message : 'Failed to load reliability trends.');
        setTrendsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };
  useEffect(() => {
    if (tab !== 'trends' || !selectedEvalId) return;
    return loadTrends(selectedEvalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedEvalId]);

  const handleEvalChange = (id: string) => {
    setSelectedEvalId(id);
    setSearchParams({ eval: id });
  };

  // ---- synchronized column scrolling (responses tab) ----------------------
  const handleColumnScroll = (sourceId: string) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    const source = colRefs.current.get(sourceId);
    if (source) {
      colRefs.current.forEach((el, key) => {
        if (key !== sourceId) el.scrollTop = source.scrollTop;
      });
    }
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };

  // -----------------------------------------------------------------------
  // Derived chart data
  // -----------------------------------------------------------------------
  const qualityData = useMemo(
    () =>
      QUALITY_METRICS.map((m) => {
        const row: Record<string, string | number | null> = { metric: m.label };
        scores.forEach((s) => {
          row[s.modelId] = s[m.key];
        });
        return row;
      }),
    [scores],
  );

  const efficiencyData = useMemo(
    () =>
      scores.map((s) => ({
        model: modelLabel(s),
        latency: s.avgLatencyMs != null ? s.avgLatencyMs / 1000 : null,
        cost: s.totalCostUsd,
        latencyMs: s.avgLatencyMs,
        costUsd: s.totalCostUsd,
      })),
    [scores],
  );

  const domainRadarData = useMemo(() => {
    const domains = Array.from(new Set(domainPoints.map((p) => p.domain)));
    return domains.map((domain) => {
      const row: Record<string, string | number> = { domain };
      domainPoints
        .filter((p) => p.domain === domain)
        .forEach((p) => {
          row[p.model] = p.reliability;
        });
      return row;
    });
  }, [domainPoints]);

  const domainModels = useMemo(
    () => Array.from(new Set(domainPoints.map((p) => p.model))),
    [domainPoints],
  );

  const trendData = useMemo(() => {
    const dates = Array.from(new Set(trends.flatMap((t) => t.points.map((p) => p.date)))).sort();
    return dates.map((date) => {
      const row: Record<string, string | number> = { date };
      trends.forEach((t) => {
        const pt = t.points.find((p) => p.date === date);
        if (pt) row[t.model] = pt.reliability;
      });
      return row;
    });
  }, [trends]);

  // claim classification for the responses tab
  const claimClassById = useMemo(() => {
    const map = new Map<string, 'matching' | 'contradicting' | 'unique'>();
    if (!detail) return map;
    const allClaims = detail.models.flatMap((m) => m.claims);
    const counts = new Map<string, number>();
    allClaims.forEach((c) => {
      const n = normalizeText(c.text);
      counts.set(n, (counts.get(n) ?? 0) + 1);
    });
    const normConflicts = detail.conflicts.map((c) => normalizeText(c.claim));
    detail.models.forEach((m) => {
      m.claims.forEach((c) => {
        const n = normalizeText(c.text);
        const overlapsConflict = normConflicts.some(
          (nc) => nc.length > 0 && n.length > 0 && (n.includes(nc) || nc.includes(n)),
        );
        if (overlapsConflict) map.set(c.id, 'contradicting');
        else if ((counts.get(n) ?? 0) > 1) map.set(c.id, 'matching');
        else map.set(c.id, 'unique');
      });
    });
    return map;
  }, [detail]);

  const selectedDetailModels = useMemo(() => {
    if (!detail) return [];
    if (responseModelIds.length === 0) return detail.models;
    return detail.models.filter((m) => responseModelIds.includes(m.modelId));
  }, [detail, responseModelIds]);

  // contextual recommendations
  const recommendations = useMemo(() => {
    if (!detail || scores.length === 0) return null;
    const { weights, rationale } = taskWeights(detail.taskType);
    const ranked = [...scores].sort(
      (a, b) => (blendedScore(b, weights) ?? -1) - (blendedScore(a, weights) ?? -1),
    );
    const top = ranked.slice(0, 2).map((s) => {
      const weightedKeys = (Object.keys(weights) as MetricKey[]).filter((k) => (weights[k] ?? 0) > 0 && s[k] != null);
      let named = [...weightedKeys].sort((a, b) => (s[b] as number) - (s[a] as number));
      if (named.length < 2) {
        const others = METRICS.filter((m) => !named.includes(m.key) && s[m.key] != null).sort(
          (a, b) => (s[b.key] as number) - (s[a.key] as number),
        );
        if (others[0]) named = [...named, others[0].key];
      }
      named = named.slice(0, 2);
      const why = named.map((k) => {
        const label = METRICS.find((m) => m.key === k)?.label ?? k;
        const avg = peerAvg(scores, k);
        const val = s[k] as number;
        const cmp =
          avg != null && val > avg
            ? `${(val - avg).toFixed(0)} points above the peer average (${avg.toFixed(0)})`
            : 'in line with the peer average';
        return `${label} ${val} — ${cmp} across tested models`;
      });
      const hallRates = scores.map((x) => x.hallucinationRate).filter((v): v is number => v != null);
      const lowestHallucination = hallRates.length > 0 ? Math.min(...hallRates) : null;
      if (s.hallucinationRate != null && s.hallucinationRate === lowestHallucination) {
        why.push(`Lowest hallucination rate among tested models (${s.hallucinationRate}%)`);
      }
      return { score: s, blend: blendedScore(s, weights), named, why };
    });
    return { top, rationale };
  }, [detail, scores]);

  const detailBusy = detailLoading || scoresLoading;

  // -----------------------------------------------------------------------
  return (
    <div>
      <PageHeader
        title="Compare Models"
        description="Multidimensional, side-by-side comparison of the models in one evaluation. Scores describe measured behaviour on this task — not a universal ranking."
      />

      {/* Evaluation picker */}
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="w-full md:max-w-md">
            <Field label="Evaluation" htmlFor="eval-select">
              <Select
                id="eval-select"
                aria-label="Evaluation"
                value={selectedEvalId ?? ''}
                onChange={(e) => handleEvalChange(e.target.value)}
                disabled={evalsLoading || evals.length === 0}
              >
                {evals.map((e) => (
                  <option key={e.id} value={e.id}>
                    {truncate(e.prompt, 60)} — {formatDate(e.createdAt)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {detail && (
            <div className="flex flex-wrap items-center gap-2 pb-0.5">
              <Badge tone="info">{detail.domain}</Badge>
              <Badge tone="default">{detail.taskType}</Badge>
              <Badge tone="default">{detail.mode}</Badge>
              <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(detail.createdAt)}</span>
            </div>
          )}
        </CardContent>
        {detail && (
          <div className="border-t border-slate-200 px-5 py-3 dark:border-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-900 dark:text-white">Prompt: </span>
              {detail.prompt}
            </p>
          </div>
        )}
      </Card>

      {evalsLoading ? (
        <LoadingState label="Loading evaluations…" />
      ) : evalsError ? (
        <ErrorState message={evalsError} onRetry={loadEvals} />
      ) : evals.length === 0 ? (
        <EmptyState
          icon="compare"
          title="No evaluations to compare"
          description="Run an evaluation first, then return here to compare the models side by side."
        />
      ) : (
        <>
          <Tabs<TabId>
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'domains', label: 'Domain Performance' },
              { id: 'strengths', label: 'Strengths & Weaknesses' },
              { id: 'responses', label: 'Side-by-Side Responses' },
              { id: 'trends', label: 'Reliability Trends' },
              { id: 'cost', label: 'Cost vs Speed' },
            ]}
            value={tab}
            onChange={setTab}
            className="mb-6"
          />

          {/* ------------------------------- Overview ------------------------------- */}
          {tab === 'overview' && (
            <div className="space-y-6">
              {detailBusy ? (
                <LoadingState label="Loading comparison…" />
              ) : scoresError ? (
                <ErrorState message={scoresError} onRetry={() => selectedEvalId && loadEvalData(selectedEvalId)} />
              ) : scores.length === 0 ? (
                <EmptyState icon="chart" title="No comparison scores" description="No model scores are available for this evaluation." />
              ) : (
                <>
                  <Card>
                    <CardHeader
                      title="Quality metrics"
                      description="Grouped by metric so models can be compared on the same scale."
                    />
                    <CardContent>
                      <div className="h-80" role="img" aria-label="Grouped bar chart of quality metrics per model">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={qualityData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={MUTED} opacity={0.3} />
                            <XAxis dataKey="metric" tick={{ fontSize: 12, fill: MUTED }} interval={0} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} />
                            <Tooltip />
                            <Legend />
                            {scores.map((s, i) => (
                              <Bar key={s.modelId} dataKey={s.modelId} name={modelLabel(s)} fill={PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader
                      title="Efficiency"
                      description="Average latency and total cost per model for this evaluation."
                    />
                    <CardContent>
                      <div className="h-80" role="img" aria-label="Bar chart of average latency and total cost per model">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={efficiencyData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={MUTED} opacity={0.3} />
                            <XAxis dataKey="model" tick={{ fontSize: 12, fill: MUTED }} />
                            <YAxis yAxisId="latency" tick={{ fontSize: 12, fill: MUTED }} label={{ value: 'seconds', angle: -90, position: 'insideLeft', fontSize: 12, fill: MUTED }} />
                            <YAxis yAxisId="cost" orientation="right" tick={{ fontSize: 12, fill: MUTED }} tickFormatter={(v: number) => formatUsd(v)} label={{ value: 'USD', angle: 90, position: 'insideRight', fontSize: 12, fill: MUTED }} />
                            <Tooltip
                              formatter={(_value, name, props) => {
                                if (name === 'Avg latency (s)') return [formatMs(props.payload?.latencyMs), name];
                                return [formatUsd(props.payload?.costUsd), name];
                              }}
                            />
                            <Legend />
                            <Bar yAxisId="latency" dataKey="latency" name="Avg latency (s)" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                            <Bar yAxisId="cost" dataKey="cost" name="Total cost (USD)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                        Latency and cost are shown for context; lower is not automatically better.
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}

          {/* ------------------------- Domain performance ------------------------- */}
          {tab === 'domains' && (
            <Card>
              <CardHeader
                title="Domain Performance"
                description="Reliability per domain, aggregated across your evaluation history."
              />
              <CardContent>
                {domainsLoading ? (
                  <LoadingState label="Loading domain performance…" />
                ) : domainsError ? (
                  <ErrorState message={domainsError} onRetry={loadDomains} />
                ) : domainPoints.length === 0 ? (
                  <EmptyState icon="chart" title="No domain data" description="No domain performance data is available yet." />
                ) : (
                  <>
                    <div className="h-96" role="img" aria-label="Radar chart of reliability per domain for each model">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={domainRadarData} outerRadius="72%">
                          <PolarGrid stroke={MUTED} opacity={0.4} />
                          <PolarAngleAxis dataKey="domain" tick={{ fontSize: 12, fill: MUTED }} />
                          <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 11, fill: MUTED }} />
                          <Tooltip />
                          <Legend />
                          {domainModels.map((m, i) => (
                            <Radar
                              key={m}
                              name={m}
                              dataKey={m}
                              stroke={PALETTE[i % PALETTE.length]}
                              fill={PALETTE[i % PALETTE.length]}
                              fillOpacity={0.15}
                            />
                          ))}
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
                      <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Summary</h4>
                      <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                        {domainModels.map((m, i) => {
                          const pts = domainPoints.filter((p) => p.model === m);
                          const avg = pts.reduce((a, p) => a + p.reliability, 0) / Math.max(1, pts.length);
                          const best = pts.reduce((a, b) => (b.reliability > a.reliability ? b : a), pts[0]);
                          return (
                            <li key={m}>
                              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden="true" />
                              {m} averages {avg.toFixed(0)} across {pts.length} domains, strongest in {best?.domain} ({best?.reliability}).
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ------------------------ Strengths & weaknesses ---------------------- */}
          {tab === 'strengths' && (
            <div>
              {detailBusy ? (
                <LoadingState label="Loading comparison…" />
              ) : scoresError ? (
                <ErrorState message={scoresError} onRetry={() => selectedEvalId && loadEvalData(selectedEvalId)} />
              ) : scores.length === 0 ? (
                <EmptyState icon="target" title="No comparison scores" description="No model scores are available for this evaluation." />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {scores.map((s, i) => {
                    const entries = METRICS.map((m) => ({ ...m, value: s[m.key] }))
                      .filter((e) => e.value != null)
                      .sort((a, b) => (b.value as number) - (a.value as number));
                    const strengths = entries.slice(0, 2);
                    const weaknesses = entries.slice(-2).reverse();
                    return (
                      <Card key={s.modelId}>
                        <CardHeader
                          title={
                            <span className="flex items-center gap-2">
                              <span className="inline-block h-3 w-3 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden="true" />
                              {modelLabel(s)}
                            </span>
                          }
                          description={`${s.provider} · blended reliability ${s.reliability != null ? `${s.reliability}%` : 'Unavailable'}`}
                        />
                        <CardContent className="grid gap-6 sm:grid-cols-2">
                          <div>
                            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Strengths</h4>
                            <ul className="space-y-3">
                              {strengths.map((m) => {
                                const others = scores
                                  .filter((x) => x.modelId !== s.modelId)
                                  .map((x) => x[m.key])
                                  .filter((v): v is number => v != null);
                                const isHighest = others.length > 0 && (m.value as number) >= Math.max(...others);
                                const avg = others.length > 0 ? others.reduce((a, b) => a + b, 0) / others.length : (m.value as number);
                                const note = isHighest
                                  ? 'highest among tested models'
                                  : (m.value as number) > avg
                                    ? 'above average'
                                    : 'in line with peers';
                                return (
                                  <li key={m.key}>
                                    <div className="mb-1 flex items-baseline justify-between text-sm">
                                      <span className="font-medium text-slate-700 dark:text-slate-200">{m.label}</span>
                                      <span className="font-semibold text-slate-900 dark:text-white">{m.value as number}</span>
                                    </div>
                                    <ProgressBar value={m.value as number} />
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{note}</p>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                          <div>
                            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Weaknesses</h4>
                            <ul className="space-y-3">
                              {weaknesses.map((m) => {
                                const avg = peerAvg(scores, m.key);
                                const val = m.value as number;
                                return (
                                  <li key={m.key}>
                                    <div className="mb-1 flex items-baseline justify-between text-sm">
                                      <span className="font-medium text-slate-700 dark:text-slate-200">{m.label}</span>
                                      <span className="font-semibold text-slate-900 dark:text-white">{val}</span>
                                    </div>
                                    <ProgressBar value={val} />
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      {avg != null && val < avg
                                        ? `${(avg - val).toFixed(0)} points below the peer average (${avg.toFixed(0)})`
                                        : 'in line with peers, but the lowest of this model’s own metrics'}
                                    </p>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* --------------------------- Side-by-side ----------------------------- */}
          {tab === 'responses' && (
            <div className="space-y-4">
              {detailLoading ? (
                <LoadingState label="Loading responses…" />
              ) : detailError ? (
                <ErrorState message={detailError} onRetry={() => selectedEvalId && loadEvalData(selectedEvalId)} />
              ) : !detail ? (
                <EmptyState icon="layers" title="No evaluation detail" description="Select an evaluation to see side-by-side model responses." />
              ) : (
                <>
                  <Card>
                    <CardContent className="flex flex-col gap-4">
                      <fieldset>
                        <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Models to compare</legend>
                        <div className="flex flex-wrap gap-4">
                          {detail.models.map((m) => (
                            <Checkbox
                              key={m.modelId}
                              label={m.model}
                              checked={responseModelIds.includes(m.modelId)}
                              onChange={(e) => {
                                setResponseModelIds((prev) =>
                                  e.target.checked ? [...prev, m.modelId] : prev.filter((id) => id !== m.modelId),
                                );
                              }}
                            />
                          ))}
                        </div>
                      </fieldset>
                      <div className="flex flex-wrap items-center gap-4 text-xs" aria-label="Claim legend">
                        <span className="font-medium text-slate-700 dark:text-slate-200">Claim legend:</span>
                        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <span className="inline-block h-3 w-3 rounded-sm border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-950" aria-hidden="true" />
                          Matching — appears in multiple models
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <span className="inline-block h-3 w-3 rounded-sm border-l-4 border-red-500 bg-red-50 dark:bg-red-950" aria-hidden="true" />
                          Contradicting — overlaps a flagged conflict
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <span className="inline-block h-3 w-3 rounded-sm border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950" aria-hidden="true" />
                          Unique — only this model said it
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">Columns scroll in sync.</span>
                      </div>
                    </CardContent>
                  </Card>

                  {selectedDetailModels.length === 0 ? (
                    <EmptyState icon="layers" title="No models selected" description="Select at least one model above to compare responses." />
                  ) : (
                    <div className="overflow-x-auto scroll-thin pb-2">
                      <div
                        className="grid gap-4"
                        style={{
                          gridTemplateColumns: `repeat(${selectedDetailModels.length}, minmax(300px, 1fr))`,
                          minWidth: `${selectedDetailModels.length * 300}px`,
                        }}
                      >
                        {selectedDetailModels.map((m) => (
                          <Card key={m.modelId} className="flex min-h-[420px] flex-col">
                            <CardHeader
                              title={m.model}
                              description={`${m.provider} · ${m.runs.length} runs · ${m.claims.length} claims`}
                            />
                            <div
                              ref={(el) => {
                                if (el) colRefs.current.set(m.modelId, el);
                                else colRefs.current.delete(m.modelId);
                              }}
                              onScroll={() => handleColumnScroll(m.modelId)}
                              className="max-h-[560px] flex-1 space-y-3 overflow-y-auto scroll-thin px-5 py-4"
                              aria-label={`${m.model} responses`}
                            >
                              {m.runs.map((run) => (
                                <div key={run.index} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                                    <span className="font-medium">Run {run.index + 1}</span>
                                    <span>{formatMs(run.latencyMs)}</span>
                                  </div>
                                  <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">{run.text}</p>
                                </div>
                              ))}
                              <div>
                                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Claims</h4>
                                <ul className="space-y-2">
                                  {m.claims.map((c) => {
                                    const cls = claimClassById.get(c.id) ?? 'unique';
                                    const tone = cls === 'matching' ? 'emerald' : cls === 'contradicting' ? 'red' : 'amber';
                                    const title =
                                      cls === 'matching'
                                        ? 'Matching: this claim also appears in another model\u2019s response (matched by text).'
                                        : cls === 'contradicting'
                                          ? 'Contradicting: this claim overlaps with a flagged conflict in this evaluation.'
                                          : 'Unique: this claim only appears in this model\u2019s response.';
                                    return (
                                      <li
                                        key={c.id}
                                        title={title}
                                        className={cn(
                                          'rounded-md border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900',
                                          tone === 'emerald' && 'border-l-4 border-l-emerald-500',
                                          tone === 'red' && 'border-l-4 border-l-red-500',
                                          tone === 'amber' && 'border-l-4 border-l-amber-500',
                                        )}
                                      >
                                        <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">{c.text}</p>
                                        <div className="mt-1.5 flex items-center gap-2">
                                          <Badge
                                            tone={c.status === 'supported' ? 'success' : c.status === 'contradicted' ? 'danger' : 'warning'}
                                          >
                                            {c.status}
                                          </Badge>
                                          <span className="text-xs capitalize text-slate-500 dark:text-slate-400">{cls}</span>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ------------------------------- Trends ------------------------------- */}
          {tab === 'trends' && (
            <Card>
              <CardHeader
                title="Reliability Trends"
                description="Per-model reliability across evaluations over time."
              />
              <CardContent>
                {trendsLoading ? (
                  <LoadingState label="Loading reliability trends…" />
                ) : trendsError ? (
                  <ErrorState message={trendsError} onRetry={() => selectedEvalId && loadTrends(selectedEvalId)} />
                ) : trends.length === 0 ? (
                  <EmptyState icon="chart" title="No trend data" description="No reliability history is available for this evaluation." />
                ) : (
                  <div className="h-80" role="img" aria-label="Line chart of reliability over time per model">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={MUTED} opacity={0.3} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: MUTED }} tickFormatter={(d: string) => formatDate(d)} minTickGap={32} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} />
                        <Tooltip labelFormatter={(d) => formatDate(d)} />
                        <Legend />
                        {trends.map((t, i) => (
                          <Line
                            key={t.model}
                            type="monotone"
                            dataKey={t.model}
                            name={t.model}
                            stroke={PALETTE[i % PALETTE.length]}
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ----------------------------- Cost vs speed --------------------------- */}
          {tab === 'cost' && (
            <Card>
              <CardHeader
                title="Cost vs Speed"
                description="Bubble size encodes reliability. Axes show average latency and total cost."
              />
              <CardContent>
                {detailBusy ? (
                  <LoadingState label="Loading comparison…" />
                ) : scoresError ? (
                  <ErrorState message={scoresError} onRetry={() => selectedEvalId && loadEvalData(selectedEvalId)} />
                ) : scores.length === 0 ? (
                  <EmptyState icon="zap" title="No comparison scores" description="No model scores are available for this evaluation." />
                ) : (
                  <div className="h-96" role="img" aria-label="Scatter chart of cost versus latency per model, bubble size is reliability">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 16, right: 24, bottom: 24, left: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={MUTED} opacity={0.3} />
                        <XAxis
                          type="number"
                          dataKey="x"
                          name="Latency"
                          tick={{ fontSize: 12, fill: MUTED }}
                          tickFormatter={(v: number) => formatMs(v)}
                          label={{ value: 'Avg latency', position: 'bottom', offset: 8, fontSize: 12, fill: MUTED }}
                        />
                        <YAxis
                          type="number"
                          dataKey="y"
                          name="Cost"
                          tick={{ fontSize: 12, fill: MUTED }}
                          tickFormatter={(v: number) => formatUsd(v)}
                          label={{ value: 'Total cost (USD)', angle: -90, position: 'insideLeft', fontSize: 12, fill: MUTED }}
                        />
                        <ZAxis type="number" dataKey="z" name="Reliability" range={[80, 600]} />
                        <Tooltip
                          cursor={{ strokeDasharray: '3 3' }}
                          content={({ active, payload }) => {
                            if (!active || !payload || payload.length === 0) return null;
                            const p = payload[0].payload as
                              | { model?: string; x?: number; y?: number; z?: number }
                              | undefined;
                            if (!p) return null;
                            return (
                              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-pop dark:border-slate-700 dark:bg-slate-900">
                                <p className="font-semibold text-slate-900 dark:text-white">{p.model}</p>
                                <p className="text-slate-600 dark:text-slate-300">Latency: {formatMs(p.x)}</p>
                                <p className="text-slate-600 dark:text-slate-300">Cost: {formatUsd(p.y)}</p>
                                <p className="text-slate-600 dark:text-slate-300">Reliability: {p.z}</p>
                              </div>
                            );
                          }}
                        />
                        <Legend />
                        {scores.map((s, i) => (
                          <Scatter key={s.modelId} name={modelLabel(s)} data={[{ model: modelLabel(s), x: s.avgLatencyMs, y: s.totalCostUsd, z: s.reliability }]}>
                            <Cell fill={PALETTE[i % PALETTE.length]} />
                          </Scatter>
                        ))}
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ------------------------- Recommendations --------------------------- */}
          {!detailBusy && !scoresError && recommendations && detail && (
            <Card className="mt-6">
              <CardHeader
                title="Task-specific recommendations"
                description={`Weighted for ${detail.taskType} tasks in ${detail.domain}: ${recommendations.rationale}.`}
              />
              <CardContent className="space-y-5">
                {recommendations.top.map((r, i) => {
                  const metricText = r.named
                    .map((k) => `${METRICS.find((m) => m.key === k)?.label ?? k} (${r.score[k]})`)
                    .join(' and ');
                  return (
                    <div key={r.score.modelId} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                      <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-100">
                        <Badge tone={i === 0 ? 'success' : 'info'} className="mr-2">#{i + 1}</Badge>
                        For {detail.taskType} tasks in {detail.domain} in your evaluation history,{' '}
                        <span className="font-semibold">{modelLabel(r.score)}</span> demonstrated the strongest{' '}
                        {metricText}.
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                        {r.why.map((w, j) => (
                          <li key={j}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                <p className="text-xs italic text-slate-500 dark:text-slate-400">
                  Recommendation is contextual to this evaluation, not a universal ranking.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
