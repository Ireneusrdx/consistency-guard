import { forwardRef, useId } from 'react';
import type * as React from 'react';
import { cn } from '../../lib/utils';

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  error?: string;
  hint?: string;
  onClear?: () => void;
}

/**
 * Clean search field: borderless pill, soft fill, search icon + clear button.
 * Focus is a gentle surface change — no box border — with a subtle neutral
 * ring for keyboard users.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { label, error, hint, id, className, onClear, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  const showClear = onClear && rest.value !== undefined && String(rest.value).length > 0;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-200"
        >
          {label}
        </label>
      )}
      <span className="relative block">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-stone-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={ref}
          type="search"
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
          className={cn(
            'w-full rounded-full border-0 bg-stone-100 py-2.5 pl-11 pr-10 text-sm text-stone-900 placeholder:text-stone-400',
            'transition-colors duration-150 hover:bg-stone-200/70',
            'focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-200 focus:placeholder:text-stone-300',
            'dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500 dark:hover:bg-stone-700/60',
            'dark:focus:bg-stone-900 dark:focus:ring-stone-700',
            '[&::-webkit-search-cancel-button]:hidden',
            className,
          )}
        />
        {showClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-600 dark:hover:bg-stone-700 dark:hover:text-stone-300"
          >
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </span>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          {hint}
        </p>
      )}
    </div>
  );
});

SearchInput.displayName = 'SearchInput';
