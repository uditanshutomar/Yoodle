import { test, expect } from "@playwright/test";

test.describe("Public page navigation", () => {
  test("landing page loads with key elements", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Yoodle/i);
    // Should have a CTA button
    await expect(
      page.getByRole("link", { name: /get started|join|try|sign up/i }).first()
    ).toBeVisible();
  });

  test("privacy policy page loads", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("h1")).toContainText(/privacy/i);
  });

  test("terms of service page loads", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("h1")).toContainText(/terms/i);
  });

  test("waitlist page loads", async ({ page }) => {
    await page.goto("/waitlist");
    await expect(page.locator("input[type='email'], input[name='email']")).toBeVisible();
  });

  test("404 page for unknown routes", async ({ page }) => {
    const response = await page.goto("/definitely-not-a-page");
    expect(response?.status()).toBe(404);
  });
});
