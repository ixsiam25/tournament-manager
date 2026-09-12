import { Reveal } from "@/components/motion/Reveal";
import { JerseyShowcase } from "@/components/JerseyShowcase";

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
          to zoom, and check the marked details for the story behind each one.
        </p>
      </Reveal>

      <Reveal index={1} className="mx-auto mt-8 max-w-md">
        <JerseyShowcase />
      </Reveal>
    </div>
  );
}
