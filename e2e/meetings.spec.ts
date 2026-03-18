import { test, expect, Page } from "@playwright/test";

/**
 * Helper: mock APIs needed for the meetings pages.
 */
async function mockMeetingsAPIs(page: Page) {
  const mockUser = {
    id: "user-1",
    name: "Test User",
    displayName: "Test User",
    email: "test@example.com",
    mode: "social",
  };

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { user: mockUser } }),
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

  await page.route("**/api/meetings/templates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
          {
            _id: "tmpl-1",
            name: "Weekly Standup",
            description: "Quick team sync",
            defaultDuration: 15,
            meetingSettings: { waitingRoom: false, muteOnJoin: true },
          },
          {
            _id: "tmpl-2",
            name: "Design Review",
            description: "Review design work",
            defaultDuration: 45,
            meetingSettings: { waitingRoom: true, muteOnJoin: false },
          },
        ],
      }),
    })
  );

  // Meetings list — return a mix of upcoming and past meetings
  await page.route("**/api/meetings", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            _id: "meeting-new",
            code: "ABC-123",
            title: "New Meeting",
            status: "scheduled",
          },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
          {
            _id: "meeting-1",
            title: "Team Standup",
            code: "MTG-001",
            status: "scheduled",
            type: "regular",
            scheduledAt: new Date(Date.now() + 3600000).toISOString(),
            participants: ["user-1", "user-2"],
            createdAt: new Date().toISOString(),
          },
          {
            _id: "meeting-2",
            title: "Past Sprint Review",
            code: "MTG-002",
            status: "ended",
            type: "regular",
            startedAt: new Date(Date.now() - 7200000).toISOString(),
            endedAt: new Date(Date.now() - 3600000).toISOString(),
            participants: ["user-1"],
            createdAt: new Date(Date.now() - 86400000).toISOString(),
          },
        ],
      }),
    });
  });

  // Ghost rooms
  await page.route("**/api/ghost-rooms**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    })
  );

  // AI / insights / conversations — silence background requests
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
}

test.describe("Meetings list page", () => {
  test.beforeEach(async ({ page }) => {
    await mockMeetingsAPIs(page);
    await page.context().addCookies([
      { name: "access_token", value: "fake-jwt-for-e2e", domain: "localhost", path: "/" },
    ]);
  });

  test("meetings page loads with heading and New Meeting button", async ({ page }) => {
    await page.goto("/meetings");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: /meetings/i })
    ).toBeVisible();

    // New Meeting dropdown trigger
    await expect(page.getByRole("button", { name: /new meeting/i })).toBeVisible();
  });

  test("meetings page shows tab bar with Upcoming, Past, and Ghost Rooms", async ({ page }) => {
    await page.goto("/meetings");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: /upcoming/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /past/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /ghost rooms/i })).toBeVisible();
  });

  test("upcoming tab shows scheduled meetings from mock data", async ({ page }) => {
    await page.goto("/meetings");
    await page.waitForLoadState("networkidle");

    // Should show the scheduled meeting card
    await expect(page.getByText("Team Standup")).toBeVisible();
    await expect(page.getByText("MTG-001")).toBeVisible();
  });

  test("past tab shows ended meetings", async ({ page }) => {
    await page.goto("/meetings");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /past/i }).click();

    // Should show the ended meeting
    await expect(page.getByText("Past Sprint Review")).toBeVisible();
  });

  test("ghost rooms tab shows empty state when no ghost rooms exist", async ({ page }) => {
    await page.goto("/meetings");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /ghost rooms/i }).click();

    await expect(page.getByText(/no ghost rooms/i)).toBeVisible();
  });
});

test.describe("New Meeting page", () => {
  test.beforeEach(async ({ page }) => {
    await mockMeetingsAPIs(page);
    await page.context().addCookies([
      { name: "access_token", value: "fake-jwt-for-e2e", domain: "localhost", path: "/" },
    ]);
  });

  test("new meeting page has form fields", async ({ page }) => {
    await page.goto("/meetings/new");
    await page.waitForLoadState("networkidle");

    // Heading
    await expect(
      page.getByRole("heading", { name: /new meeting/i })
    ).toBeVisible();

    // Title input
    const titleInput = page.getByLabel(/meeting title/i);
    await expect(titleInput).toBeVisible();

    // Description textarea
    const descriptionField = page.getByPlaceholder(/what's this meeting about/i);
    await expect(descriptionField).toBeVisible();

    // Start Now and Schedule buttons
    await expect(page.getByRole("button", { name: /start now/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /schedule for later/i })).toBeVisible();
  });

  test("new meeting form has meeting settings section", async ({ page }) => {
    await page.goto("/meetings/new");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Meeting Settings")).toBeVisible();
    await expect(page.getByText("Allow Recording")).toBeVisible();
    await expect(page.getByText("Allow Screen Share")).toBeVisible();
    await expect(page.getByText("Waiting Room")).toBeVisible();
    await expect(page.getByText("Mute on Join")).toBeVisible();
  });

  test("schedule for later reveals datetime picker", async ({ page }) => {
    await page.goto("/meetings/new");
    await page.waitForLoadState("networkidle");

    // Initially no datetime picker visible
    const datetimePicker = page.locator("input[type='datetime-local']");
    await expect(datetimePicker).not.toBeVisible();

    // Click "Schedule for Later"
    await page.getByRole("button", { name: /schedule for later/i }).click();

    // Datetime picker should now appear
    await expect(datetimePicker).toBeVisible();
  });

  test("create meeting form validates required title for scheduled meetings", async ({ page }) => {
    await page.goto("/meetings/new");
    await page.waitForLoadState("networkidle");

    // Click "Schedule for Later" first
    await page.getByRole("button", { name: /schedule for later/i }).click();

    // Leave title empty and click Schedule Meeting
    await page.getByRole("button", { name: /schedule meeting/i }).click();

    // Should show validation error
    await expect(page.getByText(/please enter a meeting title/i)).toBeVisible();

    // Should stay on the same page
    await expect(page).toHaveURL(/\/meetings\/new/);
  });

  test("back button links to meetings list", async ({ page }) => {
    await page.goto("/meetings/new");
    await page.waitForLoadState("networkidle");

    const backLink = page.getByRole("link", { name: /back/i });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("href", "/meetings");
  });

  test("template dropdown renders when templates are available", async ({ page }) => {
    await page.goto("/meetings/new");
    await page.waitForLoadState("networkidle");

    // The template picker should appear since our mock returns templates
    const templateButton = page.getByText(/choose a template/i);
    await expect(templateButton).toBeVisible();

    // Click to open dropdown
    await templateButton.click();

    // Should see the template options from our mock
    await expect(page.getByText("Weekly Standup")).toBeVisible();
    await expect(page.getByText("Design Review")).toBeVisible();
  });
});
