/**
 * Model selection: pick which models to compare in the next evaluation.
 * Selection persists to localStorage.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  SearchInput,
  Select,
  LoadingState,
  EmptyState,
  ErrorState,
  PageHeader,
  Icon,
} from '../components/ui';
import { providersApi, toApiError } from '../lib/api';
import { cn } from '../lib/utils';

const STORAGE_KEY = 'cg_selected_models';

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  providerId: string;
  freeTier?: boolean;
}

function readStoredSelection(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

async function loadModels(): Promise<ModelOption[]> {
  const providers = await providersApi.list();
  const freeTierByProvider = new Map(providers.map((p) => [p.id, p.freeTier === true]));
  return providers.flatMap((p) =>
    p.models.map((m) => ({
      id: m.id,
      name: m.displayName,
      provider: m.providerName,
      providerId: m.providerId,
      freeTier: freeTierByProvider.get(m.providerId),
    })),
  );
}

// ------------------------------------------------------------------- card --
function ModelCard({
  model,
  selected,
  onToggle,
}: {
  model: ModelOption;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        'cursor-pointer rounded-xl border bg-white p-5 shadow-card transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-slate-900',
        selected
          ? 'border-brand-600 ring-1 ring-brand-600 dark:border-brand-400 dark:ring-brand-400'
          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 dark:text-white">{model.name}</p>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{model.provider}</p>
        </div>
        <span
          aria-hidden="true"
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors',
            selected
              ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-400 dark:bg-brand-500'
              : 'border-slate-300 text-transparent dark:border-slate-600',
          )}
        >
          <Icon name="check" className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 font-mono text-xs text-slate-400 dark:text-slate-500">{model.id}</p>
    </div>
  );
}

// ------------------------------------------------------------------- page --
export default function ModelSelection() {
  const navigate = useNavigate();

  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [selectedIds, setSelectedIds] = useState<string[]>(() => readStoredSelection());
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [continueError, setContinueError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadModels().then(
      (list) => {
        if (!cancelled) setModels(list);
      },
      (e) => {
        if (!cancelled) setLoadError(toApiError(e).message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const providerNames = useMemo(() => {
    const names = new Map<string, { name: string; freeTier: boolean }>();
    for (const m of models ?? []) names.set(m.provider, { name: m.provider, freeTier: m.freeTier === true });
    return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [models]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (models ?? []).filter((m) => {
      const matchesSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q);
      const matchesProvider = providerFilter === 'all' || m.provider === providerFilter;
      return matchesSearch && matchesProvider;
    });
  }, [models, search, providerFilter]);

  const toggle = (id: string) => {
    setContinueError(null);
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAll = () => {
    setContinueError(null);
    setSelectedIds(filtered.map((m) => m.id));
  };

  const clear = () => {
    setSelectedIds([]);
  };

  const goContinue = () => {
    if (selectedIds.length === 0) {
      setContinueError('Select at least one model to continue');
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds));
    navigate('/evaluate/question');
  };

  const hasFilters = search.trim() !== '' || providerFilter !== 'all';

  return (
    <div className="pb-32">
      <PageHeader
        title="Choose Models"
        description="Pick the models to compare. The same question will be sent to each selected model."
      />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="model-search" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Search models
          </label>
          <SearchInput
            id="model-search"
            placeholder="Search by name or provider…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
          />
        </div>
        <div className="min-w-[180px]">
          <label htmlFor="provider-filter" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Provider
          </label>
            <Select id="provider-filter" value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
              <option value="all">All providers</option>
              {providerNames.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.freeTier ? `${p.name} · Free` : p.name}
                </option>
              ))}
            </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={selectAll} disabled={filtered.length === 0}>
            Select all
          </Button>
          <Button variant="ghost" onClick={clear} disabled={selectedIds.length === 0}>
            Clear
          </Button>
        </div>
      </div>

      {models === null && !loadError && <LoadingState label="Loading models…" />}
      {loadError && <ErrorState message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />}
      {models !== null && !loadError && filtered.length === 0 && (
        <EmptyState
          icon="search"
          title="No models found"
          description={
            hasFilters
              ? 'No models match your search. Try clearing the filters.'
              : 'No models are available. Connect a provider first.'
          }
          action={
            hasFilters ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setProviderFilter('all');
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => navigate('/setup/providers')}>
                Connect providers
              </Button>
            )
          }
        />
      )}
      {models !== null && !loadError && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              selected={selectedIds.includes(model.id)}
              onToggle={() => toggle(model.id)}
            />
          ))}
        </div>
      )}

      {/* Selection bar — fixed functional layer. On desktop it starts after the
          sidebar (lg:left-64) so the side nav never covers it; on mobile it
          floats above the bottom nav (which is ~3.5rem + safe-area tall).
          Translucent material + edge fade per the design system, no hard divider. */}
      <div className="material-chrome fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 lg:bottom-0 lg:left-64">
        <div aria-hidden="true" className="edge-fade-t pointer-events-none absolute inset-x-0 bottom-full h-8" />
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-medium text-stone-900 dark:text-stone-100" aria-live="polite">
              {selectedIds.length} model{selectedIds.length === 1 ? '' : 's'} selected
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400">2+ models recommended for comparison</p>
            {continueError && (
              <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                {continueError}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate('/setup/providers')}>
              Back
            </Button>
            <Button onClick={goContinue}>Continue to Question</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
