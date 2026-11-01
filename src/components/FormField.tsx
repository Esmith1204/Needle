import { useId, type ReactNode } from "react";

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string | null;
  hint?: ReactNode;
  className?: string;
  /** Receives the id to pass to the control's aria-describedby. */
  children: (describedBy: string | undefined) => ReactNode;
}

/** Label + control + error/hint, styled like the mockup's form. */
export function Field({ label, htmlFor, error, hint, className = "", children }: FieldProps) {
  const messageId = useId();
  const message = error ?? hint;
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[0.8125rem] font-bold">
        {label}
      </label>
      {children(message ? messageId : undefined)}
      {message && (
        <p id={messageId} className={`mt-1.5 text-xs ${error ? "text-danger" : "text-muted"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
