import { useRef, type RefObject } from "react";
import { enter, useGSAP } from "../lib/motion";

const MAX_STAGGERED = 8;

/**
 * Staggers in items marked `data-enter-id` the first time each id appears, so a
 * realtime refresh animates only the new post rather than the whole list.
 */
export function useEnterList(container: RefObject<HTMLElement | null>, ids: string[]) {
  const seen = useRef(new Set<string>());

  useGSAP(
    () => {
      const fresh = ids.filter((id) => !seen.current.has(id));
      fresh.forEach((id) => seen.current.add(id));
      const items = fresh
        .slice(0, MAX_STAGGERED)
        .flatMap((id) => container.current?.querySelector(`[data-enter-id="${id}"]`) ?? []);
      if (items.length > 0) enter(items, { stagger: 0.04 });
      // Runs on (StrictMode) unmount, so a remount animates the same items again.
      return () => fresh.forEach((id) => seen.current.delete(id));
    },
    { dependencies: [ids.join(",")], scope: container },
  );
}
