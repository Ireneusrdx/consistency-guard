/**
 * Command palette (Cmd+K / Ctrl+K): keyboard-first navigation and quick
 * actions. Calm, minimal overlay in the muse.ai spirit — one search field,
 * one list, no chrome noise.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

interface Command {
  id: string;
  label: string;
  hint?: string;
  keywords: string;
  run: () => void;
}

function baseCommands(navigate: (to: string) => void, onToggleTheme: () => void): Command[] {
  const go = (to: string) => () => navigate(to);
  return [
    { id: 'dashboard', label: 'Go to Dashboard', hint: 'Overview', keywords: 'dashboard home overview', run: go('/dashboard') },
    { id: 'evaluate', label: 'New evaluation', hint: 'Evaluate', keywords: 'evaluate new evaluation run test models', run: go('/evaluate/models') },
    { id: 'compare', label: 'Compare models', hint: 'Evaluate', keywords: 'compare models side by side', run: go('/compare') },
    { id: 'prompt-lab', label: 'Open Prompt Lab', hint: 'Workspace', keywords: 'prompt lab question workspace ask', run: go('/evaluate/question') },
    { id: 'prompt-intel', label: 'Prompt Intelligence', hint: 'Analyze', keywords: 'prompt intelligence analyze improve', run: go('/prompt-intelligence') },
    { id: 'adversarial', label: 'Adversarial testing', hint: 'Analyze', keywords: 'adversarial attack robustness jailbreak', run: go('/adversarial') },
    { id: 'benchmarks', label: 'Benchmarks', hint: 'Data', keywords: 'benchmarks datasets ground truth', run: go('/benchmarks') },
    { id: 'history', label: 'Evaluation history', hint: 'Data', keywords: 'history past runs', run: go('/history') },
    { id: 'reports', label: 'Reports', hint: 'Data', keywords: 'reports export share', run: go('/reports') },
    { id: 'providers', label: 'Provider setup', hint: 'Workspace', keywords: 'providers api keys setup openai anthropic', run: go('/setup/providers') },
    { id: 'settings', label: 'Settings', hint: 'Workspace', keywords: 'settings preferences profile', run: go('/settings') },
    { id: 'toggle-theme', label: 'Toggle light / dark theme', hint: 'Action', keywords: 'theme dark light mode appearance', run: onToggleTheme },
  ];
}

export default function CommandPalette({
  open,
  onClose,
  onToggleTheme,
}: {
  open: boolean;
  onClose: () => void;
  onToggleTheme: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo(() => baseCommands(navigate, onToggleTheme), [navigate, onToggleTheme]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.keywords}`.toLowerCase().includes(q));
  }, [commands, query]);

  // Reset state whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus after paint so the opening transition isn't interrupted.
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open ]);

  useEffect(() => setActive(0), [query]);

  // Keep the active option visible.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const choose = (cmd: Command) => {
    onClose();
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = results[active];
      if (cmd) choose(cmd);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[18vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        aria-label="Close command palette"
        className="absolute inset-0 cursor-default bg-stone-950/40 backdrop-blur-[2px] motion-reduce:transition-none"
        onClick={onClose}
      />
      <div className="material-chrome relative w-full max-w-lg overflow-hidden rounded-2xl shadow-pop motion-reduce:transition-none">
        <div className="flex items-center gap-3 border-b border-stone-200/70 px-4 dark:border-stone-700/60">
          <svg
            className="h-4 w-4 shrink-0 text-stone-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command or search pages…"
            aria-label="Search commands and pages"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            className="w-full bg-transparent py-4 text-[15px] text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-stone-100 dark:placeholder:text-stone-500"
          />
          <kbd className="hidden shrink-0 rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[11px] font-medium text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-500 sm:block">
            esc
          </kbd>
        </div>

        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Commands"
          className="max-h-[38vh] overflow-y-auto p-2"
        >
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-stone-500 dark:text-stone-400">
              No matches for “{query}”.
            </p>
          ) : (
            results.map((cmd, i) => (
              <button
                key={cmd.id}
                id={`cmd-${cmd.id}`}
                role="option"
                aria-selected={i === active}
                data-active={i === active}
                onClick={() => choose(cmd)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm',
                  i === active
                    ? 'bg-brand-50 text-stone-900 dark:bg-brand-950/60 dark:text-stone-100'
                    : 'text-stone-600 dark:text-stone-300',
                )}
              >
                <span className="truncate font-medium">{cmd.label}</span>
                {cmd.hint && (
                  <span className="shrink-0 text-xs text-stone-400 dark:text-stone-500">{cmd.hint}</span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="hidden items-center gap-4 border-t border-stone-200/70 px-4 py-2.5 text-[11px] text-stone-400 dark:border-stone-700/60 dark:text-stone-500 sm:flex">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-stone-200 bg-stone-50 px-1 dark:border-stone-700 dark:bg-stone-800">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-stone-200 bg-stone-50 px-1 dark:border-stone-700 dark:bg-stone-800">↵</kbd>
            select
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-stone-200 bg-stone-50 px-1 dark:border-stone-700 dark:bg-stone-800">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
