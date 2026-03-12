import { test, expect, devices } from "@playwright/test";

test.describe("Mobile responsiveness", () => {
  test.use({ ...devices["iPhone 13"] });

  test("landing page is responsive on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Yoodle/i);
    // Page should not have horizontal scroll
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("login page works on mobile", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.locator("input[type='email'], input[name='email']");
    await expect(emailInput).toBeVisible();
    // Input should be usable (not hidden off-screen)
    const box = await emailInput.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
  });

  test("signup page works on mobile", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator("input[type='email'], input[name='email']")).toBeVisible();
  });
});

test.describe("Tablet responsiveness", () => {
  test.use({ ...devices["iPad Mini"] });

  test("landing page renders correctly on tablet", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Yoodle/i);
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
