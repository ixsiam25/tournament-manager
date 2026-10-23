import { test, expect } from "@playwright/test";

const ADMIN_PAGES = ["/admin", "/admin/fixtures", "/admin/registrations", "/admin/auction", "/admin/season/rollover", "/admin/users", "/admin/people", "/admin/formation", "/admin/cards", "/admin/players", "/admin/settings"];

for (const path of ADMIN_PAGES) {
  test(`unauthenticated ${path} is sent to login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/(admin\/)?login/);
  });
}

const ADMIN_APIS: Array<[string, string]> = [
  ["POST", "/api/admin/fixtures"],
  ["POST", "/api/admin/auction"],
  ["POST", "/api/admin/seasons"],
  ["POST", "/api/admin/users"],
  ["POST", "/api/admin/people/merge"],
  ["POST", "/api/admin/formation/assign"],
  ["POST", "/api/admin/formation/draft"],
  ["POST", "/api/admin/formation/balanced"],
  ["PUT", "/api/admin/season/application"],
  ["PATCH", "/api/admin/players/does-not-exist/card"],
  ["POST", "/api/admin/players/does-not-exist/cutout"],
  ["GET", "/api/admin/cards"],
  ["POST", "/api/admin/auction/bid"],
  ["POST", "/api/admin/auction/hold"],
  ["POST", "/api/admin/auction/unhold"],
  ["POST", "/api/admin/auction/assign"],
  ["POST", "/api/admin/auction/draw"],
  ["POST", "/api/admin/auction/close"],
  ["POST", "/api/admin/auction/reopen"],
  ["POST", "/api/admin/players/does-not-exist/release"],
  ["PATCH", "/api/admin/people/does-not-exist"],
];

for (const [method, path] of ADMIN_APIS) {
  test(`unauthenticated ${method} ${path} is rejected`, async ({ request }) => {
    const res = await request.fetch(path, { method, data: {} });
    expect([401, 403, 404, 405]).toContain(res.status());
  });
}

test("manager portal requires login", async ({ page }) => {
  await page.goto("/manager");
  await expect(page).toHaveURL(/login/);
});
