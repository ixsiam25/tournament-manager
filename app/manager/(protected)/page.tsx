import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { MANAGER_COOKIE_NAME, verifyManagerSessionToken } from "@/lib/managerAuth";
import { PlayerCard } from "@/components/PlayerCard";
import { PhotoUploader } from "@/components/PhotoUploader";

export const dynamic = "force-dynamic";

export default async function ManagerPortalPage() {
  const token = (await cookies()).get(MANAGER_COOKIE_NAME)?.value;
  const teamId = await verifyManagerSessionToken(token);
  if (!teamId) redirect("/manager/login");

  const players = await prisma.player.findMany({
    where: { teamId },
    orderBy: { jerseyNumber: "asc" },
  });

  return (
    <div>
      <h1 className="mb-2 heading-display text-2xl">Player Photos</h1>
      <p className="mb-6 text-sm text-muted">
        Upload a clear headshot for each player — it becomes their player card across the site
        immediately. Best results: a 3:5 (portrait) photo, cropped to the head/shoulders.
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {players.map((p) => (
          <div
            key={p.id}
            className="flex flex-col items-center gap-3 rounded-block-lg border-2 border-line-strong bg-surface p-4 text-center shadow-block"
          >
            <PlayerCard
              name={p.name}
              jerseyNumber={p.jerseyNumber}
              position={p.position}
              isCaptain={p.isCaptain}
              photoUrl={p.photoUrl}
            />
            <PhotoUploader playerId={p.id} />
          </div>
        ))}
        {players.length === 0 && (
          <p className="col-span-full text-sm text-muted">No players on your squad yet.</p>
        )}
      </div>
    </div>
  );
}
