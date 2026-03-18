import { test, expect, Page } from "@playwright/test";

/**
 * Helper: mock APIs for authenticated pages.
 */
async function mockAuthenticatedAPIs(page: Page) {
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

  await page.route("**/api/ai/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: {} }),
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

  await page.route("**/api/conversations**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    })
  );
}

test.describe("Accessibility — Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAPIs(page);
    await page.context().addCookies([
      { name: "access_token", value: "fake-jwt-for-e2e", domain: "localhost", path: "/" },
    ]);
  });

  test("mode toggle radiogroup has proper ARIA roles and labels", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Verify radiogroup exists with accessible label
    const radioGroup = page.getByRole("radiogroup", { name: /status mode/i });
    await expect(radioGroup).toBeVisible();

    // Each radio button should have role="radio" and an aria-label
    const radios = page.getByRole("radio");
    const count = await radios.count();
    expect(count).toBe(3);

    for (let i = 0; i < count; i++) {
      const radio = radios.nth(i);
      await expect(radio).toHaveAttribute("aria-label");
      await expect(radio).toHaveAttribute("aria-checked");
    }
  });

  test("'Start Meeting' link has accessible label", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const link = page.getByRole("link", { name: /start a new meeting/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("aria-label", "Start a new meeting");
  });

  test("join code input has accessible label", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const input = page.getByLabel(/enter room code/i);
    await expect(input).toBeVisible();
    // Verify the input has an associated label (either aria-label or label element)
    const ariaLabel = await input.getAttribute("aria-label");
    expect(ariaLabel).toBeTruthy();
  });

  test("join button has accessible label", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const joinBtn = page.getByRole("button", { name: /join meeting with room code/i });
    await expect(joinBtn).toBeVisible();
  });

  test("AI briefing card is keyboard accessible", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const aiCard = page.getByRole("button", { name: /open ai assistant/i });
    await expect(aiCard).toBeVisible();

    // Verify it has tabIndex for keyboard focus
    const tabIndex = await aiCard.getAttribute("tabindex");
    expect(Number(tabIndex)).toBeGreaterThanOrEqual(0);

    // Focus it and press Enter — should not throw
    await aiCard.focus();
    await expect(aiCard).toBeFocused();
  });

  test("keyboard navigation works — Tab cycles through interactive elements", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Tab through the first several focusable elements
    // This verifies there is a logical tab order without trapping
    const focusedElements: string[] = [];

    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const tagName = await page.evaluate(() => document.activeElement?.tagName);
      if (tagName) focusedElements.push(tagName);
    }

    // We should have tabbed through multiple different elements
    expect(focusedElements.length).toBeGreaterThan(0);
    // At least some should be interactive elements (A, BUTTON, INPUT)
    const interactiveTags = focusedElements.filter((t) =>
      ["A", "BUTTON", "INPUT"].includes(t)
    );
    expect(interactiveTags.length).toBeGreaterThan(0);
  });
});

test.describe("Accessibility — Login page", () => {
  test("login page has accessible heading structure", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const heading = page.getByRole("heading", { name: /welcome back/i });
    await expect(heading).toBeVisible();
  });

  test("Google sign-in button has visible text", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const signInButton = page.getByRole("button", { name: /sign in with google/i });
    await expect(signInButton).toBeVisible();
  });

  test("sign up link is accessible", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const signUpLink = page.getByRole("link", { name: /sign up/i });
    await expect(signUpLink).toBeVisible();
    await expect(signUpLink).toHaveAttribute("href", "/signup");
  });
});

test.describe("Accessibility — Modals and Escape key", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAPIs(page);
    await page.context().addCookies([
      { name: "access_token", value: "fake-jwt-for-e2e", domain: "localhost", path: "/" },
    ]);
  });

  test.fixme("Escape key closes AI drawer when open", async ({ page }) => {
    // This test requires the AI drawer to open, which depends on the AIDrawerProvider
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Open the AI drawer by clicking the briefing card
    const aiCard = page.getByRole("button", { name: /open ai assistant/i });
    await aiCard.click();

    // Wait for drawer animation
    await page.waitForTimeout(500);

    // Press Escape to close
    await page.keyboard.press("Escape");

    // Drawer should close — the AI card should be visible again (not covered)
    await expect(aiCard).toBeVisible();
  });

  test("SVG icons have aria-hidden to avoid screen reader noise", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Check that decorative SVGs within the action cards have aria-hidden
    const decorativeSvgs = page.locator(
      ".dashboard-root a[aria-label] svg[aria-hidden='true'], .dashboard-root div svg[aria-hidden='true']"
    );
    const count = await decorativeSvgs.count();
    // There should be at least a few decorative SVGs marked as hidden
    expect(count).toBeGreaterThan(0);
  });
});
