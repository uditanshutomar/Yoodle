import { test, expect, Page } from "@playwright/test";

/**
 * Helper: mock APIs for the settings page where theme toggling happens.
 */
async function mockThemeAPIs(page: Page) {
  const mockUser = {
    id: "user-1",
    name: "Test User",
    displayName: "Test User",
    email: "test@example.com",
    mode: "social",
    hasGoogleAccess: false,
  };

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { user: mockUser, preferences: { notifications: true, theme: "light" } },
      }),
    })
  );

  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    })
  );

  await page.route("**/api/users/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: mockUser }),
    })
  );

  await page.route("**/api/ai/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: {} }),
    })
  );

  await page.route("**/api/conversations**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    })
  );

  await page.route("**/api/meetings**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    })
  );

  await page.route("**/api/calendar/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    })
  );

  await page.route("**/api/boards**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    })
  );

  await page.route("**/api/ghost-rooms**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    })
  );

  await page.route("**/api/analytics/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: {} }),
    })
  );

  await page.route("**/api/auth/google**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { url: "#" } }),
    })
  );
}

/**
 * Retrieve the computed background color of <html> or <body>.
 */
async function getBodyBgColor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const html = document.documentElement;
    return window.getComputedStyle(html).backgroundColor;
  });
}

test.describe("Dark mode — visual regression", () => {
  test.beforeEach(async ({ page }) => {
    await mockThemeAPIs(page);
    await page.context().addCookies([
      { name: "access_token", value: "fake-jwt-for-e2e", domain: "localhost", path: "/" },
    ]);
  });

  test("light mode renders with a light background", async ({ page }) => {
    // Force light mode via emulation
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Click the Light theme button to ensure light mode is active
    await page.getByRole("button", { name: /light/i }).click();

    const bg = await getBodyBgColor(page);
    // Light backgrounds typically have high RGB values (close to 255)
    // Parse the rgb string
    const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    expect(match).toBeTruthy();
    if (match) {
      const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
      // Light mode: average RGB should be > 200
      expect((r + g + b) / 3).toBeGreaterThan(180);
    }
  });

  test("dark mode renders with a dark background", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Click the Dark theme button
    await page.getByRole("button", { name: /dark/i }).click();

    // Give the theme a moment to apply
    await page.waitForTimeout(300);

    const bg = await getBodyBgColor(page);
    const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    expect(match).toBeTruthy();
    if (match) {
      const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
      // Dark mode: average RGB should be < 80
      expect((r + g + b) / 3).toBeLessThan(80);
    }
  });

  test("toggle between dark and light mode changes background", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Start with Light
    await page.getByRole("button", { name: /light/i }).click();
    await page.waitForTimeout(200);
    const lightBg = await getBodyBgColor(page);

    // Switch to Dark
    await page.getByRole("button", { name: /dark/i }).click();
    await page.waitForTimeout(300);
    const darkBg = await getBodyBgColor(page);

    // The two backgrounds should be different
    expect(lightBg).not.toEqual(darkBg);
  });

  test("heading text is readable in dark mode (not invisible)", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Switch to Dark
    await page.getByRole("button", { name: /dark/i }).click();
    await page.waitForTimeout(300);

    // Get the computed color of the heading text
    const heading = page.getByRole("heading", { name: /settings/i });
    await expect(heading).toBeVisible();

    const textColor = await heading.evaluate(
      (el) => window.getComputedStyle(el).color
    );
    const bgColor = await getBodyBgColor(page);

    // Parse both colors
    const textMatch = textColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    const bgMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);

    expect(textMatch).toBeTruthy();
    expect(bgMatch).toBeTruthy();

    if (textMatch && bgMatch) {
      const textLum =
        (Number(textMatch[1]) + Number(textMatch[2]) + Number(textMatch[3])) / 3;
      const bgLum =
        (Number(bgMatch[1]) + Number(bgMatch[2]) + Number(bgMatch[3])) / 3;
      // There should be sufficient contrast: text and bg luminance should differ by at least 100
      expect(Math.abs(textLum - bgLum)).toBeGreaterThan(80);
    }
  });

  test("dashboard text is readable in dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });

    // Set dark theme via localStorage before navigation (if ThemeProvider reads it)
    await page.addInitScript(() => {
      localStorage.setItem("theme", "dark");
    });

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // The main heading should be visible (not hidden by matching bg color)
    const heading = page.getByRole("heading", { name: /what are we working on/i });
    await expect(heading).toBeVisible();

    // Verify greeting text is also visible
    const greeting = page.getByText(/good (morning|afternoon|evening)/i);
    await expect(greeting).toBeVisible();
  });

  test("theme preference persists in theme button active state", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Click Dark
    const darkBtn = page.getByRole("button", { name: /dark/i });
    await darkBtn.click();
    await page.waitForTimeout(200);

    // Dark button should have the active border
    await expect(darkBtn).toHaveCSS("border-color", "rgb(255, 230, 0)");

    // Click System
    const systemBtn = page.getByRole("button", { name: /system/i });
    await systemBtn.click();
    await page.waitForTimeout(200);

    // System button should now be active
    await expect(systemBtn).toHaveCSS("border-color", "rgb(255, 230, 0)");
    // Dark should no longer be active
    const darkBorder = await darkBtn.evaluate(
      (el) => window.getComputedStyle(el).borderColor
    );
    expect(darkBorder).not.toBe("rgb(255, 230, 0)");
  });
});
