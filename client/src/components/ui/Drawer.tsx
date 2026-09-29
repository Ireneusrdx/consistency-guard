/**
 * Drawer — slide-over panel with a spring, dimming scrim included.
 *
 * Slides in from its anchored side along one axis and dismisses along the
 * SAME path (mirrored easing via the shared critically-damped spring).
 * prefers-reduced-motion collapses to a short opacity cross-fade.
 */
import { useEffect } from 'react';
import type * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { fadeOnly, springDefault, usePrefersReducedMotion } from '../../lib/motion';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  side?: 'left' | 'right';
}

export function Drawer({ open, onClose, title, children, side = 'right' }: DrawerProps) {
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const offscreen = side === 'left' ? { x: '-100%' } : { x: '100%' };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: reducedMotion ? fadeOnly : springDefault }}
            exit={{ opacity: 0, transition: reducedMotion ? fadeOnly : springDefault }}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn(
              'absolute inset-y-0 flex w-80 max-w-full flex-col bg-white shadow-xl dark:bg-stone-900',
              side === 'left' ? 'left-0' : 'right-0',
            )}
            initial={reducedMotion ? { opacity: 0 } : { ...offscreen, opacity: 0.5 }}
            animate={
              reducedMotion
                ? { opacity: 1, transition: fadeOnly }
                : { x: '0%', opacity: 1, transition: springDefault }
            }
            exit={
              reducedMotion
                ? { opacity: 0, transition: fadeOnly }
                : { ...offscreen, opacity: 0.5, transition: springDefault }
            }
          >
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4 dark:border-stone-800">
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="cg-press hit-pad relative rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M6 6l8 8M14 6l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
