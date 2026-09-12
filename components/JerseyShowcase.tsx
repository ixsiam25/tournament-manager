"use client";

import Image from "next/image";
import { useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

type Hotspot = { x: number; y: number; label: string; copy: string };

const VIEWS = {
  front: {
    src: "/jersey/jersey-front.webp",
    alt: "BFL home kit, front",
    aspect: "aspect-[3567/4402]",
    hotspots: [
      { x: 0.62, y: 0.24, label: "Crowned Tiger Crest", copy: "The BFL badge — a tiger under a crown, built fresh for this kit rather than reused from anywhere else." },
      { x: 0.42, y: 0.55, label: "Tonal Wave Print", copy: "A subtle wave texture runs across the body — a nod to Hokusai's Great Wave, printed into the fabric, not just a flat colour block." },
      { x: 0.86, y: 0.42, label: "Sponsor Patch", copy: "Right sleeve carries the kit's backer patch." },
      { x: 0.22, y: 0.14, label: "Gold Trim", copy: "Gold shoulder stripes, collar piping and cuffs finish the maroon base — the same maroon/gold identity as the rest of BFL." },
    ] as Hotspot[],
  },
  back: {
    src: "/jersey/jersey-back.webp",
    alt: "BFL home kit, back",
    aspect: "aspect-[3586/4310]",
    hotspots: [
      { x: 0.5, y: 0.28, label: "Nameset", copy: "Player surname arcs above the number in gold serif — every squad member gets their own." },
      { x: 0.5, y: 0.55, label: "Squad Number", copy: "Large gold squad number, sized to read from the far touchline." },
    ] as Hotspot[],
  },
} as const;

type ViewKey = keyof typeof VIEWS;

const ZOOM = 1.7;
const SPRING = { stiffness: 260, damping: 26, mass: 0.5 } as const;

export function JerseyShowcase() {
  const [view, setView] = useState<ViewKey>("front");
  const current = VIEWS[view];

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const scale = useMotionValue(1);
  const springScale = useSpring(scale, SPRING);
  const originX = useTransform(px, (v) => `${v * 100}%`);
  const originY = useTransform(py, (v) => `${v * 100}%`);

  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }

  return (
    <div className="rounded-block-lg border border-line bg-surface shadow-block">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Hover to inspect · tap a dot for detail
        </span>
        <div className="flex gap-1.5">
          {(Object.keys(VIEWS) as ViewKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={
                "rounded-block px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors " +
                (view === key
                  ? "bg-foreground text-background"
                  : "border border-line-strong text-muted-foreground hover:bg-background")
              }
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <div className={"relative overflow-hidden bg-background " + current.aspect}>
        <div
          className="absolute inset-0 cursor-crosshair"
          onPointerMove={handleMove}
          onPointerEnter={() => scale.set(ZOOM)}
          onPointerLeave={() => {
            scale.set(1);
            px.set(0.5);
            py.set(0.5);
          }}
        >
          {/* Only the image scales — hotspots live on an unscaled sibling layer
              so they never drift away from the cursor as it approaches them. */}
          <motion.div className="absolute inset-0" style={{ scale: springScale, originX, originY }}>
            <Image
              key={current.src}
              src={current.src}
              alt={current.alt}
              fill
              sizes="(min-width: 1024px) 480px, 90vw"
              className="object-contain"
              priority
            />
          </motion.div>

          <div className="pointer-events-none absolute inset-0">
            {current.hotspots.map((h, i) => (
              <div
                key={i}
                className="group pointer-events-auto absolute"
                style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, transform: "translate(-50%, -50%)" }}
              >
                <span className="block h-3 w-3 animate-pulse rounded-full border-2 border-background bg-gold shadow-block" />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-44 -translate-x-1/2 rounded-block border border-line bg-background p-2.5 text-left text-[11px] leading-snug text-foreground opacity-0 shadow-block transition-opacity duration-150 group-hover:opacity-100">
                  <strong className="mb-0.5 block text-gold">{h.label}</strong>
                  {h.copy}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
