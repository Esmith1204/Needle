export const REVIEW_MAX_LENGTH = 150;
export const MIN_PASSWORD = 6;

/** "0" through "10", with at most one decimal place: 7, 7.5, 10.0 — not 7.55 or 10.5. */
const RATING_PATTERN = /^(?:10(?:\.0)?|\d(?:\.\d)?)$/;

/** Characters the rating field accepts while the user is still typing. */
export const RATING_PARTIAL_PATTERN = /^\d{0,2}(?:\.\d?)?$/;

export function parseRating(input: string): number | null {
  const value = input.trim();
  return RATING_PATTERN.test(value) ? Number(value) : null;
}

export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Downscale an uploaded image to a square JPEG data URL suitable for a cover. */
export function fileToCoverDataUrl(file: File, size = 600): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = Math.min(size, side);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Canvas not supported"));
        return;
      }
      // Center-crop to a square.
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That file couldn't be read as an image."));
    };
    img.src = objectUrl;
  });
}

/** Lowercase letters, numbers, dots and underscores; 3–20 characters (matches the DB check). */
export const HANDLE_PATTERN = /^[a-z0-9_.]{3,20}$/;

export function handleError(handle: string): string | null {
  if (!handle) return "Pick a handle.";
  if (handle.length < 3) return "Handles need at least 3 characters.";
  if (handle.length > 20) return "Handles can be at most 20 characters.";
  if (!HANDLE_PATTERN.test(handle)) return "Use lowercase letters, numbers, dots, or underscores.";
  return null;
}
