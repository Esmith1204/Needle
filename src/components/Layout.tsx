import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from "react-router";
import { useCurrentUser } from "../context/SessionContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { signOut } from "../lib/api";
import { enter, gsap, slide, useGSAP } from "../lib/motion";
import { Avatar } from "./Avatar";
import { DiscoverPanel } from "./DiscoverPanel";
import { CompassIcon, HomeIcon, LogOutIcon, PlusIcon, UserIcon } from "./Icons";
import { Wordmark } from "./Wordmark";

export function Layout() {
  const { pathname } = useLocation();
  const page = useRef<HTMLDivElement>(null);
  // Mounted only when it fits, so phones don't fetch data for a hidden column.
  const railFits = useMediaQuery("(min-width: 64rem)");

  useGSAP(() => enter(page.current, { y: 6, duration: 0.22 }), { dependencies: [pathname] });

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1200px] justify-center">
      <Sidebar />

      <main className="min-w-0 flex-1 bg-paper/50 pb-16 sm:max-w-[600px] sm:border-x sm:border-line sm:pb-0">
        <header className="flex h-12 items-center border-b border-line px-4 sm:hidden">
          <Link to="/" aria-label="Needle home">
            <Wordmark className="text-xl" />
          </Link>
        </header>
        <div ref={page}>
          <Outlet />
        </div>
      </main>

      {/* The Discover page already fills the center column, so the rail would repeat it. */}
      {railFits && pathname !== "/discover" && (
        <aside
          aria-label="Discover"
          className="sticky top-0 h-dvh w-[320px] shrink-0 overflow-y-auto px-5 py-3 [scrollbar-width:none]"
        >
          <DiscoverPanel compact />
        </aside>
      )}

      <BottomNav />
      <ScrollRestoration />
    </div>
  );
}

/** Left column: icons only on medium screens, icons with labels on wide ones. */
function Sidebar() {
  const user = useCurrentUser();
  const { pathname } = useLocation();
  const nav = useRef<HTMLElement>(null);
  const highlight = useRef<HTMLSpanElement>(null);
  const highlightShown = useRef(false);
  const [signingOut, setSigningOut] = useState(false);

  const placeHighlight = useCallback((animate: boolean) => {
    const active = nav.current?.querySelector<HTMLElement>('a[aria-current="page"]');
    // Nothing to mark on another person's profile, or when Discover's link is hidden.
    if (!active || active.offsetParent === null) {
      gsap.set(highlight.current, { autoAlpha: 0 });
      highlightShown.current = false;
      return;
    }
    slide(highlight.current, { y: active.offsetTop, autoAlpha: 1 }, animate && highlightShown.current);
    highlightShown.current = true;
  }, []);

  useGSAP(() => placeHighlight(true), { dependencies: [pathname] });

  useEffect(() => {
    const onResize = () => placeHighlight(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [placeHighlight]);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <aside className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col items-center px-3 py-3 sm:flex xl:w-[240px] xl:items-stretch">
      <Link to="/" aria-label="Needle home" className="mb-3 flex h-11 items-center justify-center xl:justify-start xl:px-3">
        <Wordmark className="hidden text-2xl xl:inline" />
        <img src="/favicon.svg" alt="" className="size-8 xl:hidden" />
      </Link>

      <nav ref={nav} aria-label="Primary" className="relative flex flex-col items-center gap-1 xl:items-stretch">
        <span
          ref={highlight}
          aria-hidden="true"
          className="invisible absolute inset-x-0 top-0 mx-auto h-11 w-11 rounded-full bg-white/[0.08] xl:w-full"
        />
        <SidebarLink to="/" end label="Home" Icon={HomeIcon} />
        {/* The Discover column takes over from this link once it fits on screen. */}
        <SidebarLink to="/discover" label="Discover" Icon={CompassIcon} className="lg:hidden" />
        <SidebarLink to={`/u/${user.handle}`} label="Profile" Icon={UserIcon} />
      </nav>

      <Link to="/rate" aria-label="Rate an album" className="btn btn-primary mt-4 size-11 p-0 xl:h-10 xl:w-full">
        <PlusIcon size={18} strokeWidth={2.4} />
        <span className="hidden xl:inline">Rate an album</span>
      </Link>

      <div className="mt-auto flex flex-col items-center gap-2 xl:flex-row xl:gap-2.5 xl:px-1">
        <Avatar profile={user} size={36} />
        <span className="hidden min-w-0 flex-1 text-sm leading-tight xl:block">
          <span className="block truncate font-bold">{user.displayName}</span>
          <span className="block truncate text-xs text-muted">@{user.handle}</span>
        </span>
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          aria-label="Sign out"
          title="Sign out"
          className="rounded-full p-2 text-muted transition-colors hover:bg-white/5 hover:text-ink disabled:opacity-60"
        >
          <LogOutIcon size={18} />
        </button>
      </div>
    </aside>
  );
}

interface SidebarLinkProps {
  to: string;
  end?: boolean;
  label: string;
  Icon: typeof HomeIcon;
  className?: string;
}

function SidebarLink({ to, end, label, Icon, className = "" }: SidebarLinkProps) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      className={({ isActive }) =>
        `relative flex h-11 w-11 items-center justify-center gap-3 rounded-full text-[15px] transition-colors xl:w-full xl:justify-start xl:px-3 ${
          isActive ? "font-extrabold text-white" : "font-semibold text-muted hover:bg-white/5 hover:text-ink"
        } ${className}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={21} strokeWidth={isActive ? 2.4 : 1.8} />
          <span className="hidden xl:inline">{label}</span>
        </>
      )}
    </NavLink>
  );
}

/** Replaces the sidebar on phones. */
function BottomNav() {
  const user = useCurrentUser();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 flex h-14 items-center justify-around border-t border-line bg-paper/90 backdrop-blur-md sm:hidden"
    >
      <BottomLink to="/" end label="Home" Icon={HomeIcon} />
      <BottomLink to="/discover" label="Discover" Icon={CompassIcon} />
      <Link to="/rate" aria-label="Rate an album" className="btn btn-primary size-10 p-0">
        <PlusIcon size={18} strokeWidth={2.4} />
      </Link>
      <BottomLink to={`/u/${user.handle}`} label="Profile" Icon={UserIcon} />
    </nav>
  );
}

function BottomLink({ to, end, label, Icon }: Omit<SidebarLinkProps, "className">) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      className={({ isActive }) => `grid size-11 place-items-center ${isActive ? "text-ink" : "text-muted"}`}
    >
      {({ isActive }) => <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} />}
    </NavLink>
  );
}
