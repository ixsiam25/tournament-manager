"use client";

import { forwardRef, useRef } from "react";
import "./player-card.css";
import { PHOTO_OFFSET_RANGE } from "@/lib/applicationConfig";
import type { CardModel } from "@/lib/playerCard";

export type CardFraming = { zoom: number; x: number; y: number };

/**
 * The player card: tier-coloured shield, overall + position + club badge on the
 * left, photo (preferably a background-removed cut-out) on the right, name, and
 * the six stats. Pure presentation — it renders whatever model it is given, so
 * the apply preview, the public gallery and the PNG export all look identical.
 *
 * With `onFramingChange` the photo can be dragged inside its window; framing is
 * reported as numbers (never baked into the image).
 */
export const PlayerCardView = forwardRef<
  HTMLDivElement,
  {
    name: string;
    model: CardModel;
    imageUrl: string | null;
    /** True when `imageUrl` is a transparent cut-out (shown bottom-aligned, not cropped). */
    isCutout?: boolean;
    framing: CardFraming;
    badge?: string;
    footer?: string;
    onFramingChange?: (next: CardFraming) => void;
  }
>(function PlayerCardView({ name, model, imageUrl, isCutout = false, framing, badge, footer, onFramingChange }, ref) {
  const drag = useRef<{ x: number; y: number } | null>(null);
  const clamp = (n: number) => Math.min(PHOTO_OFFSET_RANGE.max, Math.max(PHOTO_OFFSET_RANGE.min, n));
  const draggable = !!imageUrl && !!onFramingChange;

  return (
    <div ref={ref} className={`pcard pcard--${model.tier}`} aria-label={`Player card: ${name || "new player"}`}>
      <div className="pcard__ovr">{model.overall ?? "—"}</div>
      {model.bonus > 0 && <div className="pcard__form" title="Form bonus from goals and assists">+{model.bonus}</div>}
      <div className="pcard__pos">{model.position ?? "—"}</div>
      <div className="pcard__badge">{(badge ?? "BFL").slice(0, 4)}</div>
      <div
        className={"pcard__photo" + (draggable ? " pcard__photo--drag" : "") + (isCutout ? " pcard__photo--cutout" : "")}
        onPointerDown={(e) => {
          if (!draggable) return;
          drag.current = { x: e.clientX - framing.x, y: e.clientY - framing.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current || !onFramingChange) return;
          onFramingChange({ ...framing, x: clamp(e.clientX - drag.current.x), y: clamp(e.clientY - drag.current.y) });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob URLs / R2 proxy; next/image can't optimise a local preview and the PNG export needs a plain <img>
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            style={{ transform: `translate(calc(-50% + ${framing.x}px), calc(-50% + ${framing.y}px)) scale(${framing.zoom / 100})` }}
          />
        ) : (
          <svg className="pcard__placeholder" viewBox="0 0 100 120" aria-hidden="true">
            <circle cx="50" cy="38" r="22" fill="currentColor" />
            <path d="M8 120c2-34 20-48 42-48s40 14 42 48z" fill="currentColor" />
          </svg>
        )}
      </div>
      <div className="pcard__name">{name.trim() || "Your name"}</div>
      <div className="pcard__rule" />
      <div className="pcard__stats">
        {model.stats.map((s) => (
          <span key={s.key}>
            <b>{s.value ?? "—"}</b>
            {s.label}
          </span>
        ))}
      </div>
      {footer && <div className="pcard__foot">{footer}</div>}
    </div>
  );
});
