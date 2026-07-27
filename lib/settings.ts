import { prisma } from "@/lib/db";

const ADMIN_PASSWORD_HASH_KEY = "admin_password_hash";

/** Null means the admin password has never been changed via the UI —
 * callers should fall back to the ADMIN_PASSWORD env var in that case. */
export async function getAdminPasswordHash(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: ADMIN_PASSWORD_HASH_KEY } });
  return row?.value ?? null;
}

export async function setAdminPasswordHash(hash: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: ADMIN_PASSWORD_HASH_KEY },
    create: { key: ADMIN_PASSWORD_HASH_KEY, value: hash },
    update: { value: hash },
  });
}
