import type { Page } from "playwright-core";
import { batchInfo } from "../../lib/batch";

/** Chooses a batch on the apply form the way an applicant does: their current semester, or "alumni" + the batch they were in. */
export async function pickBatch(page: Page, label: string) {
  const info = batchInfo(label);
  if (!info.valid) throw new Error(`not a batch: ${label}`);
  if (info.status === "student") {
    await page.getByLabel("Current semester").selectOption(String(info.semester));
    return;
  }
  await page.getByLabel("Current semester").selectOption("alumni");
  const m = /^(Fall|Spring) (\d{2})$/.exec(info.label)!;
  await page.getByLabel("Batch term").selectOption(m[1] === "Fall" ? "FALL" : "SPRING");
  await page.getByLabel("Batch year").selectOption(String(2000 + Number(m[2])));
}
