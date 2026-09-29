import { useEffect, useMemo, useState } from 'react';
import {
  listAdversarialCategories,
  providersApi,
  runAdversarial,
  toApiError,
  type AdversarialResult,
} from '../lib/api';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  LoadingState,
  PageHeader,
  ProgressBar,
  Spinner,
  Textarea,
  toast,
} from '../components/ui';
import { cn, truncate } from '../lib/utils';

function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

interface ModelOption {
  id: string;
  label: string;
}

function useModelOptions() {
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    providersApi
      .list()
      .then((providers) => {
        if (cancelled) return;
        setModels(
          providers.flatMap((p) =>
            p.models.map((m) => ({ id: m.id, label: `${m.providerName} ${m.displayName}` })),
          ),
        );
      })
      .catch((err) => {
        if (!cancelled) setError(toApiError(err).message);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { models, error, reload: () => setNonce((n) => n + 1) };
}

const RISK_TONE: Record<AdversarialResult['riskLevel'], 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
};

function ChecklistRow({ label, good }: { label: string; good: boolean }) {
  return (
    <li className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
      <Icon
        name={good ? 'check' : 'x'}
        className={cn('h-4 w-4 shrink-0', good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}
      />
      {label}
    </li>
  );
}

function ResultCard({ result }: { result: AdversarialResult }) {
  const checks = [
    { label: 'Hallucinated', good: !result.hallucinated },
    { label: 'Detected uncertainty', good: result.detectedUncertainty },
    { label: 'Challenged false premise', good: result.challengedPremise },
    { label: 'Provided evidence', good: result.providedEvidence },
  ];

  return (
    <Card>
      <CardHeader
        title={result.model}
        actions={
          <>
            <Badge tone={RISK_TONE[result.riskLevel]}>{result.riskLevel} risk</Badge>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {result.latencyMs != null ? formatLatency(result.latencyMs) : 'Latency —'}
            </span>
          </>
        }
      />
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm italic text-slate-600 dark:text-slate-300">
            “{truncate(result.response, 300)}”
          </p>
          {result.response.length > 300 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
                Show full response
              </summary>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                {result.response}
              </p>
            </details>
          )}
        </div>

        <ul className="space-y-1.5">
          {checks.map((c) => (
            <ChecklistRow key={c.label} label={c.label} good={c.good} />
          ))}
        </ul>

        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Uncertainty</span>
              <span className="tabular-nums">
                {result.uncertaintyScore != null ? Math.round(result.uncertaintyScore) : 'Unavailable'}
              </span>
            </div>
            {result.uncertaintyScore != null ? (
              <ProgressBar value={result.uncertaintyScore} />
            ) : (
              <p className="text-xs italic text-slate-400 dark:text-slate-500">Not measured for this run.</p>
            )}
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Evidence strength</span>
              <span className="tabular-nums">
                {result.evidenceStrength != null ? Math.round(result.evidenceStrength) : 'Unavailable'}
              </span>
            </div>
            {result.evidenceStrength != null ? (
              <ProgressBar value={result.evidenceStrength} />
            ) : (
              <p className="text-xs italic text-slate-400 dark:text-slate-500">Not measured for this run.</p>
            )}
          </div>
        </div>

        {result.notes.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Notes
            </h4>
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500 dark:text-slate-400">
              {result.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Adversarial() {
  const categories = useMemo(() => listAdversarialCategories(), []);

  const [categoryId, setCategoryId] = useState<string>(() => categories[0]?.id ?? '');
  const [testPrompt, setTestPrompt] = useState<string>(() => categories[0]?.example ?? '');
  const [promptDirty, setPromptDirty] = useState(false);
  const { models, error: modelsError, reload: reloadModels } = useModelOptions();
  const [modelIds, setModelIds] = useState<string[]>([]);

  // Default to the first few models once the catalog loads.
  useEffect(() => {
    if (models && models.length > 0) {
      setModelIds((prev) => (prev.length === 0 ? models.slice(0, 3).map((m) => m.id) : prev));
    }
  }, [models]);

  const [results, setResults] = useState<AdversarialResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const handleSelectCategory = (id: string) => {
    setCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    if (cat && !promptDirty) {
      setTestPrompt(cat.example);
    }
  };

  const handlePromptChange = (value: string) => {
    setTestPrompt(value);
    if (!promptDirty) setPromptDirty(true);
  };

  const toggleModel = (id: string) => {
    setModelIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
    setRunError(null);
  };

  const handleRun = async () => {
    if (modelIds.length === 0) {
      setRunError('Select at least one model to test.');
      return;
    }
    if (testPrompt.trim().length === 0) {
      setRunError('Enter a test prompt before running.');
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const data = await runAdversarial({ categoryId, prompt: testPrompt, modelIds });
      setResults(data);
      toast('Adversarial test complete', {
        desc: `${data.length} model${data.length === 1 ? '' : 's'} tested.`,
        tone: 'success',
      });
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Adversarial test failed. Please try again.');
    } finally {
      setRunning(false);
    }
  };

  const challengedCount = results?.filter((r) => r.challengedPremise).length ?? 0;
  const highRiskCount = results?.filter((r) => r.riskLevel === 'high').length ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Adversarial Testing"
        description="Stress-test models against tricky, misleading, and impossible prompts."
      />

      {/* Setup */}
      <Card>
        <CardHeader
          title="Test setup"
          description="Choose a failure category, craft the probe, and pick the models to challenge."
        />
        <CardContent className="space-y-6">
          <div>
            <p id="category-label" className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Category
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-labelledby="category-label">
              {categories.map((cat) => {
                const selected = cat.id === categoryId;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handleSelectCategory(cat.id)}
                    className={cn(
                      'rounded-xl border p-4 text-left transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500',
                      selected
                        ? 'border-brand-500 ring-2 ring-brand-500/60'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700',
                    )}
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{cat.name}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{cat.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Test prompt" htmlFor="adversarial-prompt" hint="The probe each model will answer. Editing it stops it from following category changes.">
            <Textarea
              id="adversarial-prompt"
              rows={4}
              value={testPrompt}
              onChange={(e) => handlePromptChange(e.target.value)}
            />
          </Field>

          <Field label="Models" error={runError ?? undefined}>
            {models === null && !modelsError && <LoadingState label="Loading models…" />}
            {modelsError && <ErrorState message={modelsError} onRetry={reloadModels} />}
            {models && models.length === 0 && (
              <EmptyState
                title="No models available"
                description="Connect a provider to make models available for adversarial testing."
              />
            )}
            {models && models.length > 0 && (
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {models.map((m) => (
                  <Checkbox
                    key={m.id}
                    label={m.label}
                    checked={modelIds.includes(m.id)}
                    onChange={() => toggleModel(m.id)}
                  />
                ))}
              </div>
            )}
          </Field>

          <div>
            <Button onClick={handleRun} loading={running} disabled={running}>
              <Icon name="play" className="h-4 w-4" />
              Run Adversarial Test
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <section aria-label="Adversarial results" className="mt-6">
        {running && (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
            <Spinner className="h-5 w-5" />
            <p className="text-sm text-slate-600 dark:text-slate-300">Running adversarial test…</p>
          </div>
        )}

        {!running && !results && !runError && (
          <EmptyState
            icon="shield"
            title="No adversarial tests yet"
            description="Pick a category, craft a prompt, and run the test."
          />
        )}

        {!running && results && results.length === 0 && (
          <EmptyState
            icon="shield"
            title="No model results"
            description="The test ran but no models returned results. Connect a provider API key first, then run the test again."
            action={
              <Button variant="primary" onClick={() => (window.location.href = '/setup/providers')}>
                Connect a provider
              </Button>
            }
          />
        )}

        {!running && results && results.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Latest run
              </p>
              <Badge tone="default">
                {challengedCount}/{results.length} models challenged the premise
              </Badge>
              <Badge tone={highRiskCount > 0 ? 'danger' : 'success'}>
                {highRiskCount} flagged high-risk
              </Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {results.map((r) => (
                <ResultCard key={r.id} result={r} />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
