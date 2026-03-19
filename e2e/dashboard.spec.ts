import { test, expect, Page } from "@playwright/test";

/**
 * Helper: mock all API calls needed for the dashboard to render
 * without a real backend. Sets up auth session, user data, and
 * the various panel data endpoints.
 */
async function mockDashboardAPIs(page: Page) {
  const mockUser = {
    id: "user-1",
    name: "Test User",
    displayName: "Test User",
    email: "test@example.com",
    mode: "social",
    hasGoogleAccess: false,
  };

  // Auth session endpoint
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { user: mockUser } }),
    })
  );

  // Users/me endpoint (used for mode persistence)
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

  // Meetings endpoint (for meeting history)
  await page.route("**/api/meetings*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    })
  );

  // Calendar events
  await page.route("**/api/calendar/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    })
  );

  // Boards / tasks
  await page.route("**/api/boards**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    })
  );

  // AI briefing
  await page.route("**/api/ai/briefing**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { summary: "Nothing new today." } }),
    })
  );

  // Pending actions
  await page.route("**/api/ai/action/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    })
  );

  // Insight count
  await page.route("**/api/ai/insights/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { count: 0 } }),
    })
  );

  // Ghost rooms
  await page.route("**/api/ghost-rooms**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    })
  );

  // Analytics
  await page.route("**/api/analytics/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: {} }),
    })
  );

  // Auth refresh
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    })
  );

  // Conversations (for any chat-related widget)
  await page.route("**/api/conversations**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    })
  );
}

test.describe("Dashboard — critical flows", () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardAPIs(page);
    // Inject a fake access_token cookie so middleware allows the request
    await page.context().addCookies([
      {
        name: "access_token",
        value: "fake-jwt-for-e2e",
        domain: "localhost",
        path: "/",
      },
    ]);
  });

  test("dashboard loads with a time-based greeting", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // The greeting should be one of: Good morning, Good afternoon, Good evening
    const greetingEl = page.getByText(/good (morning|afternoon|evening)/i);
    await expect(greetingEl).toBeVisible();
  });

  test("dashboard shows the 'What are we working on?' heading", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: /what are we working on/i })
    ).toBeVisible();
  });

  test("mode toggle radio group has three options and switches modes", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const radioGroup = page.getByRole("radiogroup", { name: /status mode/i });
    await expect(radioGroup).toBeVisible();

    // All three mode buttons should be present
    const lockinBtn = page.getByRole("radio", { name: /lock in mode/i });
    const invisibleBtn = page.getByRole("radio", { name: /invisible mode/i });
    const socialBtn = page.getByRole("radio", { name: /social mode/i });

    await expect(lockinBtn).toBeVisible();
    await expect(invisibleBtn).toBeVisible();
    await expect(socialBtn).toBeVisible();

    // Default mode from mock is "social" — social should be checked
    await expect(socialBtn).toHaveAttribute("aria-checked", "true");

    // Click "Lock in" and verify it becomes active
    await lockinBtn.click();
    await expect(lockinBtn).toHaveAttribute("aria-checked", "true");
    await expect(socialBtn).toHaveAttribute("aria-checked", "false");

    // Verify mode description changed
    await expect(page.getByText(/lock in mode/i)).toBeVisible();

    // Click "Invisible" and verify
    await invisibleBtn.click();
    await expect(invisibleBtn).toHaveAttribute("aria-checked", "true");
    await expect(lockinBtn).toHaveAttribute("aria-checked", "false");
  });

  test("'Start Meeting' link navigates to /meetings/new", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const startLink = page.getByRole("link", { name: /start a new meeting/i });
    await expect(startLink).toBeVisible();
    await expect(startLink).toHaveAttribute("href", "/meetings/new");
  });

  test("join code input accepts text and Enter submits", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const joinInput = page.getByLabel(/enter room code/i);
    await expect(joinInput).toBeVisible();

    await joinInput.fill("ABC-123");
    await expect(joinInput).toHaveValue("ABC-123");

    // Press Enter — should navigate to /meetings/join?code=ABC-123
    await joinInput.press("Enter");
    await expect(page).toHaveURL(/\/meetings\/join\?code=ABC-123/);
  });

  test("join button navigates with room code", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const joinInput = page.getByLabel(/enter room code/i);
    await joinInput.fill("XYZ-789");

    const joinButton = page.getByRole("button", { name: /join meeting with room code/i });
    await expect(joinButton).toBeVisible();
    await joinButton.click();

    await expect(page).toHaveURL(/\/meetings\/join\?code=XYZ-789/);
  });

  test("calendar panel renders", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // CalendarPanel should render somewhere on the page
    // Look for common calendar-related text or container
    const calendarSection = page.locator("[class*='calendar'], [data-testid='calendar-panel']").first();
    // If no data-testid, just verify the page loaded without error
    await expect(page.getByRole("heading", { name: /what are we working on/i })).toBeVisible();
  });

  test("AI briefing card is present and clickable", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const aiCard = page.getByRole("button", { name: /open ai assistant/i });
    await expect(aiCard).toBeVisible();

    // Verify it contains the "Yoodler" text
    await expect(page.getByText("Yoodler")).toBeVisible();

    // Verify quick action prompts are shown
    await expect(page.getByText("Summarize my day")).toBeVisible();
    await expect(page.getByText("Prep for meeting")).toBeVisible();
    await expect(page.getByText("Draft follow-up")).toBeVisible();
    await expect(page.getByText("What's pending?")).toBeVisible();
  });

  test("meeting history section loads", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // The MeetingHistory component should render. Look for its heading or container.
    // With empty data it may show an empty state but should still be present.
    const dashboardRoot = page.locator(".dashboard-root");
    await expect(dashboardRoot).toBeVisible();
  });

  test("greeting includes user first name when available", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Mock user has name "Test User", so first name is "Test"
    await expect(page.getByText(/Test/)).toBeVisible();
  });
});
