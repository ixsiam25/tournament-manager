"use client";

import Image from "next/image";
import { useState } from "react";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * A player photo that degrades to the player's initials instead of a broken
 * image icon. Drop-in for the `<Image fill>` calls that render uploaded
 * photos: those come from `/api/photos/[key]`, which can legitimately fail
 * (blob store unreachable, photo deleted, stale key in an archived season),
 * and every one of those cases used to leave a torn placeholder on the card.
 */
export function PlayerPhoto({
  src,
  alt,
  sizes,
  className = "object-cover",
}: {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="flex h-full w-full items-center justify-center bg-muted text-[0.7em] font-black uppercase tracking-wide text-muted-foreground">
        {initials(alt)}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * A media-asset photo (season heroes, galleries) that simply removes itself if
 * the source fails, letting whatever the container already paints — the stripe
 * texture, a caption — show through instead of a torn image icon.
 */
export function MediaPhoto({
  src,
  alt,
  sizes,
  className = "object-cover",
}: {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * A captioned photo that removes itself entirely — frame, caption and all — if
 * the image can't load, rather than leaving an empty bordered box on the page.
 */
export function MediaFigure({
  src,
  caption,
  sizes,
  className = "",
}: {
  src: string;
  caption?: string | null;
  sizes: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <figure className={className}>
      <div className="relative aspect-[16/7] w-full overflow-hidden rounded-block-lg border border-line bg-muted">
        <Image
          src={src}
          alt={caption ?? ""}
          fill
          sizes={sizes}
          className="object-cover"
          onError={() => setFailed(true)}
        />
      </div>
      {caption && (
        <figcaption className="mt-2 border-l-2 border-line pl-3 text-xs text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
