import { useGSAP } from "@gsap/react";
import gsap from "gsap";

// Shared GSAP helpers. Motion here confirms an action or shows where something came
// from: it stays under half a second, animates only transform and opacity, and is
// skipped entirely for people who ask for reduced motion.

gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };

export function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Fades and lifts elements into place, leaving no inline styles behind. */
export function enter(targets: gsap.TweenTarget, vars: gsap.TweenVars = {}) {
  if (!targets || reducedMotion()) return;
  gsap.from(targets, {
    autoAlpha: 0,
    y: 8,
    duration: 0.28,
    ease: "power2.out",
    clearProps: "opacity,visibility,transform",
    ...vars,
  });
}

/** A quick overshoot that confirms a tap, like liking a post. */
export function pop(target: gsap.TweenTarget) {
  if (reducedMotion()) return;
  gsap.fromTo(target, { scale: 0.6 }, { scale: 1, duration: 0.4, ease: "back.out(3)", clearProps: "transform" });
}

/** Moves an indicator to its new spot, or jumps there when `animate` is false. */
export function slide(target: gsap.TweenTarget, vars: gsap.TweenVars, animate = true) {
  if (!animate || reducedMotion()) gsap.set(target, vars);
  else gsap.to(target, { duration: 0.3, ease: "power3.out", overwrite: "auto", ...vars });
}
