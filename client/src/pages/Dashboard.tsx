import { useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getDashboard,
  type DashboardData,
  type EvaluationStatus,
  type EvaluationSummary,
} from '../lib/api';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  ChartTooltip,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  ProgressBar,
  Reveal,
  TableShell,
  Td,
  Th,
} from '../components/ui';
import { cn } from '../lib/utils';
import { formatDate, formatMs, formatUsd, truncate } from '../lib/utils';
import { usePrefersReducedMotion } from '../lib/motion';

const TEAL = '#0d9488';
const SLATE = '#64748b';
const AMBER = '#f59e0b';

/** Animated number that eases from 0 to the target — respects reduced motion. */
function useCountUp(target: number, duration = 900): number {
  const reducedMotion = usePrefersReducedMotion();
  const [value, setValue] = useState(reducedMotion ? target : 0);
  useEffect(() => {
    if (reducedMotion) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reducedMotion]);
  return value;
}

function statusTone(s: EvaluationStatus): 'success' | 'info' | 'danger' | 'warning' {
  switch (s) {
    case 'completed':
      return 'success';
    case 'running':
      return 'info';
    case 'failed':
      return 'danger';
    case 'partial':
      return 'warning';
  }
}

/** Minimal inline sparkline with a soft gradient fill — screen-reader labelled. */
function Sparkline({ points, stroke, label }: { points: number[]; stroke: string; label: string }) {
  const gid = useId();
  if (points.length < 2) return null;
  const w = 120;
  const h = 36;
  const pad = 3;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points.map(
    (p, i) =>
      [
        pad + (i / (points.length - 1)) * (w - pad * 2),
        h - pad - ((p - min) / span) * (h - pad * 2),
      ] as const,
  );
  const d = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [fx] = coords[0];
  const [lx, ly] = coords[coords.length - 1];
  const area = `${d} L${lx.toFixed(1)},${h} L${fx.toFixed(1)},${h} Z`;
  const first = points[0];
  const last = points[points.length - 1];
  const direction = last > first ? 'trending up' : last < first ? 'trending down' : 'steady';
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-9 w-28 shrink-0"
      role="img"
      aria-label={`${label}: ${direction}, from ${Math.round(first)} to ${Math.round(last)}`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.5} fill={stroke} />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  sub,
  trend,
  trendLabel,
  stroke,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  trend?: number[];
  trendLabel?: string;
  stroke?: string;
}) {
  return (
    <Card className="card-lift p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">{label}</p>
          <p className="mt-1.5 text-[28px] font-bold tabular-nums tracking-tight text-stone-900 dark:text-white">
            {value}
          </p>
          {sub && <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{sub}</p>}
        </div>
        {trend && trendLabel && stroke && <Sparkline points={trend} stroke={stroke} label={trendLabel} />}
      </div>
    </Card>
  );
}

function ChartCard({
  title,
  description,
  summary,
  children,
}: {
  title: string;
  description?: string;
  summary: string;
  children: React.ReactElement;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardContent>
        <div role="img" aria-label={`${title}. ${summary}`} style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-stone-500 dark:text-stone-400">{summary}</p>
      </CardContent>
    </Card>
  );
}

const BREAKDOWN_TABS = [
  { id: 'usage', label: 'Model usage' },
  { id: 'domain', label: 'Domains' },
  { id: 'cost', label: 'Cost' },
  { id: 'latency', label: 'Latency' },
] as const;

type BreakdownTabId = (typeof BREAKDOWN_TABS)[number]['id'];

function BreakdownCard({ data }: { data: DashboardData }) {
  const [tab, setTab] = useState<BreakdownTabId>('usage');

  const summaries: Record<BreakdownTabId, string> = {
    usage: `Most evaluated: ${data.modelUsage[0]?.model ?? '—'} (${data.modelUsage[0]?.evaluations ?? 0} runs).`,
    domain: `Strongest domain: ${[...data.domainPerformance].sort((a, b) => (b.reliability ?? -1) - (a.reliability ?? -1))[0]?.domain ?? '—'}.`,
    cost: `Total estimated spend: ${formatUsd(data.costByModel.reduce((a, c) => a + c.costUsd, 0))}.`,
    latency: `Fastest model: ${[...data.latencyByModel].sort((a, b) => a.avgMs - b.avgMs)[0]?.model ?? '—'}.`,
  };

  return (
    <Card>
      <CardHeader
        title="Breakdown"
        description="Where your evaluations, spend, and latency go."
        actions={
          <div role="tablist" aria-label="Breakdown views" className="flex flex-wrap gap-1">
            {BREAKDOWN_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === t.id
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                    : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />
      <CardContent>
        <div role="tabpanel" aria-label={BREAKDOWN_TABS.find((t) => t.id === tab)?.label} style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            {tab === 'usage' ? (
              <BarChart data={data.modelUsage} layout="vertical" margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="model" width={130} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="evaluations" name="Evaluations" fill={TEAL} radius={[0, 4, 4, 0]} />
              </BarChart>
            ) : tab === 'domain' ? (
              <BarChart data={data.domainPerformance} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="domain" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="reliability" name="Reliability" fill={TEAL} radius={[4, 4, 0, 0]} />
                <Bar dataKey="consistency" name="Consistency" fill={AMBER} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : tab === 'cost' ? (
              <BarChart data={data.costByModel} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="model" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                <Tooltip content={<ChartTooltip formatter={(v) => [formatUsd(v), 'Cost']} />} />
                <Bar dataKey="costUsd" name="Cost" fill={TEAL} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <BarChart data={data.latencyByModel} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="model" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => formatMs(v)} />
                <Tooltip content={<ChartTooltip formatter={(v) => [formatMs(v), 'Avg latency']} />} />
                <Bar dataKey="avgMs" name="Avg latency" fill={SLATE} radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-stone-500 dark:text-stone-400">{summaries[tab]}</p>
      </CardContent>
    </Card>
  );
}

function RecentRow({ e, onOpen }: { e: EvaluationSummary; onOpen: (id: string) => void }) {
  const openResults = () => onOpen(e.id);
  return (
    <tr
      onClick={openResults}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          openResults();
        }
      }}
      tabIndex={0}
      className="cursor-pointer transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-500 dark:hover:bg-slate-800/50"
      aria-label={`Open results for evaluation: ${truncate(e.prompt, 60)}`}
    >
      <Td>
        <Link
          to={`/evaluate/${e.id}/results`}
          className="font-medium text-brand-700 hover:underline dark:text-brand-400"
          onClick={(ev) => ev.stopPropagation()}
          title={e.prompt}
        >
          {truncate(e.prompt, 80)}
        </Link>
      </Td>
      <Td>
        <Badge tone="default">{`${e.models.length} model${e.models.length === 1 ? '' : 's'}`}</Badge>
      </Td>
      <Td>
        <div className="flex min-w-[140px] items-center gap-2">
          {e.reliability != null ? (
            <>
              <ProgressBar value={e.reliability} className="w-20" />
              <span className="font-medium tabular-nums">{e.reliability}</span>
            </>
          ) : (
            <span className="text-sm italic text-slate-400 dark:text-slate-500">Unavailable</span>
          )}
        </div>
      </Td>
      <Td className="whitespace-nowrap">{formatDate(e.createdAt)}</Td>
      <Td>
        <Badge tone={statusTone(e.status)} className="capitalize">
          {e.status}
        </Badge>
      </Td>
    </tr>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getDashboard());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hooks must run on every render — before any early return.
  const agreedCount = useCountUp(data?.avgConsistency ?? 0);

  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Reliability analytics across all your evaluations." />
        <LoadingState label="Loading dashboard…" rows={5} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Reliability analytics across all your evaluations." />
        <ErrorState message={error ?? 'Failed to load dashboard data.'} onRetry={load} />
      </div>
    );
  }

  const openResults = (id: string) => navigate(`/evaluate/${id}/results`);
  // Sparklines only include measured points — gaps stay gaps, never zeros.
  const reliabilityTrend = data.reliabilityTrend
    .map((t) => t.reliability)
    .filter((v): v is number => v != null);
  const consistencyTrend = data.consistencyTrend
    .map((t) => t.consistency)
    .filter((v): v is number => v != null);

  return (
    <Reveal>
      {/* Hero — one calm headline derived from the displayed data, no card chrome. */}
      <Reveal.Item>
        <section aria-label="Reliability summary" className="relative mb-10 mt-2">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-28 left-1/2 -z-10 h-80 w-[46rem] max-w-none -translate-x-1/2 rounded-full bg-brand-100/70 blur-3xl dark:bg-brand-950/50"
          />
          <p className="type-eyebrow">Reliability overview</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-stone-900 dark:text-white sm:text-4xl">
            {data.avgConsistency != null ? (
              <>
                Your models agreed <span className="tabular-nums">{agreedCount}%</span> of the time.
              </>
            ) : (
              <>No consistency measurements yet.</>
            )}
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-stone-500 dark:text-stone-400">
            Across <span className="font-semibold tabular-nums text-stone-700 dark:text-stone-200">{data.totalEvaluations}</span> evaluations
            and <span className="font-semibold tabular-nums text-stone-700 dark:text-stone-200">{data.modelsTested}</span> models —{' '}
            {data.conflictsDetected} conflicts detected, {data.claimsVerified} claims verified.
          </p>
          <Link
            to="/evaluate/models"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300"
          >
            Run a new evaluation
            <span aria-hidden="true">→</span>
          </Link>
        </section>
      </Reveal.Item>

      <Reveal.Item>
        <p className="type-eyebrow mb-3">Key metrics</p>
        <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Avg reliability"
            value={data.avgReliability != null ? `${data.avgReliability}%` : 'Unavailable'}
            trend={reliabilityTrend}
            trendLabel="Reliability trend"
            stroke={TEAL}
          />
          <MetricCard
            label="Avg consistency"
            value={data.avgConsistency != null ? `${data.avgConsistency}%` : 'Unavailable'}
            trend={consistencyTrend}
            trendLabel="Consistency trend"
            stroke={SLATE}
          />
          <MetricCard
            label="Conflicts detected"
            value={data.conflictsDetected}
            sub={`Across ${data.totalEvaluations} evaluations`}
          />
          <MetricCard
            label="Claims verified"
            value={data.claimsVerified}
            sub={`${data.reportsGenerated} reports generated`}
          />
        </section>
      </Reveal.Item>

      <Reveal.Item>
        <p className="type-eyebrow mb-3 mt-8">Trends</p>
        <section aria-label="Trends" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard
          title="Reliability over time"
          description="Average reliability across evaluations per day."
          summary={
            reliabilityTrend.length > 0
              ? `Reliability is currently ${reliabilityTrend[reliabilityTrend.length - 1]}%.`
              : 'No reliability measurements yet.'
          }
        >
          <AreaChart data={data.reliabilityTrend} margin={{ top: 8, right: 16, bottom: 4, left: -18 }}>
            <defs>
              <linearGradient id="cgRelFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TEAL} stopOpacity={0.28} />
                <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="reliability" name="Reliability" stroke={TEAL} strokeWidth={2} fill="url(#cgRelFill)" dot={false} />
          </AreaChart>
        </ChartCard>

        <ChartCard
          title="Consistency over time"
          description="Average cross-run consistency per day."
          summary={
            consistencyTrend.length > 0
              ? `Consistency is currently ${consistencyTrend[consistencyTrend.length - 1]}%.`
              : 'No consistency measurements yet.'
          }
        >
          <AreaChart data={data.consistencyTrend} margin={{ top: 8, right: 16, bottom: 4, left: -18 }}>
            <defs>
              <linearGradient id="cgConFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SLATE} stopOpacity={0.28} />
                <stop offset="100%" stopColor={SLATE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="consistency" name="Consistency" stroke={SLATE} strokeWidth={2} fill="url(#cgConFill)" dot={false} />
          </AreaChart>
        </ChartCard>
      </section>

      </Reveal.Item>

      <Reveal.Item>
        <p className="type-eyebrow mb-3 mt-8">Breakdown</p>
        <section aria-label="Breakdown">
          <BreakdownCard data={data} />
        </section>
      </Reveal.Item>

      <Reveal.Item>
        <p className="type-eyebrow mb-3 mt-8">Recent evaluations</p>
        <section aria-label="Recent evaluations">
          <Card>
            <CardHeader title="Recent evaluations" description="Your latest evaluation runs." />
            <CardContent>
              {data.recent.length === 0 ? (
                <EmptyState
                  icon="flask"
                  title="No evaluations yet"
                  description="No evaluations yet. Run your first evaluation to start building your reliability history."
                />
              ) : (
                <TableShell ariaLabel="Recent evaluations">
                  <thead>
                    <tr>
                      <Th>Question</Th>
                      <Th>Models</Th>
                      <Th>Reliability</Th>
                      <Th>Date</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((e) => (
                      <RecentRow key={e.id} e={e} onOpen={openResults} />
                    ))}
                  </tbody>
                </TableShell>
              )}
            </CardContent>
          </Card>
        </section>
      </Reveal.Item>
    </Reveal>
  );
}
