import type { EvidenceItem } from '../../types';
import { Badge } from './Badge';
import { Card } from './Card';
import { ProgressBar } from './ProgressBar';

export interface EvidenceCardProps {
  evidence: EvidenceItem;
}

const statusBadge: Record<EvidenceItem['status'], { variant: 'success' | 'error' | 'warning'; label: string }> = {
  supported: { variant: 'success', label: 'Supported' },
  contradicted: { variant: 'error', label: 'Contradicted' },
  unverified: { variant: 'warning', label: 'Unverified' },
};

export function EvidenceCard({ evidence }: EvidenceCardProps) {
  const status = statusBadge[evidence.status];

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <p className="mt-2 font-medium text-stone-900 dark:text-stone-100">{evidence.claim}</p>
      <div className="mt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
          External source
        </p>
        <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">
          {evidence.source}{' '}
          {evidence.sourceUrl && (
            <a
              href={evidence.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
              aria-label={`Open source: ${evidence.source}`}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M6.5 3.5H3.5v9h9V9.5M9.5 3.5h3v3M12.2 3.8L7.5 8.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="sr-only">Open source</span>
            </a>
          )}
        </p>
      </div>
      {evidence.snippet && (
        <blockquote className="mt-3 border-l-4 border-stone-200 pl-3 text-sm italic text-stone-600 dark:border-stone-700 dark:text-stone-400">
          {evidence.snippet}
        </blockquote>
      )}
      {evidence.reason && (
        <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">{evidence.reason}</p>
      )}
      <div className="mt-4">
        <ProgressBar value={evidence.confidence} label="Confidence" tone="primary" />
      </div>
    </Card>
  );
}
