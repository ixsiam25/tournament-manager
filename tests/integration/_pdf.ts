import { inflateSync } from "node:zlib";

/** All text drawn in a pdf-lib document, in drawing order (its content streams are plain Flate; text is hex strings). */
export function pdfText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  let out = "";
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      const content = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
      for (const t of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out += Buffer.from(t[1], "hex").toString("latin1") + "\n";
    } catch {
      /* image streams etc. */
    }
  }
  return out;
}
