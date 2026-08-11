export type ImagePreset = "avatar" | "gallery";

const PRESETS: Record<ImagePreset, { maxDimension: number; quality: number }> = {
  // Player/team headshots — small, square-ish crops.
  avatar: { maxDimension: 1000, quality: 0.85 },
  // Season media gallery / hero photos — full-width shots need more detail.
  gallery: { maxDimension: 1800, quality: 0.85 },
};

/**
 * Downscales/re-encodes client-side so uploads stay small without a
 * server-side image-processing dependency.
 *
 * `imageOrientation: "from-image"` is required — without it,
 * `createImageBitmap` ignores the photo's EXIF orientation tag, so a
 * portrait phone photo (stored as landscape pixel data plus a "rotate this
 * for display" tag, which is how most phone cameras save) comes out
 * rotated 90° once that tag is dropped.
 */
export async function downscaleToJpeg(file: File, preset: ImagePreset = "avatar"): Promise<Blob> {
  const { maxDimension, quality } = PRESETS[preset];
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode image"))),
      "image/jpeg",
      quality,
    );
  });
}
