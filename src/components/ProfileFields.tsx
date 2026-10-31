import type { HandleStatus } from "../hooks/useHandleCheck";
import { Field } from "./FormField";

// Name + handle inputs shared by sign-up and profile setup.

interface InputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  className?: string;
}

export function ProfileNameInput({ value, onChange, error, className }: InputProps) {
  return (
    <Field label="Name" htmlFor="display-name" error={error} className={className}>
      {(describedBy) => (
        <input
          id="display-name"
          type="text"
          autoComplete="name"
          maxLength={50}
          placeholder="Ex.  Elijah Smith"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          className="field"
        />
      )}
    </Field>
  );
}

export function HandleInput({
  value,
  onChange,
  check,
  error,
  className,
}: InputProps & { check: { status: HandleStatus; message: string | null } }) {
  // Live feedback while typing; the submit-time error takes over once they try to continue.
  const hint =
    check.status === "available" ? (
      <span className="text-ink">✓ {check.message}</span>
    ) : check.status === "empty" ? (
      "Your profile lives at /u/handle."
    ) : (
      check.message
    );
  const liveError = check.status === "taken" || check.status === "invalid" ? check.message : null;

  return (
    <Field label="Handle" htmlFor="handle" error={error ?? liveError} hint={hint} className={className}>
      {(describedBy) => (
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">@</span>
          <input
            id="handle"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            placeholder="swrd.fsh"
            value={value}
            onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, ""))}
            aria-invalid={Boolean(error ?? liveError) || undefined}
            aria-describedby={describedBy}
            className="field pl-7"
          />
        </div>
      )}
    </Field>
  );
}
