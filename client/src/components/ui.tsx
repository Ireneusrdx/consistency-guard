/**
 * Consistency Guard UI primitives — original design system.
 * Neutral base + teal primary accent, 8px spacing, thin borders, subtle shadows.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn, scoreTone } from '../lib/utils';
import { fadeOnly, springDefault, springSnappy, surfaceVariants, triggerOrigin, usePrefersReducedMotion } from '../lib/motion';

// ---------------------------------------------------------------- icons ---
type IconProps = { className?: string };

function Svg({ className, children, filled }: IconProps & { children: React.ReactNode; filled?: boolean }) {
  return (
    <svg
      className={className ?? 'h-5 w-5'}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={filled ? undefined : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const paths: Record<string, React.ReactNode> = {
  dashboard: (<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>),
  flask: (<><path d="M9 3h6" /><path d="M10 3v6L4.5 18.5A2 2 0 0 0 6.3 21.5h11.4a2 2 0 0 0 1.8-3L14 9V3" /><path d="M7.5 14h9" /></>),
  compare: (<><path d="M8 3v18" /><path d="M16 3v18" /><path d="M3 8h5" /><path d="M3 16h5" /><path d="M16 8h5" /><path d="M16 16h5" /></>),
  chart: (<><path d="M3 3v18h18" /><path d="M7 15l4-6 4 3 5-7" /></>),
  history: (<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 3" /></>),
  bulb: (<><path d="M9 18h6" /><path d="M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.8.7 1 1.5 1 2.5h6c0-1 .2-1.8 1-2.5A6 6 0 0 0 12 3z" /></>),
  shield: (<><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></>),
  report: (<><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-7-5z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h6" /></>),
  gear: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" /></>),
  menu: (<><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>),
  x: (<><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="M4.9 4.9l1.4 1.4" /><path d="M17.7 17.7l1.4 1.4" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="M4.9 19.1l1.4-1.4" /><path d="M17.7 6.3l1.4-1.4" /></>),
  moon: (<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />),
  search: (<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>),
  plus: (<><path d="M12 5v14" /><path d="M5 12h14" /></>),
  download: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></>),
  trash: (<><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>),
  check: (<path d="M20 6L9 17l-5-5" />),
  alert: (<><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>),
  info: (<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>),
  chevronDown: (<path d="M6 9l6 6 6-6" />),
  copy: (<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  refresh: (<><path d="M23 4v6h-6" /><path d="M20.5 15a9 9 0 1 1-1.4-8.4L23 10" /></>),
  upload: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></>),
  file: (<><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-7-5z" /><path d="M14 3v5h5" /></>),
  clock: (<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>),
  zap: (<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />),
  user: (<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  logout: (<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>),
  key: (<><circle cx="8" cy="15" r="4" /><path d="M10.9 12.1L21 2" /><path d="M15 8l3 3" /></>),
  layers: (<><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></>),
  target: (<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>),
  arrowRight: (<><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></>),
  play: (<path d="M6 4l14 8-14 8V4z" />),
  scale: (<><path d="M12 3v18" /><path d="M5 7l7-4 7 4" /><path d="M3 13l2-6 2 6a3.5 3.5 0 0 1-4 0z" /><path d="M17 13l2-6 2 6a3.5 3.5 0 0 1-4 0z" /></>),
};

export function Icon({ name, className }: { name: keyof typeof paths; className?: string }) {
  return <Svg className={className}>{paths[name]}</Svg>;
}

// ---------------------------------------------------------------- buttons --
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500 dark:bg-brand-500 dark:hover:bg-brand-600',
    secondary: 'bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white',
    outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  const sizes: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- inputs ---
const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputCls, 'min-h-[96px] resize-y', props.className)} />;
}

/**
 * Clean search field: borderless pill, soft fill, icon + clear button.
 * Focus is a gentle surface change — no box border — while keeping a subtle
 * neutral ring for keyboard users.
 */
export function SearchInput({
  onClear,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { onClear?: () => void }) {
  const showClear = onClear && props.value !== undefined && String(props.value).length > 0;
  return (
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
        type="search"
        {...props}
        className={cn(
          'w-full rounded-full border-0 bg-stone-100 py-2.5 pl-11 pr-10 text-sm text-stone-900 placeholder:text-stone-400',
          'transition-colors duration-150 hover:bg-stone-200/70',
          'focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-200 focus:placeholder:text-stone-300',
          'dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500 dark:hover:bg-stone-700/60',
          'dark:focus:bg-stone-900 dark:focus:ring-stone-700',
          '[&::-webkit-search-cancel-button]:hidden',
          props.className,
        )}
      />
      {showClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-600 dark:hover:bg-stone-700 dark:hover:text-stone-300"
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </span>
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select {...props} className={cn(inputCls, 'appearance-none pr-10', props.className)} />
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-stone-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}

export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200">
      <input type="checkbox" {...props} className={cn('cg-checkbox-input sr-only', props.className)} />
      <span aria-hidden="true" className="cg-checkbox-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      {label && <span className="cg-checkbox-label-text">{label}</span>}
    </label>
  );
}

export function Switch({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
      <input type="checkbox" role="switch" {...props} className="peer sr-only" />
      <span className="relative h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-brand-600 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand-500 dark:bg-slate-700 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
      {label}
    </label>
  );
}

export function Slider(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { min = 0, max = 100, value, defaultValue, style, ...rest } = props;
  // Drive the filled portion of the track. Only possible when the position is
  // known (controlled value or defaultValue); otherwise the CSS default applies.
  const current = value ?? defaultValue;
  const pct =
    current !== undefined && Number(max) !== Number(min)
      ? Math.min(100, Math.max(0, ((Number(current) - Number(min)) / (Number(max) - Number(min))) * 100))
      : undefined;
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      {...rest}
      style={{ ...style, ...(pct !== undefined ? ({ '--cg-range-fill': `${pct}%` } as React.CSSProperties) : null) }}
      className={cn('cg-range', props.className)}
    />
  );
}

export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
}: {
  label?: React.ReactNode;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ card ---
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, description, actions }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

/**
 * Reveal — staggered entrance for page sections. Children wrapped in
 * <Reveal.Item> fade/slide in sequence; reduced motion gets a plain fade.
 */
export function Reveal({ className, children, delay = 0 }: { className?: string; children: React.ReactNode; delay?: number }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: reducedMotion ? 0 : 0.07, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  );
}

Reveal.Item = function RevealItem({ className, children }: { className?: string; children: React.ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 },
        show: reducedMotion
          ? { opacity: 1, transition: fadeOnly }
          : { opacity: 1, y: 0, transition: springDefault },
      }}
    >
      {children}
    </motion.div>
  );
};

/**
 * ChartTooltip — shared recharts tooltip styled like the app's cards.
 * Pass as <Tooltip content={<ChartTooltip />} />.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string; dataKey?: string | number }>;
  label?: string | number;
  formatter?: (value: number, name: string) => [string, string];
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 shadow-pop dark:border-stone-700 dark:bg-stone-900">
      {label !== undefined && (
        <p className="mb-1 text-xs font-semibold text-stone-500 dark:text-stone-400">{label}</p>
      )}
      {payload.map((p, i) => {
        const [fValue, fName] = formatter ? formatter(Number(p.value), String(p.name ?? p.dataKey ?? '')) : [String(p.value ?? ''), String(p.name ?? p.dataKey ?? '')];
        return (
          <p key={i} className="flex items-center gap-2 text-sm tabular-nums text-stone-900 dark:text-stone-100">
            {p.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} aria-hidden="true" />}
            <span className="text-stone-500 dark:text-stone-400">{fName}</span>
            <span className="ml-auto pl-3 font-semibold">{fValue}</span>
          </p>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ badge --
type BadgeTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({ tone = 'default', className, title, children }: { tone?: BadgeTone; className?: string; title?: string; children: React.ReactNode }) {
  const tones: Record<BadgeTone, string> = {
    default: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    info: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  };
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}


// ------------------------------------------------------------------- tabs --
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: React.ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('border-b border-slate-200 dark:border-slate-800', className)} role="tablist" aria-label="Sections">
      <div className="-mb-px flex gap-1 overflow-x-auto scroll-thin">
        {tabs.map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(t.id)}
              className={cn(
                'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                selected
                  ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- states ---
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('h-5 w-5 animate-spin text-brand-600', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function LoadingState({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label={label}>
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Spinner className="h-4 w-4" />
        {label}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="cg-skeleton h-16 rounded-xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon = 'search',
  title,
  description,
  action,
}: {
  icon?: keyof typeof paths;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700">
      <span className="rounded-full bg-slate-100 p-3 text-slate-400 dark:bg-slate-800">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
      {description && <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center dark:border-red-900/50 dark:bg-red-950/30">
      <span className="rounded-full bg-red-100 p-3 text-red-500 dark:bg-red-900/40">
        <Icon name="alert" className="h-6 w-6" />
      </span>
      <p className="max-w-md text-sm text-red-700 dark:text-red-300">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <Icon name="refresh" className="h-4 w-4" /> Try again
        </Button>
      )}
    </div>
  );
}

// --------------------------------------------------------------- metrics --
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const tone = scoreTone(value);
  const bar = tone === 'success' ? 'bg-emerald-500' : tone === 'warning' ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-all', bar)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function ScoreRing({ value, size = 88, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(value);
  const stroke = tone === 'success' ? '#10b981' : tone === 'warning' ? '#f59e0b' : '#ef4444';
  return (
    <div className="inline-flex flex-col items-center gap-1" role="img" aria-label={`${label ?? 'Score'}: ${Math.round(value)} out of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth="8" className="stroke-slate-200 dark:stroke-slate-700" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth="8"
          stroke={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * Math.max(0, Math.min(100, value))) / 100}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-slate-900 dark:fill-white" fontSize={size / 3.4} fontWeight="700">
          {Math.round(value)}
        </text>
      </svg>
      {label && <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: keyof typeof paths;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {icon && (
          <span className="rounded-lg bg-brand-50 p-2 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            <Icon name={icon} className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </>
  );
  return (
    <Card className="p-5">
      {onClick ? (
        <button onClick={onClick} className="block w-full text-left">
          {inner}
        </button>
      ) : (
        inner
      )}
    </Card>
  );
}

// ------------------------------------------------------------ page header --
export function PageHeader({
  title,
  description,
  actions,
  crumbs,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  crumbs?: { label: string; to?: string }[];
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1 text-xs text-slate-500 dark:text-slate-400">
            {crumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1.5">/</span>}
                <span className={i === crumbs.length - 1 ? 'font-medium text-slate-700 dark:text-slate-200' : ''}>{c.label}</span>
              </span>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        </div>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ----------------------------------------------------------------- modal --
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState('50% 50%');
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  // Anchor the spring to the trigger that opened the dialog.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const raf = requestAnimationFrame(() => {
      setOrigin(triggerOrigin(panelRef.current));
    });
    return () => cancelAnimationFrame(raf);
  }, [open ]);
  return (
    <AnimatePresence initial={false}>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dialog'}>
          <motion.button
            aria-label="Close dialog"
            className="absolute inset-0 bg-slate-900/50"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: reducedMotion ? fadeOnly : springSnappy }}
            exit={{ opacity: 0, transition: reducedMotion ? fadeOnly : springSnappy }}
          />
          <motion.div
            ref={panelRef}
            style={{ transformOrigin: origin }}
            className={cn('relative w-full rounded-xl bg-white shadow-pop dark:bg-slate-900', wide ? 'max-w-3xl' : 'max-w-lg')}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 14, filter: 'blur(8px)' }}
            animate={
              reducedMotion
                ? { opacity: 1, transition: fadeOnly }
                : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)', transition: springSnappy }
            }
            exit={
              reducedMotion
                ? { opacity: 0, transition: fadeOnly }
                : { opacity: 0, scale: 0.94, y: 14, filter: 'blur(8px)', transition: springSnappy }
            }
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
              <button onClick={onClose} className="hit-pad relative rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto scroll-thin px-5 py-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ----------------------------------------------------------------- drawer --
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Panel'}>
          <motion.button
            aria-label="Close panel"
            className="absolute inset-0 bg-slate-900/50"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: reducedMotion ? fadeOnly : springDefault }}
            exit={{ opacity: 0, transition: reducedMotion ? fadeOnly : springDefault }}
          />
          <motion.div
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-pop dark:bg-slate-900"
            initial={reducedMotion ? { opacity: 0 } : { x: '100%', opacity: 0.6 }}
            animate={reducedMotion ? { opacity: 1, transition: fadeOnly } : { x: '0%', opacity: 1, transition: springDefault }}
            exit={reducedMotion ? { opacity: 0, transition: fadeOnly } : { x: '100%', opacity: 0.6, transition: springDefault }}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
              <button onClick={onClose} className="hit-pad relative rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------ toast --
type ToastTone = 'success' | 'error' | 'info';
type ToastMsg = { id: number; title: string; desc?: string; tone: ToastTone };
const toastListeners = new Set<(t: ToastMsg) => void>();
let toastId = 0;

export function toast(title: string, opts?: { desc?: string; tone?: ToastTone }) {
  const msg: ToastMsg = { id: ++toastId, title, desc: opts?.desc, tone: opts?.tone ?? 'info' };
  toastListeners.forEach((l) => l(msg));
}

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const reducedMotion = usePrefersReducedMotion();
  const variants = surfaceVariants(reducedMotion);
  useEffect(() => {
    const add = (t: ToastMsg) => {
      setItems((prev) => [...prev.slice(-3), t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 4500);
    };
    toastListeners.add(add);
    return () => {
      toastListeners.delete(add);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            className={cn(
              'pointer-events-auto rounded-xl border p-4 shadow-pop',
              t.tone === 'success' && 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950',
              t.tone === 'error' && 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950',
              t.tone === 'info' && 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
            )}
            style={{ transformOrigin: '100% 100%' }}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={variants}
          >
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{t.title}</p>
            {t.desc && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{t.desc}</p>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------------ table --
export function TableShell({ children, ariaLabel }: { children: React.ReactNode; ariaLabel?: string }) {
  return (
    <div className="overflow-x-auto scroll-thin rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm" aria-label={ariaLabel}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn('border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400', className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('border-b border-slate-100 px-4 py-3 text-slate-700 last:border-0 dark:border-slate-800 dark:text-slate-200', className)}>{children}</td>;
}

// -------------------------------------------------------------- misc ----
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Delete',
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
    </Modal>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast('Copy failed', { tone: 'error' });
        }
      }}
    >
      <Icon name={done ? 'check' : 'copy'} className="h-4 w-4" />
      {done ? 'Copied' : label}
    </Button>
  );
}
