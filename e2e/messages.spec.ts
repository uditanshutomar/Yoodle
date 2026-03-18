import { test, expect, Page } from "@playwright/test";

/**
 * Helper: mock APIs needed for the messages page.
 */
async function mockMessagesAPIs(page: Page) {
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

  await page.route("**/api/ai/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: {} }),
    })
  );
}

test.describe("Messages page — empty state", () => {
  test.beforeEach(async ({ page }) => {
    await mockMessagesAPIs(page);

    // Return empty conversations list
    await page.route("**/api/conversations**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: [] }),
      })
    );

    await page.context().addCookies([
      { name: "access_token", value: "fake-jwt-for-e2e", domain: "localhost", path: "/" },
    ]);
  });

  test("messages page loads", async ({ page }) => {
    await page.goto("/messages");
    await page.waitForLoadState("networkidle");

    // The page should not redirect away (user is authenticated)
    await expect(page).toHaveURL(/\/messages/);
  });

  test("desktop empty state shows 'Select a conversation' prompt", async ({ page }) => {
    // This test only applies to wider viewports
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/messages");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/select a conversation/i)).toBeVisible();
  });
});

test.describe("Messages page — with conversations", () => {
  test.beforeEach(async ({ page }) => {
    await mockMessagesAPIs(page);

    const mockConversations = [
      {
        _id: "conv-1",
        participants: [
          { _id: "user-1", name: "Test User", displayName: "Test User" },
          { _id: "user-2", name: "Alice Smith", displayName: "Alice Smith" },
        ],
        lastMessage: {
          _id: "msg-1",
          content: "Hey, how's it going?",
          sender: "user-2",
          createdAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        _id: "conv-2",
        participants: [
          { _id: "user-1", name: "Test User", displayName: "Test User" },
          { _id: "user-3", name: "Bob Jones", displayName: "Bob Jones" },
        ],
        lastMessage: {
          _id: "msg-2",
          content: "Meeting at 3pm tomorrow",
          sender: "user-1",
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
        updatedAt: new Date(Date.now() - 3600000).toISOString(),
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ];

    await page.route("**/api/conversations**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: mockConversations }),
      })
    );

    await page.context().addCookies([
      { name: "access_token", value: "fake-jwt-for-e2e", domain: "localhost", path: "/" },
    ]);
  });

  test("messages page shows conversation list with participant names", async ({ page }) => {
    await page.goto("/messages");
    await page.waitForLoadState("networkidle");

    // Should display conversation participants
    await expect(page.getByText("Alice Smith")).toBeVisible();
    await expect(page.getByText("Bob Jones")).toBeVisible();
  });

  test("conversation list shows last message preview", async ({ page }) => {
    await page.goto("/messages");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/how's it going/i)).toBeVisible();
  });
});
