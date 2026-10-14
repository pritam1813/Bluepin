import { expect, test } from "@playwright/test";

/**
 * Thin E2E slice on preview: login → log glucose → verify timeline →
 * WhatsApp-link prompt visible while unlinked → session persists on reload.
 *
 * Report upload is intentionally NOT here: it burns Gemini quota and is slow.
 * Upload is covered by API tests (server/routes/upload.test.ts).
 */

const EMAIL = process.env.E2E_TEST_EMAIL ?? "e2e-test@bluepin.in";
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? "";

test.beforeEach(async ({ page }) => {
  test.skip(!PASSWORD, "E2E_TEST_PASSWORD not set");
  // Protocol-level listeners: these fire even if the renderer is wedged.
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));

  await page.goto("/");
  // Dismiss the PWA install prompt if it appears.
  const notNow = page.getByRole("button", { name: "Not Now" });
  if (await notNow.isVisible().catch(() => false)) await notNow.click();

  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();

  // Cold starts on preview can be slow; wait generously, but if login itself
  // fails, surface the form's error text instead of a bare timeout so CI logs
  // distinguish a bad credential from a hang.
  try {
    await expect(page.getByRole("heading", { name: "Care Reminders" })).toBeVisible({
      timeout: 30_000,
    });
  } catch {
    const errText = await page
      .locator("p")
      .filter({ hasText: /Incorrect email|Too many attempts|Something went wrong|Network error/i })
      .first()
      .textContent()
      .catch(() => null);
    // On a hang (no banner), dump the UI state so CI logs show where it stuck.
    // page.url() is sync and protocol-level; evaluate is a fallback only.
    const pageState = await page
      .evaluate(() => ({
        title: document.title,
        body: document.body.innerText.slice(0, 400).replace(/\s+/g, " "),
      }))
      .catch(() => null);
    const diag = [
      `url=${page.url()}`,
      pageState ? `title="${pageState.title}" body="${pageState.body}"` : "evaluate-blocked",
      consoleErrors.length ? `consoleErrors=${JSON.stringify(consoleErrors.slice(0, 5))}` : "no-console-errors",
      pageErrors.length ? `pageErrors=${JSON.stringify(pageErrors.slice(0, 5))}` : "no-page-errors",
    ].join(" | ");
    throw new Error(
      `E2E login failed${errText ? `: "${errText.trim()}"` : " (dashboard never appeared, no error banner)"}` +
        ` | ${diag}`,
    );
  }
});

test("logs a glucose reading and shows it in the timeline", async ({ page }) => {
  await page.getByRole("button", { name: "Glucose", exact: true }).click();
  await page.getByRole("button", { name: "Add Reading" }).click();

  // Unique-ish value so the assertion cannot match another run's data.
  const value = String(130 + (Date.now() % 40));
  await page.getByRole("spinbutton").fill(value);
  await page.getByText("2–8 hours").click();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("No readings logged yet.")).toBeHidden();
  const timeline = page.getByRole("heading", { name: "Reading Timeline" }).locator("..");
  await expect(timeline.getByText(value, { exact: true }).first()).toBeVisible();
});

test("shows the WhatsApp link prompt while unlinked", async ({ page }) => {
  await page.getByRole("button", { name: "WhatsApp Sync" }).click();
  await expect(page.getByRole("button", { name: "Generate Manual Code" })).toBeVisible();
});

test("session persists across reload", async ({ page }) => {
  await page.reload();
  await expect(page.getByRole("heading", { name: "Care Reminders" })).toBeVisible({ timeout: 30_000 });
});
