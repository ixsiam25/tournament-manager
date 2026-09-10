"use client";

import { MotionConfig } from "motion/react";

/**
 * `reducedMotion="user"` makes every motion component in the tree drop its
 * transform and layout animations when the visitor has "reduce motion" set at
 * the OS level, while keeping opacity fades. Doing it once here means the
 * individual components below don't each have to re-check the media query.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
