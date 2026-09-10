"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * Counts from 0 up to `value` the first time it scrolls into view. Used for
 * goal tallies and season totals, where the number *is* the content and a
 * static figure reads as inert.
 *
 * The element renders the final value on the server so the page is correct
 * before hydration and for anyone with JavaScript off.
 */
/** Below this, counting up is just flicker — "0 → 1" reads as a glitch, not a
 * tally, and a leaderboard where every row is `1 season` would strobe. */
const MIN_WORTH_ANIMATING = 5;

export function CountUp({
  value,
  duration = 0.9,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-30px" });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!inView || reduced || value < MIN_WORTH_ANIMATING) return;
    const controls = animate(0, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, reduced, value, duration]);

  // `tabular-nums` keeps the width stable while the digits tick over, so
  // surrounding text doesn't jitter.
  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {display}
    </span>
  );
}
