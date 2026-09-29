import { forwardRef, useId } from 'react';
import type * as React from 'react';
import { cn } from '../../lib/utils';

export interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  error?: string;
  hint?: string;
}

/**
 * Custom range slider — fully themed track + thumb (see .cg-range in
 * index.css). The filled portion is driven by --cg-range-fill, computed here
 * whenever the position is known.
 */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { label, error, hint, id, className, min = 0, max = 100, value, defaultValue, style, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  const current = value ?? defaultValue;
  const pct =
    current !== undefined && Number(max) !== Number(min)
      ? Math.min(100, Math.max(0, ((Number(current) - Number(min)) / (Number(max) - Number(min))) * 100))
      : undefined;

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
      <input
        ref={ref}
        type="range"
        id={inputId}
        min={min}
        max={max}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
        style={{ ...style, ...(pct !== undefined ? ({ '--cg-range-fill': `${pct}%` } as React.CSSProperties) : null) }}
        className={cn('cg-range', className)}
      />
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

Slider.displayName = 'Slider';
