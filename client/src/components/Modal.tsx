import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

interface ModalProps {
  open: boolean;
  title?: string;
  onClose?: () => void;
  dismissible?: boolean;
  className?: string;
  children: ReactNode;
}

export default function Modal({
  open,
  title,
  onClose,
  dismissible = true,
  className,
  children,
}: ModalProps) {
  const [mounted, setMounted] = useState(open);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (open) {
      setMounted(true);
    }
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const body = document.body;
    const html = document.documentElement;
    const previousOverflow = body.style.overflow;
    const previousPosition = body.style.position;
    const previousTop = body.style.top;
    const previousWidth = body.style.width;
    const previousHtmlOverflow = html.style.overflow;
    const scrollY = window.scrollY;

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    html.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousOverflow;
      body.style.position = previousPosition;
      body.style.top = previousTop;
      body.style.width = previousWidth;
      html.style.overflow = previousHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !dismissible) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mounted, dismissible, onClose]);

  if (!mounted) return null;

  const backdropInitial = reduceMotion ? { opacity: 1 } : { opacity: 0 };
  const backdropAnimate = { opacity: 1 };
  const backdropExit = reduceMotion ? { opacity: 1 } : { opacity: 0 };
  const panelInitial = reduceMotion ? { opacity: 1 } : { opacity: 0, y: 12, scale: 0.98 };
  const panelAnimate = { opacity: 1, y: 0, scale: 1 };
  const panelExit = reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.985 };
  const transition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <AnimatePresence initial={false} onExitComplete={() => setMounted(false)}>
      {open ? (
        <motion.div
          className="modal-backdrop"
          initial={backdropInitial}
          animate={backdropAnimate}
          exit={backdropExit}
          transition={transition}
          onClick={() => {
            if (dismissible) {
              onClose?.();
            }
          }}
        >
          <motion.div
            className={["modal", className].filter(Boolean).join(" ")}
            initial={panelInitial}
            animate={panelAnimate}
            exit={panelExit}
            transition={transition}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="modal-header">
              {title ? <h3>{title}</h3> : null}
              {dismissible ? (
                <button className="icon-button" onClick={onClose} aria-label="Close">
                  {"\u00D7"}
                </button>
              ) : null}
            </div>
            <div className="modal-body">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
