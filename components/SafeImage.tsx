"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

const API_PREFIX = "/api/photos/";

/**
 * Photos live in a Netlify Blobs store behind `/api/photos/[key]`, and every
 * historical one has also been checked into `public/photos/<key>.jpg`.
 *
 * The static copy is tried *first*: it is served straight off the CDN with no
 * function invocation, and these images never change — a replaced photo gets a
 * fresh key, never a mutated one. The API route stays as the second candidate
 * so photos uploaded after the export (which have no static copy) still work.
 */
function usePhotoCandidates(initial: string) {
  const candidates = useMemo(() => {
    if (!initial.startsWith(API_PREFIX)) return [initial];
    const key = initial.slice(API_PREFIX.length);
    return [`/photos/${key}.jpg`, initial];
  }, [initial]);

  const [index, setIndex] = useState(0);
  return {
    src: candidates[index] ?? null,
    // `key` forces a remount so the browser actually re-requests rather than
    // reusing the failed image element.
    attempt: index,
    next: () => setIndex((i) => i + 1),
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * A player photo that degrades to the player's initials once every source has
 * failed, instead of leaving a broken image icon on the card.
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
  const photo = usePhotoCandidates(src);

  if (!photo.src) {
    return (
      <span className="flex h-full w-full items-center justify-center bg-muted text-[0.7em] font-black uppercase tracking-wide text-muted-foreground">
        {initials(alt)}
      </span>
    );
  }

  return (
    <Image
      key={photo.attempt}
      src={photo.src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      onError={photo.next}
    />
  );
}

/**
 * A media-asset photo (season heroes, galleries) that simply removes itself if
 * every source fails, letting whatever the container already paints — the
 * stripe texture, a caption — show through instead of a torn image icon.
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
  const photo = usePhotoCandidates(src);
  if (!photo.src) return null;

  return (
    <Image
      key={photo.attempt}
      src={photo.src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      onError={photo.next}
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
  const photo = usePhotoCandidates(src);
  if (!photo.src) return null;

  return (
    <figure className={className}>
      <div className="relative aspect-[16/7] w-full overflow-hidden rounded-block-lg border border-line bg-muted">
        <Image
          key={photo.attempt}
          src={photo.src}
          alt={caption ?? ""}
          fill
          sizes={sizes}
          className="object-cover"
          onError={photo.next}
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
