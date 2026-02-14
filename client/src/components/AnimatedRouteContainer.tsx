import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";

interface AnimatedRouteContainerProps {
  children: ReactNode;
}

export default function AnimatedRouteContainer({ children }: AnimatedRouteContainerProps) {
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  const initial = reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10, scale: 0.995 };
  const animate = { opacity: 1, y: 0, scale: 1 };
  const exit = reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6, scale: 0.998 };
  const transition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        className="route-stage"
        initial={initial}
        animate={animate}
        exit={exit}
        transition={transition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
