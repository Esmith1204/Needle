import { useEffect, useRef, type CSSProperties } from "react";
import { reducedMotion } from "../lib/motion";

interface ProfileImageProps {
  src: string;
  /** Whether it's a GIF, for a link that doesn't say so, like a file being cropped. */
  animated?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** A profile picture or banner. GIFs hold still on their first frame for people who ask for reduced motion. */
export function ProfileImage({ src, animated = /\.gif(\?|$)/i.test(src), className, style }: ProfileImageProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const still = animated && reducedMotion();

  useEffect(() => {
    if (!still) return;
    const img = new Image();
    img.onload = () => {
      if (!canvas.current) return;
      canvas.current.width = img.naturalWidth;
      canvas.current.height = img.naturalHeight;
      canvas.current.getContext("2d")?.drawImage(img, 0, 0);
    };
    img.src = src;
  }, [src, still]);

  return still ? (
    <canvas ref={canvas} aria-hidden="true" style={style} className={className} />
  ) : (
    <img src={src} alt="" style={style} className={className} />
  );
}
