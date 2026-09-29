import type { ModelInfo } from '../../types';
import { cn } from '../../lib/utils';
import { Badge } from './Badge';

export interface ModelCardProps {
  model: ModelInfo;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function formatContextLength(tokens: number | null | undefined): string {
  if (tokens == null) return '—';
  if (tokens >= 1000) return `${tokens / 1000}k`;
  return `${tokens}`;
}

function formatCost(costPer1k: number | null | undefined): string {
  if (costPer1k == null) return '—';
  return `$${costPer1k.toFixed(2)} / 1k tokens`;
}

const speedBadge: Record<ModelInfo['speed'], { variant: 'success' | 'warning' | 'default'; label: string }> = {
  fast: { variant: 'success', label: 'Fast' },
  medium: { variant: 'warning', label: 'Medium' },
  slow: { variant: 'default', label: 'Slow' },
};

export function ModelCard({ model, selected, onToggle, disabled = false }: ModelCardProps) {
  const unavailable = !model.available;
  const isDisabled = disabled || unavailable;
  const speed = speedBadge[model.speed];

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={`${model.displayName}${unavailable ? ' (unavailable)' : ''}`}
      disabled={isDisabled}
      onClick={onToggle}
      className={cn(
        'w-full rounded-xl border p-4 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        'disabled:cursor-not-allowed',
        selected
          ? 'border-primary-600 bg-primary-50 dark:border-primary-500 dark:bg-primary-950/40'
          : 'border-stone-200 bg-white hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700',
        isDisabled && 'opacity-50',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-stone-900 dark:text-stone-100">{model.displayName}</p>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{model.providerName}</p>
        </div>
        <span
          aria-hidden="true"
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
            selected
              ? 'border-primary-600 bg-primary-600 text-white dark:border-primary-500 dark:bg-primary-500'
              : 'border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-900',
          )}
        >
          {selected && (
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              <path
                d="M3.5 8.5l3 3 6-6.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-stone-500 dark:text-stone-400">
          {formatContextLength(model.contextLength)} context
        </span>
        <span className="text-xs text-stone-500 dark:text-stone-400">
          {formatCost(model.estCostPer1k)}
        </span>
        <Badge variant={speed.variant}>{speed.label}</Badge>
        {unavailable && <Badge variant="error">Unavailable</Badge>}
      </div>
    </button>
  );
}
