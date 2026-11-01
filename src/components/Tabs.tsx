import { useRef } from "react";
import { slide, useGSAP } from "../lib/motion";

interface TabsProps<T extends string> {
  label: string;
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** Equal-width tabs with an underline that slides to the selected one. */
export function Tabs<T extends string>({ label, tabs, value, onChange }: TabsProps<T>) {
  const underline = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  const index = tabs.findIndex((tab) => tab.value === value);

  useGSAP(
    () => {
      slide(underline.current, { xPercent: index * 100 }, placed.current);
      placed.current = true;
    },
    { dependencies: [index] },
  );

  return (
    <div role="tablist" aria-label={label} className="relative flex border-b border-line">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={`h-11 flex-1 text-sm font-bold transition-colors hover:bg-tint/[0.03] ${
            value === tab.value ? "text-ink" : "text-muted hover:text-ink"
          }`}
        >
          {tab.label}
        </button>
      ))}
      <span
        ref={underline}
        aria-hidden="true"
        style={{ width: `${100 / tabs.length}%` }}
        className="pointer-events-none absolute -bottom-px left-0 h-[3px] rounded-full bg-brand-light"
      />
    </div>
  );
}
