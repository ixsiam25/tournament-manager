import { batchInfo } from "@/lib/batch";

/** "5TH SEM" / "ALUMNI" / null — the short text printed on the card under the position. */
export function semesterLabel(affiliation: string | null | undefined, meaning: "entry" | "graduation" = "graduation", on?: Date): string | null {
  const info = batchInfo(affiliation, on ?? new Date(), meaning);
  if (!info.valid) return null;
  if (info.status === "alumni") return "ALUMNI";
  if (info.status === "incoming") return "NEW";
  return info.text.replace(" semester", " sem").toUpperCase();
}
