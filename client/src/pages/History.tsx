import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  deleteEvaluation,
  evaluationReport,
  listEvaluations,
  providersApi,
  rerunEvaluation,
  type EvaluationFilters,
  type EvaluationStatus,
  type EvaluationSummary,
  type Paginated,
} from '../lib/api';
import { DOMAINS, TASK_TYPES } from '../lib/options';
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  ProgressBar,
  SearchInput,
  Select,
  TableShell,
  Td,
  Th,
  toast,
} from '../components/ui';
import { formatDate, truncate, useDebouncedValue } from '../lib/utils';

const PAGE_SIZE = 10;
const STATUSES: EvaluationStatus[] = ['completed', 'running', 'failed', 'partial'];

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

interface ModelOption {
  id: string;
  label: string;
  providerName: string;
}

export default function History() {
  const navigate = useNavigate();

  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [providerByModel, setProviderByModel] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    providersApi
      .list()
      .then((providers) => {
        if (cancelled) return;
        const byModel: Record<string, string> = {};
        const options: ModelOption[] = providers.flatMap((p) =>
          p.models.map((m) => {
            byModel[m.id] = m.providerName;
            return { id: m.id, label: `${m.providerName} — ${m.displayName}`, providerName: m.providerName };
          }),
        );
        setProviderByModel(byModel);
        setModelOptions(options);
      })
      .catch(() => {
        // Model filter is a convenience; history still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [domain, setDomain] = useState('');
  const [model, setModel] = useState('');
  const [taskType, setTaskType] = useState('');
  const [status, setStatus] = useState('');
  const [minReliability, setMinReliability] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<Paginated<EvaluationSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState<{ id: string; action: 'rerun' | 'report' } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filters = useMemo<EvaluationFilters>(() => {
    const minNum = minReliability === '' ? NaN : Number(minReliability);
    return {
      q: debouncedSearch.trim() || undefined,
      domain: domain || undefined,
      model: model || undefined,
      taskType: taskType || undefined,
      status: status || undefined,
      minReliability:
        Number.isNaN(minNum) ? undefined : Math.max(0, Math.min(100, minNum)),
      from: from || undefined,
      to: to || undefined,
      page,
      pageSize: PAGE_SIZE,
    };
  }, [debouncedSearch, domain, model, taskType, status, minReliability, from, to, page]);

  // Reset to the first page whenever any filter changes.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, domain, model, taskType, status, minReliability, from, to]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listEvaluations(filters)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load evaluations.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, refreshKey]);

  const resetFilters = () => {
    setSearch('');
    setDomain('');
    setModel('');
    setTaskType('');
    setStatus('');
    setMinReliability('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const handleRerun = async (id: string) => {
    setBusy({ id, action: 'rerun' });
    try {
      await rerunEvaluation(id);
      toast('Re-run queued', { tone: 'success' });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to queue re-run.', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const handleReport = async (e: EvaluationSummary) => {
    setBusy({ id: e.id, action: 'report' });
    try {
      await evaluationReport(e.id, `Reliability Report — ${e.domain}`);
      toast('Report generated', { tone: 'success' });
      navigate('/reports');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to generate report.', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteEvaluation(deleteId);
      toast('Evaluation deleted', { tone: 'success' });
      setDeleteId(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to delete evaluation.', { tone: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader title="History" description="Browse, filter, and manage every evaluation." />

      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-4">
              <Field label="Search prompts" htmlFor="history-search">
                <SearchInput
                  id="history-search"
                  placeholder="Search prompts…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClear={() => setSearch('')}
                />
              </Field>
            </div>
            <Field label="Domain" htmlFor="history-domain">
              <Select id="history-domain" value={domain} onChange={(e) => setDomain(e.target.value)}>
                <option value="">All</option>
                {DOMAINS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Model" htmlFor="history-model">
              <Select id="history-model" value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">All</option>
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Task type" htmlFor="history-task">
              <Select id="history-task" value={taskType} onChange={(e) => setTaskType(e.target.value)}>
                <option value="">All</option>
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="history-status">
              <Select id="history-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Min reliability" htmlFor="history-minrel">
              <Input
                id="history-minrel"
                type="number"
                min={0}
                max={100}
                placeholder="0–100"
                value={minReliability}
                onChange={(e) => setMinReliability(e.target.value)}
              />
            </Field>
            <Field label="From" htmlFor="history-from">
              <Input id="history-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To" htmlFor="history-to">
              <Input id="history-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <div className="flex items-end">
              <Button variant="ghost" onClick={resetFilters}>
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
          {loading ? 'Loading evaluations…' : `${result?.items.length ?? 0} of ${total} evaluations`}
        </p>
      </div>

      <div className="mt-2">
        {loading && <LoadingState label="Loading evaluations…" rows={4} />}
        {!loading && error && <ErrorState message={error} onRetry={() => setRefreshKey((k) => k + 1)} />}
        {!loading && !error && result && result.items.length === 0 && (
          <EmptyState
            icon="history"
            title="No evaluations found"
            description="Try adjusting filters, or run your first evaluation."
            action={<Button onClick={() => navigate('/evaluate/models')}>New evaluation</Button>}
          />
        )}
        {!loading && !error && result && result.items.length > 0 && (
          <TableShell ariaLabel="Evaluation history">
            <thead>
              <tr>
                <Th>Prompt</Th>
                <Th>Models</Th>
                <Th>Reliability</Th>
                <Th>Consistency</Th>
                <Th>Conflicts</Th>
                <Th>Date</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((e) => {
                const providers = e.models.map((modelId) => providerByModel[modelId] ?? modelId);
                const providersLabel = providers.join(', ');
                return (
                  <tr key={e.id}>
                    <Td>
                      <Link
                        to={`/evaluate/${e.id}/results`}
                        className="font-medium text-brand-700 hover:underline dark:text-brand-400"
                        title={e.prompt}
                      >
                        {truncate(e.prompt, 90)}
                      </Link>
                    </Td>
                    <Td>
                      <span title={providersLabel} className="block max-w-[180px] truncate">
                        {providersLabel}
                      </span>
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
                    <Td>
                      <span className="font-medium tabular-nums">{e.consistency}</span>
                    </Td>
                    <Td>
                      <Badge tone={e.conflicts > 0 ? 'warning' : 'default'}>{e.conflicts}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap">{formatDate(e.createdAt)}</Td>
                    <Td>
                      <Badge tone={statusTone(e.status)} className="capitalize">
                        {e.status}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex min-w-[280px] flex-wrap gap-1">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/evaluate/${e.id}/results`)}>
                          View
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/compare?eval=${e.id}`)}>
                          Compare
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={busy?.id === e.id && busy.action === 'rerun'}
                          onClick={() => void handleRerun(e.id)}
                        >
                          Run Again
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={busy?.id === e.id && busy.action === 'report'}
                          onClick={() => void handleReport(e)}
                        >
                          Report
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
                          onClick={() => setDeleteId(e.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </div>

      {!loading && !error && result && result.items.length > 0 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Page {page} of {totalPages}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </nav>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete evaluation"
        description="This will permanently delete this evaluation and its results. This action cannot be undone."
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  );
}
