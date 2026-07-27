import Image from "next/image";

const POSITION_LABELS: Record<string, string> = {
  GK: "GK",
  DEF: "DEF",
  MID: "MID",
  FWD: "FWD",
};

export function PlayerCard({
  name,
  jerseyNumber,
  position,
  isCaptain,
  photoUrl,
}: {
  name: string;
  jerseyNumber: number;
  position?: string | null;
  isCaptain?: boolean;
  photoUrl?: string | null;
}) {
  return (
    <div className="group relative flex w-24 flex-col items-center gap-1.5 rounded-block-lg border-2 border-line bg-surface/95 p-1.5 text-center shadow-block transition-transform hover:-translate-y-0.5 hover:border-line-strong">
      {photoUrl ? (
        <div className="relative aspect-[3/5] w-full overflow-hidden rounded-block">
          <Image src={photoUrl} alt={name} fill sizes="96px" className="object-cover" />
          <span className="absolute bottom-1 left-1 flex h-6 w-6 items-center justify-center rounded-block bg-brand text-xs font-extrabold text-white shadow-sm">
            {jerseyNumber}
          </span>
          {isCaptain && (
            <span
              title="Captain"
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-block bg-pitch text-[10px] font-extrabold text-white shadow-sm"
            >
              C
            </span>
          )}
        </div>
      ) : (
        <div className="relative py-1.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-block bg-gradient-to-b from-brand to-brand-dark text-sm font-extrabold text-white shadow-sm">
            {jerseyNumber}
          </span>
          {isCaptain && (
            <span
              title="Captain"
              className="absolute -right-1.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-block bg-pitch text-[9px] font-extrabold text-white shadow-sm"
            >
              C
            </span>
          )}
        </div>
      )}
      <span className="line-clamp-2 text-xs font-bold uppercase leading-tight tracking-wide">
        {name}
      </span>
      {position && (
        <span className="rounded-block bg-pitch/15 px-1.5 py-0.5 text-[10px] font-bold text-pitch-dark">
          {POSITION_LABELS[position] ?? position}
        </span>
      )}
    </div>
  );
}
