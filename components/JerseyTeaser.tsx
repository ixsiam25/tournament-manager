import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { TiltCard } from "@/components/motion/TiltCard";

/**
 * Homepage banner for the home kit reveal — links through to the full
 * hotspot showcase + vote at /jersey rather than duplicating either here.
 * Sits at the very top of the homepage while the design poll is running.
 */
export function JerseyTeaser() {
  return (
    <Reveal className="mb-8">
      <TiltCard glow="var(--gold)" className="rounded-block-lg">
        <Link
          href="/jersey"
          className="stripe-texture group flex items-center gap-5 overflow-hidden rounded-block-lg border-2 border-gold/40 bg-surface p-4 shadow-block transition-colors hover:border-gold sm:gap-8 sm:p-7"
        >
          <div className="relative h-32 w-32 shrink-0 sm:h-44 sm:w-44">
            <Image
              src="/jersey/jersey-thumb.webp"
              alt="BFL home kit"
              fill
              sizes="176px"
              className="object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.3)] transition-transform duration-300 group-hover:scale-105"
            />
          </div>
          <div className="min-w-0">
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-block bg-gold px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-black">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-black" />
              Vote now
            </span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Kit Reveal</span>
            <h2 className="heading-display mt-1 text-3xl leading-none sm:text-4xl">Meet the Jersey</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Crowned tiger crest, Hokusai wave print, gold trim. See every detail up close and tell us
              what you think.
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-foreground">
              See it &amp; vote
              <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
            </span>
          </div>
        </Link>
      </TiltCard>
    </Reveal>
  );
}
