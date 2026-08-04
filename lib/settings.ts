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

const CHAMPION_PREDICTIONS_ENABLED_KEY = "champion_predictions_enabled";
const CHAMPION_PREDICTIONS_CLOSE_AT_KEY = "champion_predictions_close_at";

export type ChampionPredictionSettings = {
  /** Manual on/off switch, admin-controlled. Defaults to open (true) when
   * never set, so existing/undisturbed tournaments keep accepting picks. */
  enabled: boolean;
  /** ISO timestamp — once reached, predictions close automatically even if
   * `enabled` is still true. Null means no schedule is set. */
  closeAt: string | null;
};

export async function getChampionPredictionSettings(): Promise<ChampionPredictionSettings> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [CHAMPION_PREDICTIONS_ENABLED_KEY, CHAMPION_PREDICTIONS_CLOSE_AT_KEY] } },
  });
  const enabledRow = rows.find((r) => r.key === CHAMPION_PREDICTIONS_ENABLED_KEY);
  const closeAtRow = rows.find((r) => r.key === CHAMPION_PREDICTIONS_CLOSE_AT_KEY);
  return {
    enabled: enabledRow ? enabledRow.value === "true" : true,
    closeAt: closeAtRow?.value ?? null,
  };
}

export async function setChampionPredictionEnabled(enabled: boolean): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: CHAMPION_PREDICTIONS_ENABLED_KEY },
    create: { key: CHAMPION_PREDICTIONS_ENABLED_KEY, value: String(enabled) },
    update: { value: String(enabled) },
  });
}

export async function setChampionPredictionCloseAt(closeAt: string | null): Promise<void> {
  if (closeAt) {
    await prisma.appSetting.upsert({
      where: { key: CHAMPION_PREDICTIONS_CLOSE_AT_KEY },
      create: { key: CHAMPION_PREDICTIONS_CLOSE_AT_KEY, value: closeAt },
      update: { value: closeAt },
    });
  } else {
    await prisma.appSetting.deleteMany({ where: { key: CHAMPION_PREDICTIONS_CLOSE_AT_KEY } });
  }
}

/** The one function callers outside this file should use — folds the manual
 * switch and the schedule into a single yes/no. */
export async function isChampionPredictionOpen(): Promise<boolean> {
  const { enabled, closeAt } = await getChampionPredictionSettings();
  if (!enabled) return false;
  if (closeAt && new Date(closeAt).getTime() <= Date.now()) return false;
  return true;
}
