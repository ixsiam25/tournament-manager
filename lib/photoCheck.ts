/** Friendly, client-side checks on a chosen photo. Warnings never block (a
 * phone photo that's a bit dark is still usable); `blocking` is reserved for
 * photos that can't produce a usable card. */
export type PhotoCheck = { width: number; height: number; warnings: string[]; blocking: string | null };

export async function checkPhoto(file: File): Promise<PhotoCheck> {
  const warnings: string[] = [];
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { width: 0, height: 0, warnings, blocking: "That file couldn't be read as an image." };
  }
  const { width, height } = bitmap;
  const short = Math.min(width, height);

  if (short < 240) {
    bitmap.close();
    return { width, height, warnings, blocking: "That photo is too small — please use one at least 240 px on its short side." };
  }
  if (short < 600) warnings.push("This photo is quite small; a sharper one will make a better card.");
  if (width > height * 1.3) warnings.push("Portrait photos (taller than wide) work best — hold your phone upright.");

  // Average brightness on a tiny copy.
  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 24;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.drawImage(bitmap, 0, 0, 24, 24);
    const { data } = ctx.getImageData(0, 0, 24, 24);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const avg = sum / (data.length / 4);
    if (avg < 55) warnings.push("This photo looks dark — try facing a window or a light.");
    if (avg > 215) warnings.push("This photo looks washed out — avoid strong light behind you.");
  }
  bitmap.close();
  return { width, height, warnings, blocking: null };
}
