/**
 * PageTransition — interruptible route transitions.
 *
 * Enter and exit travel the SAME path (opacity + a short vertical rise) with
 * mirrored spring easing. The exiting page is lifted out of flow so the
 * entering page lays out in place instead of below it. Springs animate from
 * the live presentation value, so a navigation started mid-transition never
 * jumps and input is never locked. With prefers-reduced-motion this collapses
 * to a short opacity cross-fade.
 *
 * The parent of <PageTransition> must be `position: relative`.
 */
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { fadeOnly, springPage, usePrefersReducedMotion } from '../lib/motion';

export function PageTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={routeKey}
        className="min-w-0"
        style={{ width: '100%' }}
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={
          reducedMotion
            ? { opacity: 0 }
            : {
                opacity: 0,
                y: 10,
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
              }
        }
        transition={reducedMotion ? fadeOnly : springPage}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
