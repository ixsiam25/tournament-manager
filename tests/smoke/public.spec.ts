import { test, expect } from "@playwright/test";

const PUBLIC_PAGES = ["/", "/fixtures", "/standings", "/teams", "/players", "/roster", "/predictions", "/auction", "/register", "/legacy", "/legacy/hall-of-fame", "/jersey"];

// Known, tracked noise that is not a regression signal.
const IGNORED_CONSOLE = [/Failed to load resource.*\/_next\/image/];

for (const path of PUBLIC_PAGES) {
  test(`public page ${path} renders without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !IGNORED_CONSOLE.some((r) => r.test(m.text()))) errors.push(m.text());
    });
    const res = await page.goto(path);
    expect(res?.status(), `${path} status`).toBe(200);
    await expect(page.locator("h1").first()).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/application error|internal server error/i);
    expect(errors, `${path} console errors`).toEqual([]);
  });
}

test("unknown route returns 404, not 500", async ({ page }) => {
  const res = await page.goto("/this-route-does-not-exist");
  expect(res?.status()).toBe(404);
});

test("missing photo key degrades to 404, not 500", async ({ request }) => {
  const res = await request.get("/api/photos/does-not-exist");
  expect(res.status()).toBe(404);
});
