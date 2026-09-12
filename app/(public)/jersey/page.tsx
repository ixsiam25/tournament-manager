import { Reveal } from "@/components/motion/Reveal";
import { JerseyShowcase } from "@/components/JerseyShowcase";
import { JerseyVoteWidget } from "@/components/JerseyVoteWidget";

export const metadata = { title: "The Kit — BFL" };

export default function JerseyPage() {
  return (
    <div>
      <Reveal>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.32em] text-brand">The Home Kit</p>
        <h1 className="heading-display text-4xl leading-[0.9] sm:text-5xl">Meet the Jersey</h1>
        <hr className="my-5 h-px border-0 bg-line" />
        <p className="lede max-w-prose">
          Maroon and gold, built around a crowned tiger crest and a tonal wave print. Hover the kit below
          to zoom (tap ⤢ to view it bigger), and check the marked details for the story behind each one.
        </p>
      </Reveal>

      <div className="mt-8 flex flex-col items-center gap-6">
        <Reveal index={1} className="w-full max-w-md">
          <JerseyShowcase />
        </Reveal>
        <Reveal index={2} className="w-full max-w-md">
          <JerseyVoteWidget />
        </Reveal>
      </div>
    </div>
  );
}
