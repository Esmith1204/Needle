import { useRef } from "react";
import { gsap, reducedMotion, useGSAP } from "../lib/motion";

/** A record and tonearm for the sign-in pages; the rings settle in and the needle swings onto the record. */
export function RecordRings({ className = "" }: { className?: string }) {
  const root = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      if (reducedMotion()) return;
      gsap
        .timeline({ defaults: { ease: "power2.out" } })
        .from("[data-ring]", { autoAlpha: 0, scale: 0.9, transformOrigin: "50% 50%", duration: 0.5, stagger: 0.08 })
        .from("[data-tonearm]", { rotation: -32, svgOrigin: "570 30", duration: 0.9, ease: "power2.inOut" }, 0.15);
    },
    { scope: root },
  );

  return (
    <svg ref={root} viewBox="0 0 600 600" aria-hidden="true" className={className}>
      <g fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="1.2">
        <circle data-ring cx="300" cy="300" r="292" />
        <circle data-ring cx="300" cy="300" r="228" />
        <circle data-ring cx="300" cy="300" r="142" />
        <circle data-ring cx="300" cy="300" r="38" />
      </g>
      <g data-tonearm fill="none" stroke="#fff" strokeOpacity="0.85" strokeLinecap="round">
        <circle cx="570" cy="30" r="10" strokeWidth="2.5" />
        <path d="M570 30 480 210" strokeWidth="3.5" />
        <path d="m480 210-5 22" strokeWidth="7" />
      </g>
    </svg>
  );
}
