import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { surfaceVariants, usePrefersReducedMotion } from '../../lib/motion';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  msg: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (msg: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

const toneStyles: Record<ToastTone, string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900',
};

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const reducedMotion = usePrefersReducedMotion();
  const variants = surfaceVariants(reducedMotion);
  return (
    <motion.div
      role={item.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm shadow-lg',
        toneStyles[item.tone],
      )}
      style={{ transformOrigin: '100% 100%' }}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
    >
      <span>{item.msg}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="cg-press hit-pad relative rounded-md p-0.5 opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M4.5 4.5l7 7M11.5 4.5l-7 7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (msg: string, tone: ToastTone = 'info') => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, msg, tone }]);
      window.setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        <AnimatePresence initial={false}>
          {toasts.map((item) => (
            <Toast key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
