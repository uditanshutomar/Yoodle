import { test, expect, Page } from "@playwright/test";

/**
 * Helper: mock APIs needed for the settings page.
 */
async function mockSettingsAPIs(page: Page) {
  const mockUser = {
    id: "user-1",
    name: "Test User",
    displayName: "Test User",
    email: "test@example.com",
    mode: "social",
    hasGoogleAccess: false,
    preferences: {
      notifications: true,
      theme: "light",
    },
  };

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { user: mockUser, preferences: mockUser.preferences },
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

  await page.route("**/api/users/me", (route) => {
    if (route.request().method() === "PATCH") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: mockUser }),
    });
  });

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

  await page.route("**/api/auth/google**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { url: "https://accounts.google.com/o/oauth2/auth" } }),
    })
  );
}

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await mockSettingsAPIs(page);
    await page.context().addCookies([
      { name: "access_token", value: "fake-jwt-for-e2e", domain: "localhost", path: "/" },
    ]);
  });

  test("settings page loads with heading", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: /settings/i })
    ).toBeVisible();
  });

  test("profile section shows display name and email fields", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Profile heading
    await expect(page.getByText("Profile")).toBeVisible();

    // Display name label and input
    await expect(page.getByText("Display Name")).toBeVisible();
    const displayNameInput = page.locator("input[type='text']").first();
    await expect(displayNameInput).toBeVisible();

    // Email label and input (disabled)
    await expect(page.getByText("Email")).toBeVisible();
    const emailInput = page.locator("input[type='email']");
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toBeDisabled();
  });

  test("display name input is pre-filled from user data", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const displayNameInput = page.locator("input[type='text']").first();
    // Wait for the useEffect to populate the field
    await expect(displayNameInput).toHaveValue("Test User");
  });

  test("email field shows user email and is disabled", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const emailInput = page.locator("input[type='email']");
    await expect(emailInput).toHaveValue("test@example.com");
    await expect(emailInput).toBeDisabled();
  });

  test("notifications section is visible with toggle", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Notifications")).toBeVisible();
    await expect(page.getByText("Meeting reminders")).toBeVisible();
    await expect(page.getByText(/get notified before meetings start/i)).toBeVisible();
  });

  test("appearance section shows theme options: Light, Dark, System", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Appearance")).toBeVisible();
    await expect(page.getByText("Theme")).toBeVisible();

    // Three theme buttons
    await expect(page.getByRole("button", { name: /light/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /dark/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /system/i })).toBeVisible();
  });

  test("theme toggle buttons switch active state", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const darkButton = page.getByRole("button", { name: /dark/i });
    const lightButton = page.getByRole("button", { name: /light/i });

    // Click Dark
    await darkButton.click();

    // The dark button should now have the active border style (FFE600)
    await expect(darkButton).toHaveCSS("border-color", "rgb(255, 230, 0)");

    // Click Light
    await lightButton.click();
    await expect(lightButton).toHaveCSS("border-color", "rgb(255, 230, 0)");
  });

  test("security section is present", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Security")).toBeVisible();
    await expect(page.getByText(/passwordless magic link/i)).toBeVisible();
  });

  test("connected accounts section shows Google Workspace", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Connected Accounts")).toBeVisible();
    await expect(page.getByText("Google Workspace")).toBeVisible();
  });

  test("save button is present and clickable", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const saveButton = page.getByRole("button", { name: /save changes/i });
    await expect(saveButton).toBeVisible();

    // Clicking save should trigger PATCH and show "Saved!"
    await saveButton.click();
    await expect(page.getByText("Saved!")).toBeVisible();
  });

  test("editing display name and saving persists the change", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const displayNameInput = page.locator("input[type='text']").first();
    await displayNameInput.clear();
    await displayNameInput.fill("New Name");
    await expect(displayNameInput).toHaveValue("New Name");

    const saveButton = page.getByRole("button", { name: /save changes/i });
    await saveButton.click();

    await expect(page.getByText("Saved!")).toBeVisible();
  });
});
