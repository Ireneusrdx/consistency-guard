/**
 * Motion system — Apple-style fluid interfaces translated for the web.
 *
 * Principles (from the apple-design skill):
 * - Default: critically damped springs (damping 1.0, zero overshoot), response ~0.35s.
 * - Momentum variant (damping ~0.8) is reserved ONLY for flick/drag-release gestures.
 * - Every spring animates from the live presentation value, so grabs mid-flight
 *   never jump; input is never locked during a transition.
 * - Enter and exit travel the SAME path with mirrored easing.
 * - prefers-reduced-motion replaces springs/slides with short opacity cross-fades.
 */
import { useEffect, useState } from 'react';
import type { Transition } from 'motion/react';

/** Critically damped default — graceful, non-distracting, zero overshoot. */
export const springDefault: Transition = {
  type: 'spring',
  bounce: 0,
  duration: 0.35,
};

/** Slightly quicker variant for small surfaces (menus, popovers, toasts). */
export const springSnappy: Transition = {
  type: 'spring',
  bounce: 0,
  duration: 0.28,
};

/**
 * Momentum variant — damping ~0.8, a whisper of bounce.
 * ONLY for interactions where a flick/drag-release carried momentum
 * (sheet dismissals, drag releases). Never for plain fades/appears.
 */
export const springMomentum: Transition = {
  type: 'spring',
  bounce: 0.2,
  duration: 0.35,
};

/** Route/page transition — quick, interruptible, mirrored enter/exit path. */
export const springPage: Transition = {
  type: 'spring',
  bounce: 0,
  duration: 0.3,
};

/** Reduced-motion equivalent: short opacity cross-fade, no overshoot, no slide. */
export const fadeOnly: Transition = {
  type: 'tween',
  duration: 0.18,
  ease: 'easeOut',
};

/**
 * React to the OS reduced-motion signal. Components read this to swap
 * spring/slide variants for short opacity cross-fades.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Trigger-anchored transform origin.
 *
 * A popover/menu/sheet should originate from the element that triggered it.
 * Capture the trigger's center at open time (usually document.activeElement,
 * the button the user just pressed) and express it as a CSS transform-origin
 * relative to the floating surface's own box.
 */
export function triggerOrigin(
  surface: HTMLElement | null,
  trigger: HTMLElement | null = null,
): string {
  const el = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  if (!surface || !el) return '50% 50%';
  const s = surface.getBoundingClientRect();
  const t = el.getBoundingClientRect();
  if (s.width === 0 || s.height === 0) return '50% 50%';
  const x = ((t.left + t.width / 2 - s.left) / s.width) * 100;
  const y = ((t.top + t.height / 2 - s.top) / s.height) * 100;
  return `${Math.min(100, Math.max(0, x)).toFixed(1)}% ${Math.min(100, Math.max(0, y)).toFixed(1)}%`;
}

/**
 * Shared enter/exit variants for floating surfaces (menus, popovers, toasts,
 * modal panels). Materialize: blur radius + scale + opacity move together on
 * enter and reverse along the SAME path on exit. With reduced motion this
 * collapses to an opacity cross-fade.
 */
export function surfaceVariants(reducedMotion: boolean) {
  if (reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: fadeOnly },
      exit: { opacity: 0, transition: fadeOnly },
    };
  }
  return {
    initial: { opacity: 0, scale: 0.96, y: 6, filter: 'blur(6px)' },
    animate: {
      opacity: 1,
      scale: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: springSnappy,
    },
    exit: {
      opacity: 0,
      scale: 0.96,
      y: 6,
      filter: 'blur(6px)',
      transition: springSnappy,
    },
  };
}

/** Page-level enter/exit along the same vertical path, mirrored easing. */
export function pageVariants(reducedMotion: boolean) {
  if (reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: fadeOnly },
      exit: { opacity: 0, transition: fadeOnly },
    };
  }
  return {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: springPage },
    exit: { opacity: 0, y: 10, transition: springPage },
  };
}
