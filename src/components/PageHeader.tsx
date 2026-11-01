import { useLocation, useNavigate } from "react-router";
import { ArrowLeftIcon } from "./Icons";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Adds a back button, which goes here when this page was opened directly, e.g. from a shared link. */
  backTo?: string;
}

/** The sticky title bar at the top of the center column. */
export function PageHeader({ title, subtitle, backTo }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-paper/80 px-4 py-2 backdrop-blur-md">
      {backTo && <BackButton fallback={backTo} />}
      <div className="min-w-0">
        <h1 className="truncate text-lg font-extrabold leading-snug">{title}</h1>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
    </header>
  );
}

function BackButton({ fallback }: { fallback: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => (location.key === "default" ? navigate(fallback) : navigate(-1))}
      className="-ml-1.5 shrink-0 rounded-full p-1.5 transition-colors hover:bg-tint/5"
    >
      <ArrowLeftIcon size={20} />
    </button>
  );
}
