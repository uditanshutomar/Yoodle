import { test, expect } from "@playwright/test";

test.describe("Authentication flows", () => {
  test("login page renders with email input and submit button", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input[type='email'], input[name='email']")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in|log in|continue|send/i })).toBeVisible();
  });

  test("login form shows validation error for invalid email", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.locator("input[type='email'], input[name='email']");
    await emailInput.fill("not-an-email");
    await page.getByRole("button", { name: /sign in|log in|continue|send/i }).click();
    // Should show validation error or not navigate away
    await expect(page).toHaveURL(/login/);
  });

  test("signup page renders", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator("input[type='email'], input[name='email']")).toBeVisible();
  });

  test("redirects unauthenticated users from protected routes", async ({ page }) => {
    const protectedRoutes = ["/dashboard", "/meetings", "/settings", "/ai"];
    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/login|auth|signup/);
    }
  });

  test("login page has link to signup and vice versa", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /sign up|create|register/i })).toBeVisible();

    await page.goto("/signup");
    await expect(page.getByRole("link", { name: /sign in|log in|already/i })).toBeVisible();
  });
});
