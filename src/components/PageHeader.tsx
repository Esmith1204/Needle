/** The sticky title bar at the top of the center column. */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/80 px-4 py-2 backdrop-blur-md">
      <h1 className="truncate text-lg font-extrabold leading-snug">{title}</h1>
      {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
    </header>
  );
}
