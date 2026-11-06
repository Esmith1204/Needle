import type { CropRect } from "../types";
import { cropGif } from "./gifCrop";

export const REVIEW_MAX_LENGTH = 150;
export const COMMENT_MAX_LENGTH = 280;
export const LIST_TITLE_MAX_LENGTH = 80;
export const LIST_DESCRIPTION_MAX_LENGTH = 300;
export const MIN_PASSWORD = 6;
/** The profiles table's limits (migration 002). */
export const DISPLAY_NAME_MAX_LENGTH = 50;
export const BIO_MAX_LENGTH = 160;
/** How many times a handle can change in any stretch of this many hours (migration 007). */
export const HANDLE_CHANGE_LIMIT = 2;
export const HANDLE_CHANGE_WINDOW_HOURS = 48;

/**
 * When the handle can next change, given its recent changes newest first, or null if it can now.
 * That's once the oldest change that still counts is two days old.
 */
export function nextHandleChangeAt(recentChanges: string[], now = Date.now()): Date | null {
  const windowMs = HANDLE_CHANGE_WINDOW_HOURS * 3_600_000;
  const counted = recentChanges.map((iso) => new Date(iso).getTime()).filter((at) => at > now - windowMs);
  if (counted.length < HANDLE_CHANGE_LIMIT) return null;
  return new Date(counted.sort((a, b) => b - a)[HANDLE_CHANGE_LIMIT - 1] + windowMs);
}

/** The largest file to start cropping. Cropping can bring it under the limit below. */
export const PROFILE_FILE_MAX_BYTES = 25 * 1024 * 1024;
/** The profile-media bucket's limit (migration 005). */
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

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

/** "3:42 PM · Nov 1, 2026", for a post's own page. */
export function fullTimestamp(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${time} · ${day}`;
}

export function isGifFile(file: File): boolean {
  return file.type === "image/gif";
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That file couldn't be read as an image."));
    };
    img.src = objectUrl;
  });
}

/** Phones sometimes never call back when they run short of memory for a canvas, so this stops waiting. */
const ENCODE_TIMEOUT_MS = 15_000;

/**
 * Prepares a profile picture or banner for upload: the chosen part of the image, as a JPEG
 * no wider than `maxWidth`. A GIF stays a GIF and keeps its size, so that it keeps its animation.
 * Pass `decoded` when the image is already loaded: a phone photo takes a lot of memory to decode again.
 */
export async function cropImageFile(file: File, crop: CropRect, maxWidth: number, decoded?: HTMLImageElement): Promise<Blob> {
  if (isGifFile(file)) {
    const cropped = await cropGif(new Uint8Array(await file.arrayBuffer()), crop);
    if (cropped.length > PROFILE_IMAGE_MAX_BYTES) {
      throw new Error("This GIF is still over 5 MB after cropping. Zoom in further or choose a smaller one.");
    }
    return new Blob([cropped], { type: "image/gif" });
  }
  const img = decoded?.complete && decoded.naturalWidth > 0 ? decoded : await loadImage(file);
  const canvas = document.createElement("canvas");
  // Never enlarge a small image.
  canvas.width = Math.min(maxWidth, crop.width);
  canvas.height = Math.max(1, Math.round((crop.height * canvas.width) / crop.width));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser couldn't prepare the image. Try a smaller one.");
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("That image took too long to prepare. Try a smaller one.")), ENCODE_TIMEOUT_MS);
      canvas.toBlob(
        (blob) => {
          clearTimeout(timer);
          if (blob) resolve(blob);
          else reject(new Error("That image couldn't be processed."));
        },
        "image/jpeg",
        0.85,
      );
    });
  } finally {
    // Mobile Safari holds a canvas's memory until it's shrunk, and only has so much for all of them.
    canvas.width = canvas.height = 0;
  }
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
