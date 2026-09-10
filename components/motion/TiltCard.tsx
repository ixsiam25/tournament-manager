"use client";

import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import type { ReactNode } from "react";
import { useRef } from "react";

/**
 * Magnetic tilt plus a pointer-tracked highlight. The technique is lifted from
 * Kokonut UI's `spotlight-cards`, but that component is a hardcoded SaaS
 * feature grid, so only the motion behaviour is reused here — the shell stays
 * hard-edged and keeps the `shadow-block` treatment used everywhere else.
 *
 * Tilt is deliberately shallow (6°); the offset shadow is a flat, graphic
 * device and a steep 3D rotation makes it read as a mistake.
 */
const TILT = 6;
const SPRING = { stiffness: 300, damping: 28, mass: 0.6 } as const;

export function TiltCard({
  children,
  className = "",
  glow = "var(--pitch)",
}: {
  children: ReactNode;
  className?: string;
  glow?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Pointer position as a 0–1 fraction of the card, so the same values drive
  // both the rotation and the highlight.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const rotateX = useSpring(useTransform(py, [0, 1], [TILT, -TILT]), SPRING);
  const rotateY = useSpring(useTransform(px, [0, 1], [-TILT, TILT]), SPRING);

  const glowX = useTransform(px, (v) => `${v * 100}%`);
  const glowY = useTransform(py, (v) => `${v * 100}%`);
  const highlight = useMotionTemplate`radial-gradient(220px circle at ${glowX} ${glowY}, ${glow}, transparent 70%)`;

  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }

  function handleLeave() {
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d", transformPerspective: 700 }}
      className={"group relative " + className}
    >
      <motion.span
        aria-hidden
        style={{ background: highlight }}
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 mix-blend-soft-light transition-opacity duration-200 group-hover:opacity-60"
      />
      {children}
    </motion.div>
  );
}
