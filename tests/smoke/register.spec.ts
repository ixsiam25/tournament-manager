import { test, expect } from "@playwright/test";

// Never submits a valid application — only probes validation and gating,
// so it cannot create a Registration row in whichever DB it runs against.

test("registration status endpoint answers", async ({ request }) => {
  const res = await request.get("/api/register");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(typeof body.open).toBe("boolean");
});

test("registration POST with empty body is rejected cleanly", async ({ request }) => {
  const res = await request.post("/api/register", { multipart: { name: "" } });
  // 403 when registration is closed, 400 when open + invalid. Never 500, never 2xx.
  expect([400, 403, 429]).toContain(res.status());
});

test("registration page shows form or closed notice", async ({ page }) => {
  await page.goto("/register");
  const form = page.locator("form");
  const closed = page.getByText(/isn't open|not open|closed/i).first();
  await expect(form.or(closed).first()).toBeVisible();
});
