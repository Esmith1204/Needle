import { Field } from "./FormField";

interface TwoFactorCodeFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  autoFocus?: boolean;
}

/** The six-digit code from an authenticator app. */
export function TwoFactorCodeField({ id, value, onChange, className, autoFocus }: TwoFactorCodeFieldProps) {
  return (
    <Field label="6-digit code" htmlFor={id} className={className}>
      {(describedBy) => (
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus={autoFocus}
          maxLength={6}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
          aria-describedby={describedBy}
          className="field tracking-[0.3em] tabular-nums"
        />
      )}
    </Field>
  );
}
