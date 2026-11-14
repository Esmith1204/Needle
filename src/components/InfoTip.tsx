import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { InfoIcon } from "./Icons";

interface InfoTipProps {
  /** Accessible name of the (i) button, e.g. "What is Compare?". */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * A small (i) button that explains something nearby. Opens on hover, focus, or tap,
 * and closes on Escape, blur, or a tap elsewhere. Screen readers get the text as the
 * button's description even while it's hidden.
 */
export function InfoTip({ label, children, className = "" }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span
      ref={root}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        // Opens rather than toggles: a tap also focuses the button, and toggling would close it again.
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`grid size-9 place-items-center rounded-full transition-colors hover:bg-tint/5 hover:text-ink ${
          open ? "text-ink" : "text-muted"
        }`}
      >
        <InfoIcon size={19} />
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute right-0 top-full z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-rule bg-card p-3 text-sm leading-relaxed text-ink shadow-xl ${
          open ? "block" : "hidden"
        }`}
      >
        {children}
      </span>
    </span>
  );
}
