import type { ConflictItem } from '../../types';
import { Badge } from './Badge';
import { Card } from './Card';

export interface ConflictCardProps {
  conflict: ConflictItem;
}

const severityBadge: Record<ConflictItem['severity'], { variant: 'error' | 'warning' | 'info'; label: string }> = {
  high: { variant: 'error', label: 'High' },
  medium: { variant: 'warning', label: 'Medium' },
  low: { variant: 'info', label: 'Low' },
};

export function ConflictCard({ conflict }: ConflictCardProps) {
  const severity = severityBadge[conflict.severity];

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <Badge variant={severity.variant}>{severity.label} severity</Badge>
      </div>
      {conflict.title && (
        <h4 className="mt-2 font-semibold text-stone-900 dark:text-stone-100">{conflict.title}</h4>
      )}
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{conflict.description}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-800/50">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Claim A
          </p>
          <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">{conflict.claimA}</p>
        </div>
        <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-800/50">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Claim B
          </p>
          <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">{conflict.claimB}</p>
        </div>
      </div>

      {conflict.models.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {conflict.models.map((name) => (
            <Badge key={name}>{name}</Badge>
          ))}
        </div>
      )}

      {conflict.evidence && (
        <p className="mt-3 border-t border-stone-200 pt-3 text-sm text-stone-600 dark:border-stone-800 dark:text-stone-400">
          {conflict.evidence}
        </p>
      )}
    </Card>
  );
}
