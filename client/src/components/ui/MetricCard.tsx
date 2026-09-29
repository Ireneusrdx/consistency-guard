import type * as React from 'react';
import { cn } from '../../lib/utils';
import { Card } from './Card';

export interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  icon?: React.ReactNode;
}

const toneStyles: Record<NonNullable<MetricCardProps['tone']>, string> = {
  default: 'text-stone-900 dark:text-stone-100',
  good: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-red-600 dark:text-red-400',
};

export function MetricCard({ label, value, sub, tone = 'default', icon }: MetricCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {label}
          </p>
          <p className={cn('mt-1 text-2xl font-bold', toneStyles[tone])}>{value}</p>
          {sub && (
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{sub}</p>
          )}
        </div>
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
