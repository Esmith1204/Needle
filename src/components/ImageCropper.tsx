import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { isGifFile } from "../lib/format";
import type { CropRect, ProfileImageKind } from "../types";
import { ProfileImage } from "./ProfileImage";

const ASPECT_RATIO: Record<ProfileImageKind, number> = { avatar: 1, banner: 3 };
const MAX_ZOOM = 4;
const ZOOM_KEY_STEP = 0.1;
/** How far an arrow key moves the image, as a share of what's in view. */
const MOVE_KEY_STEP = 0.05;

interface LoadedImage {
  url: string;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** What's in view, in the image's own pixels. Zoom 1 is the largest crop that fits. */
function visibleArea(image: LoadedImage, aspect: number, zoom: number, center: Point) {
  const width = Math.min(image.width, image.height * aspect) / zoom;
  const height = width / aspect;
  return {
    x: clamp(center.x - width / 2, 0, image.width - width),
    y: clamp(center.y - height / 2, 0, image.height - height),
    width,
    height,
  };
}

interface ImageCropperProps {
  file: File;
  kind: ProfileImageKind;
  busy: boolean;
  onCancel: () => void;
  /** Called only when the user confirms. Nothing is uploaded or saved before this. */
  onConfirm: (crop: CropRect) => void;
  onUnreadable: () => void;
}

/** Drag to reposition and slide to zoom, with the frame showing exactly what will be kept. */
export function ImageCropper({ file, kind, busy, onCancel, onConfirm, onUnreadable }: ImageCropperProps) {
  const aspect = ASPECT_RATIO[kind];
  const isGif = isGifFile(file);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<Point>({ x: 0, y: 0 });
  const frame = useRef<HTMLDivElement>(null);
  const lastPointer = useRef<Point | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const loader = new Image();
    let cancelled = false;
    loader.onload = () => {
      if (cancelled) return;
      setImage({ url, width: loader.naturalWidth, height: loader.naturalHeight });
      setCenter({ x: loader.naturalWidth / 2, y: loader.naturalHeight / 2 });
      setZoom(1);
    };
    loader.onerror = () => {
      if (!cancelled) onUnreadable();
    };
    loader.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const loaded = image !== null;
  useEffect(() => {
    if (loaded) frame.current?.focus();
  }, [loaded]);

  const area = image && visibleArea(image, aspect, zoom, center);

  /** Moves the view by an amount in the image's own pixels, stopping at its edges. */
  const moveBy = (dx: number, dy: number) => {
    if (!image || !area) return;
    const next = visibleArea(image, aspect, zoom, {
      x: area.x + area.width / 2 + dx,
      y: area.y + area.height / 2 + dy,
    });
    setCenter({ x: next.x + next.width / 2, y: next.y + next.height / 2 });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastPointer.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!lastPointer.current || !area) return;
    const imagePixelsPerScreenPixel = area.width / e.currentTarget.clientWidth;
    moveBy(
      (lastPointer.current.x - e.clientX) * imagePixelsPerScreenPixel,
      (lastPointer.current.y - e.clientY) * imagePixelsPerScreenPixel,
    );
    lastPointer.current = { x: e.clientX, y: e.clientY };
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!area) return;
    const step = area.width * MOVE_KEY_STEP;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => moveBy(-step, 0),
      ArrowRight: () => moveBy(step, 0),
      ArrowUp: () => moveBy(0, -step),
      ArrowDown: () => moveBy(0, step),
      "+": () => setZoom((z) => clamp(z + ZOOM_KEY_STEP, 1, MAX_ZOOM)),
      "=": () => setZoom((z) => clamp(z + ZOOM_KEY_STEP, 1, MAX_ZOOM)),
      "-": () => setZoom((z) => clamp(z - ZOOM_KEY_STEP, 1, MAX_ZOOM)),
    };
    const action = actions[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  };

  const confirm = () => {
    if (!image || !area) return;
    const x = Math.round(area.x);
    const y = Math.round(area.y);
    onConfirm({
      x,
      y,
      width: clamp(Math.round(area.width), 1, image.width - x),
      height: clamp(Math.round(area.height), 1, image.height - y),
    });
  };

  const label = kind === "avatar" ? "picture" : "banner";

  return (
    <div className="p-4">
      <div className={kind === "avatar" ? "mx-auto max-w-80" : ""}>
        <div
          ref={frame}
          role="application"
          tabIndex={0}
          aria-label={`Crop your ${label}. Drag or use the arrow keys to move it, and the plus and minus keys to zoom.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (lastPointer.current = null)}
          onPointerCancel={() => (lastPointer.current = null)}
          onKeyDown={onKeyDown}
          style={{ aspectRatio: aspect }}
          className="relative cursor-grab touch-none select-none overflow-hidden rounded-xl bg-placeholder active:cursor-grabbing"
        >
          {image && area && (
            <ProfileImage
              src={image.url}
              animated={isGif}
              style={{
                width: `${(image.width / area.width) * 100}%`,
                height: `${(image.height / area.height) * 100}%`,
                left: `${(-area.x / area.width) * 100}%`,
                top: `${(-area.y / area.height) * 100}%`,
              }}
              className="pointer-events-none absolute max-w-none"
            />
          )}
          {/* Pictures show as circles, so the corners won't be seen. */}
          {kind === "avatar" && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_100vmax_rgb(0_0_0/0.55)]" />
          )}
        </div>
      </div>

      <label className="mt-3 flex items-center gap-3 text-xs font-bold">
        Zoom
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          disabled={!image}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="min-w-0 flex-1 accent-accent"
        />
      </label>

      <p className="mt-2 text-xs text-muted">
        Drag to choose what shows. {isGif && "Your GIF keeps its animation. "}
        Nothing changes on your profile until you save.
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="btn btn-outline">
          Cancel
        </button>
        <button type="button" onClick={confirm} disabled={busy || !image} className="btn btn-primary">
          {busy ? "Saving…" : `Save ${label}`}
        </button>
      </div>
    </div>
  );
}
