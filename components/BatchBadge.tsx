import { batchInfo, type BatchMeaning } from "@/lib/batch";

/** "Fall 24 · 5th semester" / "Spring 20 · Alumni" for a batch label; anything
 * that isn't a batch (free-text affiliations, old data) is shown as it is. */
export function BatchBadge({ label, meaning = "entry", date }: { label: string | null | undefined; meaning?: BatchMeaning; date?: Date }) {
  if (!label) return null;
  const info = batchInfo(label, date ?? new Date(), meaning);
  if (!info.valid) return <>{label}</>;
  return (
    <>
      {info.label} <span className={info.status === "alumni" ? "font-semibold text-amber-600" : info.status === "incoming" ? "text-live" : "text-pitch"}>· {info.text}</span>
    </>
  );
}
