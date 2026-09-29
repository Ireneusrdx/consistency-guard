import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  Modal,
  PageHeader,
  toast,
} from '../components/ui';
import {
  listBenchmarks,
  providersApi,
  runBenchmark,
  toApiError,
  type BenchmarkDataset,
} from '../lib/api';
import { downloadTextFile, formatDateTime } from '../lib/utils';

const STATUS_TONE: Record<BenchmarkDataset['status'], 'default' | 'info' | 'success' | 'danger'> = {
  ready: 'default',
  running: 'info',
  completed: 'success',
  failed: 'danger',
};

function statusLabel(status: BenchmarkDataset['status']): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function escapeCsv(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Benchmarks() {
  const navigate = useNavigate();
  const [benchmarks, setBenchmarks] = useState<BenchmarkDataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [runTarget, setRunTarget] = useState<BenchmarkDataset | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [modelOptions, setModelOptions] = useState<{ id: string; model: string; provider: string }[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const fetchList = async () => {
    setLoading(true);
    setError(null);
    try {
      setBenchmarks(await listBenchmarks());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load benchmarks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchList();
    providersApi
      .list()
      .then((providers) => {
        setModelOptions(
          providers.flatMap((p) =>
            p.models.map((m) => ({ id: m.id, model: m.displayName, provider: m.providerName })),
          ),
        );
      })
      .catch((err) => setModelsError(toApiError(err).message));
  }, []);

  const openRunModal = (b: BenchmarkDataset) => {
    setRunTarget(b);
    setSelectedModels((prev) =>
      prev.length > 0 ? prev : modelOptions.slice(0, 3).map((m) => m.id),
    );
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels((prev) =>
      prev.includes(modelId) ? prev.filter((id) => id !== modelId) : [...prev, modelId],
    );
  };

  const handleRun = async () => {
    if (!runTarget || selectedModels.length === 0 || running) return;
    setRunning(true);
    try {
      await runBenchmark(runTarget.id, selectedModels);
      toast('Benchmark run started', {
        desc: `${runTarget.name} — ${selectedModels.length} model(s) selected.`,
        tone: 'success',
      });
      setRunTarget(null);
      await fetchList();
    } catch (err) {
      toast('Could not start benchmark run', {
        desc: err instanceof Error ? err.message : undefined,
        tone: 'error',
      });
    } finally {
      setRunning(false);
    }
  };

  const exportCsv = (b: BenchmarkDataset) => {
    const header = 'name,domain,questions,lastRun,models,status';
    const row = [
      b.name,
      b.domain,
      b.questionCount,
      b.lastRunAt ?? 'never',
      b.models.length,
      b.status,
    ]
      .map(escapeCsv)
      .join(',');
    downloadTextFile(`${b.id}-summary.csv`, `${header}\n${row}\n`, 'text/csv');
    toast('Report exported', { desc: `${b.name} summary downloaded as CSV.`, tone: 'success' });
  };

  return (
    <div>
      <PageHeader
        title="Benchmarks"
        description="Curated question banks with reference answers for ground-truth accuracy measurement."
        actions={
          <Button onClick={() => navigate('/benchmarks/upload')}>
            <Icon name="upload" className="h-4 w-4" />
            Upload Dataset
          </Button>
        }
      />

      {loading ? (
        <LoadingState label="Loading benchmarks…" />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchList} />
      ) : benchmarks.length === 0 ? (
        <EmptyState
          icon="layers"
          title="No benchmarks yet"
          description="No benchmarks yet. Upload a question bank or choose a curated benchmark."
          action={
            <Button onClick={() => navigate('/benchmarks/upload')}>
              <Icon name="upload" className="h-4 w-4" />
              Upload Dataset
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {benchmarks.map((b) => (
            <Card key={b.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 py-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">{b.name}</h3>
                  <Badge tone={STATUS_TONE[b.status]}>{statusLabel(b.status)}</Badge>
                </div>
                <div>
                  <Badge>{b.domain}</Badge>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{b.description}</p>
                <dl className="mt-1 space-y-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">Questions</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">
                      {b.questionCount} questions
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">Last run</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">
                      {b.lastRunAt ? formatDateTime(b.lastRunAt) : 'Never run'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">Models tested</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">{b.models.length}</dd>
                  </div>
                </dl>
                <div className="mt-auto flex flex-wrap gap-2 pt-3">
                  <Button size="sm" onClick={() => openRunModal(b)}>
                    <Icon name="play" className="h-4 w-4" />
                    Run Benchmark
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/benchmarks/${b.id}/results`)}>
                    View Results
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => exportCsv(b)}>
                    <Icon name="download" className="h-4 w-4" />
                    Export Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={runTarget !== null}
        onClose={() => setRunTarget(null)}
        title={runTarget ? `Run benchmark — ${runTarget.name}` : 'Run benchmark'}
        footer={
          <>
            <Button variant="outline" onClick={() => setRunTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRun} loading={running} disabled={selectedModels.length === 0}>
              <Icon name="play" className="h-4 w-4" />
              Start Run
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Select at least one model to evaluate against this question bank.
        </p>
        <div className="mt-4 space-y-2">
          {modelsError && <ErrorState message={modelsError} />}
          {modelOptions.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
            >
              <Checkbox
                label={
                  <span>
                    <span className="font-medium text-slate-900 dark:text-white">{m.model}</span>
                    <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{m.provider}</span>
                  </span>
                }
                checked={selectedModels.includes(m.id)}
                onChange={() => toggleModel(m.id)}
              />
            </div>
          ))}
        </div>
        {selectedModels.length === 0 && (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400" role="alert">
            Select at least one model to start the run.
          </p>
        )}
      </Modal>
    </div>
  );
}
