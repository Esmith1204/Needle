import { useState } from "react";
import { signInWithGoogle } from "../lib/api";
import { GoogleIcon } from "./Icons";

interface GoogleButtonProps {
  /** Where to land once signed in. */
  returnTo?: string;
  onError: (message: string) => void;
  className?: string;
}

/** "Continue with Google" and its "or" divider, above the email forms. */
export function GoogleButton({ returnTo, onError, className = "" }: GoogleButtonProps) {
  const [redirecting, setRedirecting] = useState(false);

  const onClick = async () => {
    setRedirecting(true);
    try {
      await signInWithGoogle(returnTo);
      // The browser is leaving for Google, so the button stays busy.
    } catch (err) {
      onError((err as Error).message);
      setRedirecting(false);
    }
  };

  return (
    <div className={className}>
      <button type="button" onClick={onClick} disabled={redirecting} className="btn btn-outline h-10 w-full">
        <GoogleIcon />
        {redirecting ? "Opening Google…" : "Continue with Google"}
      </button>
      <div className="mt-4 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or use email
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
