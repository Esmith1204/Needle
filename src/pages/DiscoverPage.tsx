import { DiscoverPanel } from "../components/DiscoverPanel";
import { PageHeader } from "../components/PageHeader";

/** /discover — the full Discover lists, and the way in on screens too narrow for the right column. */
export function DiscoverPage() {
  return (
    <>
      <PageHeader title="Discover" />
      <div className="p-4">
        <DiscoverPanel />
      </div>
    </>
  );
}
