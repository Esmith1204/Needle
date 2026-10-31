import { useRef, type ReactNode } from "react";
import { enter, useGSAP } from "../lib/motion";
import { RecordRings } from "./RecordRings";
import { Wordmark } from "./Wordmark";

interface AuthLayoutProps {
  title: ReactNode;
  subtitle: string;
  children: ReactNode;
}

/** Two-column layout shared by sign in, sign up, and profile setup. */
export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(() => enter("[data-enter]", { y: 12, duration: 0.4, stagger: 0.07 }), { scope: root });

  return (
    <div ref={root} className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden flex-col overflow-hidden bg-brand p-12 text-white lg:flex">
        <Wordmark className="text-3xl" />
        <h1 data-enter className="mt-16 text-5xl font-extrabold leading-[1.05] tracking-tight">
          {title}
        </h1>
        <p data-enter className="mt-4 max-w-sm text-base leading-relaxed text-white/85">
          {subtitle}
        </p>
        <RecordRings className="absolute -bottom-48 right-2 w-[30rem]" />
      </section>
      <main className="flex flex-col justify-center px-6 py-10">
        <div data-enter className="mx-auto w-full max-w-sm">
          <Wordmark className="mb-8 block text-2xl lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
