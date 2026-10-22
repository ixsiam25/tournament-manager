import { test, expect } from "@playwright/test";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";

// Real round-trip against the configured R2 bucket. Skipped automatically
// when R2 credentials are absent, so it never blocks the smoke suite.
config({ path: ".env.local" });
const configured = Boolean(
  process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME,
);

test.describe("R2 media store", () => {
  test.skip(!configured, "R2_* env vars not set");

  test("put → get → delete round-trips and a missing key is null", async () => {
    const { putObject, getObject, deleteObject } = await import("../../lib/mediaStore");
    const key = `smoke-test/${randomUUID()}.txt`;
    await putObject(key, "hello-r2", "text/plain");
    const got = await getObject(key);
    expect(got?.contentType).toBe("text/plain");
    expect(Buffer.from(got!.data).toString()).toBe("hello-r2");
    await deleteObject(key);
    expect(await getObject(key)).toBeNull();
  });
});
