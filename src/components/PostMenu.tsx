import { useEffect, useRef, useState } from "react";
import { deleteRating } from "../lib/api";
import { enter, useGSAP } from "../lib/motion";
import { MoreIcon } from "./Icons";

interface PostMenuProps {
  postId: string;
  onEdit: () => void;
  onDeleted?: (id: string) => void;
}

/** The "…" menu on the viewer's own posts: edit or delete. */
export function PostMenu({ postId, onEdit, onDeleted }: PostMenuProps) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  useGSAP(
    () => {
      if (open) enter(popover.current, { y: -4, scale: 0.96, duration: 0.16, transformOrigin: "top right" });
    },
    { dependencies: [open] },
  );

  const onDelete = async () => {
    if (!window.confirm("Delete this review? Its likes, reposts, and comments go with it. This can't be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteRating(postId);
      setOpen(false);
      onDeleted?.(postId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div ref={menuRef} className="relative -my-1 -mr-1.5">
      <button
        type="button"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full p-1 text-muted transition-colors hover:bg-tint/5 hover:text-ink"
      >
        <MoreIcon size={18} />
      </button>
      {open && (
        <div
          ref={popover}
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-xl border border-rule bg-card py-1 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.7)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="w-full px-4 py-2 text-left text-sm font-semibold hover:bg-field"
          >
            Edit review
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onDelete}
            disabled={deleting}
            className="w-full px-4 py-2 text-left text-sm font-semibold text-danger hover:bg-field disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete review"}
          </button>
          {error && <p className="px-4 pb-2 text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
