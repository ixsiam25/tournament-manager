import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { TiltCard } from "@/components/motion/TiltCard";

/**
 * Homepage thumbnail for the home kit — links through to the full hotspot
 * showcase at /jersey rather than duplicating the zoom interaction here.
 */
export function JerseyTeaser() {
  return (
    <Reveal className="mt-8">
      <TiltCard glow="var(--gold)" className="rounded-block-lg">
        <Link
          href="/jersey"
          className="stripe-texture group flex items-center gap-5 overflow-hidden rounded-block-lg border border-line bg-surface p-4 shadow-block transition-colors hover:border-gold sm:gap-8 sm:p-6"
        >
          <div className="relative h-28 w-28 shrink-0 sm:h-36 sm:w-36">
            <Image
              src="/jersey/jersey-thumb.webp"
              alt="BFL home kit"
              fill
              sizes="144px"
              className="object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.25)]"
            />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">The Home Kit</span>
            <h2 className="heading-display mt-1 text-2xl leading-none sm:text-3xl">Meet the Jersey</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Crowned tiger crest, Hokusai wave print, gold trim. Explore every detail up close.
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-foreground">
              Explore the design
              <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
            </span>
          </div>
        </Link>
      </TiltCard>
    </Reveal>
  );
}
