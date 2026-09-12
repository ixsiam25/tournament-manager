"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "motion/react";

type Hotspot = { x: number; y: number; label: string; copy: string };

// Coordinates are fractions of each cropped image, measured directly off the
// pixel art (crest/text centroids) rather than eyeballed — see the football-
// tournament-state memory note for how these were derived.
const VIEWS = {
  front: {
    src: "/jersey/jersey-front.webp",
    alt: "BFL home kit, front",
    aspect: "aspect-[3567/4402]",
    hotspots: [
      { x: 0.654, y: 0.258, label: "Crowned Tiger Crest", copy: "The BFL badge — a tiger under a crown, built fresh for this kit rather than reused from anywhere else." },
      { x: 0.35, y: 0.62, label: "Tonal Wave Print", copy: "A subtle wave texture runs across the body — a nod to Hokusai's Great Wave, printed into the fabric, not just a flat colour block." },
      { x: 0.904, y: 0.309, label: "Sponsor Patch", copy: "Right sleeve carries the kit's backer patch." },
      { x: 0.284, y: 0.088, label: "Gold Trim", copy: "Gold shoulder stripes, collar piping and cuffs finish the maroon base — the same maroon/gold identity as the rest of BFL." },
    ] as Hotspot[],
  },
  back: {
    src: "/jersey/jersey-back.webp",
    alt: "BFL home kit, back",
    aspect: "aspect-[3586/4310]",
    hotspots: [
      { x: 0.488, y: 0.172, label: "Nameset", copy: "Player surname arcs above the number in gold serif — every squad member gets their own." },
      { x: 0.476, y: 0.378, label: "Squad Number", copy: "Large gold squad number, sized to read from the far touchline." },
    ] as Hotspot[],
  },
} as const;

type ViewKey = keyof typeof VIEWS;

const ZOOM = 1.7;
const SPRING = { stiffness: 260, damping: 26, mass: 0.5 } as const;

/**
 * Touch has no persistent hover, so a pointerenter/pointermove/pointerleave
 * zoom either never engages or — worse — engages on tap and never resets,
 * since touchend doesn't reliably fire pointerleave. The cursor-tracked
 * magnify only makes sense on a device that can actually hover a mouse.
 *
 * useSyncExternalStore (not useState+useEffect) so the server snapshot
 * (false — no window) and the first client render agree; React reconciles
 * to the real value right after hydration instead of throwing a mismatch.
 */
const HOVER_QUERY = "(hover: hover) and (pointer: fine)";
function subscribeHoverCapability(onChange: () => void) {
  const mq = window.matchMedia(HOVER_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function getHoverCapability() {
  return window.matchMedia(HOVER_QUERY).matches;
}
function getHoverCapabilityServer() {
  return false;
}
function useSupportsHoverZoom() {
  return useSyncExternalStore(subscribeHoverCapability, getHoverCapability, getHoverCapabilityServer);
}

function JerseyViewer({
  large = false,
  onExpand,
  onClose,
}: {
  large?: boolean;
  onExpand?: () => void;
  onClose?: () => void;
}) {
  const [view, setView] = useState<ViewKey>("front");
  const [activeHotspot, setActiveHotspot] = useState<number | null>(null);
  const current = VIEWS[view];
  const canHoverZoom = useSupportsHoverZoom();

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const scale = useMotionValue(1);
  const springScale = useSpring(scale, SPRING);
  const originX = useTransform(px, (v) => `${v * 100}%`);
  const originY = useTransform(py, (v) => `${v * 100}%`);

  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!canHoverZoom) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }

  function resetZoom() {
    scale.set(1);
    px.set(0.5);
    py.set(0.5);
  }

  function selectView(key: ViewKey) {
    setView(key);
    setActiveHotspot(null);
  }

  return (
    <div
      className={
        "rounded-block-lg border border-line bg-surface shadow-block " +
        (large ? "w-[min(92vw,420px)] sm:w-[min(80vw,520px)]" : "")
      }
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          {canHoverZoom ? "Hover to inspect · tap a dot for detail" : "Tap a dot for detail"}
        </span>
        <div className="flex items-center gap-1.5">
          {(Object.keys(VIEWS) as ViewKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => selectView(key)}
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
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              aria-label="View bigger"
              title="View bigger"
              className="rounded-block border border-line-strong px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-background"
            >
              ⤢
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              title="Close"
              className="rounded-block border border-line-strong px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-background"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className={"relative overflow-hidden bg-background " + current.aspect}>
        <div
          className={"absolute inset-0 " + (canHoverZoom ? "cursor-crosshair" : "")}
          onPointerMove={handleMove}
          onPointerEnter={() => canHoverZoom && scale.set(ZOOM)}
          onPointerLeave={resetZoom}
          onClick={(e) => {
            // Tapping empty space (not a hotspot) closes any open tooltip.
            if (e.target === e.currentTarget) setActiveHotspot(null);
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
              sizes={large ? "(min-width: 640px) 520px, 92vw" : "(min-width: 1024px) 480px, 90vw"}
              className="object-contain"
              priority
            />
          </motion.div>

          <div className="absolute inset-0">
            {current.hotspots.map((h, i) => {
              const active = activeHotspot === i;
              return (
                <div
                  key={i}
                  className="group absolute"
                  style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, transform: "translate(-50%, -50%)" }}
                >
                  <button
                    type="button"
                    aria-label={h.label}
                    aria-expanded={active}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveHotspot(active ? null : i);
                    }}
                    onFocus={() => setActiveHotspot(i)}
                    className="block h-6 w-6 -m-1.5 rounded-full focus:outline-none"
                  >
                    <span
                      className={
                        "mx-auto block h-3 w-3 rounded-full border-2 border-background bg-gold shadow-block transition-transform " +
                        (active ? "scale-125" : "animate-pulse group-hover:scale-110")
                      }
                    />
                  </button>
                  <div
                    className={
                      "pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-44 -translate-x-1/2 rounded-block border border-line bg-background p-2.5 text-left text-[11px] leading-snug text-foreground shadow-block transition-opacity duration-150 " +
                      (active ? "opacity-100" : "opacity-0 group-hover:opacity-100")
                    }
                  >
                    <strong className="mb-0.5 block text-gold">{h.label}</strong>
                    {h.copy}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function JerseyShowcase() {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  return (
    <>
      <JerseyViewer onExpand={() => setExpanded(true)} />
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setExpanded(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <JerseyViewer large onClose={() => setExpanded(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
