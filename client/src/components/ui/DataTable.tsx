import type * as React from 'react';
import { cn } from '../../lib/utils';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
}

function cellValue<T>(column: Column<T>, row: T): React.ReactNode {
  if (column.render) return column.render(row);
  const value = (row as Record<string, unknown>)[column.key];
  if (value == null) return '—';
  return String(value);
}

export function DataTable<T>({
  columns,
  rows,
  keyOf,
  loading = false,
  emptyMessage = 'No rows to display.',
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 dark:bg-stone-800/50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading &&
            [0, 1, 2].map((i) => (
              <tr key={`skeleton-${i}`}>
                <td colSpan={columns.length} className="px-4 py-3">
                  <div className="h-4 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
                </td>
              </tr>
            ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-4">
                <EmptyState title="No data" description={emptyMessage} />
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((row) => (
              <tr key={keyOf(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'border-t border-stone-200 px-4 py-3 text-stone-700 dark:border-stone-800 dark:text-stone-300',
                      column.className,
                    )}
                  >
                    {cellValue(column, row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
