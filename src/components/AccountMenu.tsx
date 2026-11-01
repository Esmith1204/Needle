import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { useCurrentUser } from "../context/SessionContext";
import { signOut } from "../lib/api";
import { enter, useGSAP } from "../lib/motion";
import { Avatar } from "./Avatar";
import { AccessibilityIcon, LockIcon, LogOutIcon, SettingsIcon, ShieldIcon } from "./Icons";

const ITEM_CLASS =
  "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-field focus-visible:bg-field focus-visible:outline-none disabled:opacity-60";

interface AccountMenuProps {
  /** Which way the menu opens from the avatar. */
  placement: "above" | "below";
  /** Show the name and handle beside the avatar on wide screens. */
  showIdentity?: boolean;
}

/** The dropdown behind the profile picture: accessibility, settings, security, privacy, and sign out. */
export function AccountMenu({ placement, showIdentity }: AccountMenuProps) {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useGSAP(
    () => {
      if (!open) return;
      popover.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
      enter(popover.current, {
        y: placement === "above" ? 4 : -4,
        scale: 0.96,
        duration: 0.16,
        transformOrigin: placement === "above" ? "bottom left" : "top right",
      });
    },
    { dependencies: [open] },
  );

  const onMenuKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    const items = [...(popover.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "ArrowDown"
        ? (current + 1) % items.length
        : e.key === "ArrowUp"
          ? (current - 1 + items.length) % items.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    items[next].focus();
  };

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-full p-1 text-left transition-colors hover:bg-tint/5"
      >
        <Avatar profile={user} size={36} />
        {showIdentity && (
          <span className="hidden min-w-0 flex-1 pr-2 text-sm leading-tight xl:block">
            <span className="block truncate font-bold">{user.displayName}</span>
            <span className="block truncate text-xs text-muted">@{user.handle}</span>
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popover}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className={`absolute z-30 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-rule bg-card py-1 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.7)] ${
            placement === "above" ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2"
          }`}
        >
          <Link to="/settings/accessibility" role="menuitem" onClick={() => setOpen(false)} className={ITEM_CLASS}>
            <AccessibilityIcon size={18} className="shrink-0 text-muted" />
            Accessibility options
          </Link>
          <Link to="/settings" role="menuitem" onClick={() => setOpen(false)} className={ITEM_CLASS}>
            <SettingsIcon size={18} className="shrink-0 text-muted" />
            Settings
          </Link>
          <Link to="/settings/security" role="menuitem" onClick={() => setOpen(false)} className={ITEM_CLASS}>
            <ShieldIcon size={18} className="shrink-0 text-muted" />
            Security
          </Link>
          <Link to="/settings/privacy" role="menuitem" onClick={() => setOpen(false)} className={ITEM_CLASS}>
            <LockIcon size={18} className="shrink-0 text-muted" />
            Privacy
          </Link>
          <div role="separator" className="my-1 border-t border-line" />
          <button type="button" role="menuitem" onClick={onSignOut} disabled={signingOut} className={ITEM_CLASS}>
            <LogOutIcon size={18} className="shrink-0 text-muted" />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
