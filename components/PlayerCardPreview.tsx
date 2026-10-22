"use client";

import { useRef } from "react";
import "./player-card.css";
import { PHOTO_OFFSET_RANGE } from "@/lib/applicationConfig";

export type CardFraming = { zoom: number; x: number; y: number };

const OUTFIELD_STATS = ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"];
const GK_STATS = ["DIV", "HAN", "KIC", "REF", "SPE", "POS"];

/**
 * Live preview of an applicant's player card. Ratings are blank until an
 * organiser sets them, so the stat block shows dashes. The photo can be
 * dragged inside its window; framing is reported as numbers (never baked into
 * the image) so it can be adjusted again later.
 */
export function PlayerCardPreview({
  name,
  position,
  photoUrl,
  framing,
  footer,
  onFramingChange,
}: {
  name: string;
  position: string | null;
  photoUrl: string | null;
  framing: CardFraming;
  footer?: string;
  onFramingChange?: (next: CardFraming) => void;
}) {
  const drag = useRef<{ x: number; y: number } | null>(null);
  const labels = position === "GK" ? GK_STATS : OUTFIELD_STATS;
  const clamp = (n: number) => Math.min(PHOTO_OFFSET_RANGE.max, Math.max(PHOTO_OFFSET_RANGE.min, n));
  const draggable = !!photoUrl && !!onFramingChange;

  return (
    <div className="pcard" aria-label={`Player card preview for ${name || "new player"}`}>
      <div className="pcard__ovr">—</div>
      <div className="pcard__pos">{position ?? "—"}</div>
      <div className="pcard__badge">BD</div>
      <div
        className={"pcard__photo" + (draggable ? " pcard__photo--drag" : "")}
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
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob/object URLs and R2 proxies; next/image can't optimise a local preview
          <img
            src={photoUrl}
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
        {labels.map((l) => (
          <span key={l}>
            <b>—</b>
            {l}
          </span>
        ))}
      </div>
      {footer && <div className="pcard__foot">{footer}</div>}
    </div>
  );
}
