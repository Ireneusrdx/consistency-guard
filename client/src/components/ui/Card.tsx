import type * as React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, subtitle, actions, children, className }: CardProps) {
  const hasHeader = Boolean(title || subtitle || actions);

  return (
    <div
      className={cn(
        'rounded-xl border border-stone-200 bg-white shadow-card dark:bg-stone-900 dark:border-stone-800',
        className,
      )}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="min-w-0">
            {title && (
              <h3 className="font-semibold text-stone-900 dark:text-stone-100">{title}</h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('px-5 pb-5', hasHeader ? 'pt-4' : 'pt-5')}>{children}</div>
    </div>
  );
}
