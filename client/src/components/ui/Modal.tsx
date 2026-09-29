/**
 * Modal — dimming scrim + spring-materialized panel.
 *
 * The panel springs from a trigger-anchored transform-origin (the control
 * that opened it), materializing with blur radius + scale + position moving
 * together — not a plain opacity fade. Exit travels the SAME path in reverse.
 * prefers-reduced-motion collapses to a short opacity cross-fade.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { fadeOnly, springSnappy, triggerOrigin, usePrefersReducedMotion } from '../../lib/motion';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}

export function Modal({ open, onClose, title, children, footer, wide = false }: ModalProps) {
  const reducedMotion = usePrefersReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState('50% 50%');

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

  // Anchor the spring to the trigger that opened the dialog.
  useLayoutEffect(() => {
    if (open) {
      // Defer one frame so the panel has laid out before measuring.
      const raf = requestAnimationFrame(() => {
        setOrigin(triggerOrigin(panelRef.current));
      });
      return () => cancelAnimationFrame(raf);
    }
    return undefined;
  }, [open ]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: reducedMotion ? fadeOnly : springSnappy }}
            exit={{ opacity: 0, transition: reducedMotion ? fadeOnly : springSnappy }}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            style={{ transformOrigin: origin }}
            className={cn(
              'relative flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-xl bg-white shadow-xl',
              'dark:bg-stone-900',
              wide ? 'max-w-3xl' : 'max-w-lg',
            )}
            initial={
              reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.94, y: 14, filter: 'blur(8px)' }
            }
            animate={
              reducedMotion
                ? { opacity: 1, transition: fadeOnly }
                : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)', transition: springSnappy }
            }
            exit={
              reducedMotion
                ? { opacity: 0, transition: fadeOnly }
                : {
                    opacity: 0,
                    scale: 0.94,
                    y: 14,
                    filter: 'blur(8px)',
                    transition: springSnappy,
                  }
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
            <div className="overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="border-t border-stone-200 px-5 py-4 dark:border-stone-800">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
