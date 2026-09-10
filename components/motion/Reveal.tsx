"use client";

import { motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";

const TAGS = {
  div: motion.div,
  li: motion.li,
  section: motion.section,
  tr: motion.tr,
} as const;

/** Entrance easing — a fast-out curve, so cards settle rather than float. */
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Fades and lifts its children into place the first time they scroll into
 * view. This replaces the older `animate-card-in` CSS class, which fired on
 * page load whether or not the element was on screen — everything below the
 * fold had already finished animating by the time you reached it.
 *
 * `index` staggers a list. The step is short and capped at six, so a ten-row
 * leaderboard finishes in ~0.3s rather than making the last row wait.
 */
export function Reveal({
  children,
  as = "div",
  index = 0,
  distance = 12,
  className,
  style,
}: {
  children: ReactNode;
  as?: keyof typeof TAGS;
  index?: number;
  distance?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const Tag = TAGS[as];
  return (
    <Tag
      // Motion serialises `initial` into the server-rendered markup, so with
      // JavaScript disabled every revealed element would stay at opacity 0
      // forever. The <noscript> rule in app/layout.tsx keys off this attribute
      // to force them all visible.
      data-reveal=""
      className={className}
      style={style}
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: EASE, delay: Math.min(index, 6) * 0.05 }}
    >
      {children}
    </Tag>
  );
}
