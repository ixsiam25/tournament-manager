import Image from "next/image";

export type EventItem = {
  id: string;
  type: "GOAL" | "ASSIST" | "YELLOW_CARD" | "RED_CARD";
  player: { name: string; photoUrl: string | null; jerseyNumber: number };
  team: { name: string };
};

const EVENT_LABELS: Record<EventItem["type"], string> = {
  GOAL: "⚽",
  ASSIST: "🅰️",
  YELLOW_CARD: "🟨",
  RED_CARD: "🟥",
};

/** Shared goal/assist/card list — used for both the live match panel and
 * each recent result on the home page. */
export function EventList({ events, className }: { events: EventItem[]; className?: string }) {
  if (events.length === 0) return null;
  return (
    <ul className={"space-y-1.5 " + (className ?? "")}>
      {events.map((e) => (
        <li key={e.id} className="flex items-center gap-2 text-sm text-muted">
          {e.player.photoUrl ? (
            <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-block border border-line-strong">
              <Image
                src={e.player.photoUrl}
                alt={e.player.name}
                fill
                sizes="24px"
                className="object-cover"
              />
            </span>
          ) : (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-block bg-line text-[10px] font-bold">
              {e.player.jerseyNumber}
            </span>
          )}
          <span>
            {EVENT_LABELS[e.type]} {e.player.name}
            <span className="text-xs"> ({e.team.name})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
