/**
 * One-off: creates the first `User` accounts from what already exists —
 * an ADMIN account from the shared `ADMIN_PASSWORD`/`admin_password_hash`,
 * and one OWNER account per team that has a `managerPasswordHash` set,
 * reusing that exact hash so existing team managers keep logging in with
 * their current password unchanged. Idempotent — skips accounts that
 * already exist, so it's safe to re-run.
 *
 * Run once via: npx tsx scripts/backfill-users.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

function slugifyUsername(name: string): string {
  // \p{M} (combining marks) has to stay alongside \p{L}/\p{N} or Bengali
  // vowel signs (e.g. the ি in কমিটির) get silently stripped, mangling the
  // slug into something unrecognisable rather than just non-Latin.
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "team";
  return base;
}

async function main() {
  const { prisma } = await import("../lib/db");
  const { hashPassword } = await import("../lib/passwords");
  const { getAdminPasswordHash } = await import("../lib/settings");

  // --- ADMIN account ---
  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (existingAdmin) {
    console.log(`ADMIN account already exists (${existingAdmin.username}) — skipping.`);
  } else {
    const dbHash = await getAdminPasswordHash();
    const passwordHash = dbHash ?? (process.env.ADMIN_PASSWORD ? await hashPassword(process.env.ADMIN_PASSWORD) : null);
    if (!passwordHash) {
      console.error("No admin_password_hash and no ADMIN_PASSWORD env var — cannot create the ADMIN account.");
    } else {
      const admin = await prisma.user.create({
        data: { name: "Admin", username: "admin", passwordHash, role: "ADMIN" },
      });
      console.log(`Created ADMIN account: username "${admin.username}".`);
    }
  }

  // --- OWNER accounts, one per team with a manager password set ---
  const teams = await prisma.team.findMany({ where: { managerPasswordHash: { not: null } } });
  const usedUsernames = new Set((await prisma.user.findMany({ select: { username: true } })).map((u) => u.username));

  let created = 0;
  let skipped = 0;
  for (const team of teams) {
    const existingOwner = await prisma.user.findFirst({ where: { teamId: team.id, role: "OWNER" } });
    if (existingOwner) {
      skipped++;
      continue;
    }
    let username = slugifyUsername(team.name);
    let suffix = 2;
    while (usedUsernames.has(username)) {
      username = `${slugifyUsername(team.name)}-${suffix}`;
      suffix++;
    }
    usedUsernames.add(username);

    await prisma.user.create({
      data: {
        name: team.managerName ?? team.name,
        username,
        passwordHash: team.managerPasswordHash!,
        role: "OWNER",
        teamId: team.id,
        isActive: !team.managerLoginBlocked,
      },
    });
    console.log(`Created OWNER account for "${team.name}": username "${username}".`);
    created++;
  }

  console.log(`\nDone. ${created} OWNER account(s) created, ${skipped} already existed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
