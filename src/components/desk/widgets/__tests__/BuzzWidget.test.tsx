// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/dashboard",
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import BuzzWidget from "../BuzzWidget";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BuzzWidget", () => {
  it("shows 3 loading skeletons while fetching", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { container } = render(<BuzzWidget />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons).toHaveLength(3);
  });

  it("shows error message with Retry button on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    render(<BuzzWidget />);

    await waitFor(() => {
      expect(screen.getByText("Failed (500)")).toBeTruthy();
    });
    expect(screen.getByText("Retry")).toBeTruthy();
  });

  it("retries fetch when Retry button is clicked", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    render(<BuzzWidget />);

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeTruthy();
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("No conversations yet")).toBeTruthy();
    });
  });

  it("shows empty state when no conversations", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    render(<BuzzWidget />);

    await waitFor(() => {
      expect(screen.getByText("No conversations yet")).toBeTruthy();
    });
  });

  it("shows conversation list with name, lastMessage, and unread badge", async () => {
    const conversations = [
      {
        _id: "c1",
        name: "Team Chat",
        participants: [{ name: "Alice" }],
        unreadCount: 3,
        lastMessage: { content: "Hey everyone!" },
      },
      {
        _id: "c2",
        name: null,
        participants: [{ name: "Bob", displayName: "Bobby" }, { name: "Carol" }],
        unreadCount: 0,
        lastMessage: { content: "See you later" },
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: conversations }),
    });

    render(<BuzzWidget />);

    await waitFor(() => {
      expect(screen.getByText("Team Chat")).toBeTruthy();
    });
    expect(screen.getByText("Hey everyone!")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy(); // unread badge

    // Second conversation falls back to participant names
    expect(screen.getByText("Bobby, Carol")).toBeTruthy();
    expect(screen.getByText("See you later")).toBeTruthy();

    // No badge for 0 unread
    const badges = screen.queryAllByText("0");
    expect(badges).toHaveLength(0);
  });

  it("slices to maximum 3 conversations", async () => {
    const conversations = [
      { _id: "c1", name: "Chat 1", participants: [], unreadCount: 0 },
      { _id: "c2", name: "Chat 2", participants: [], unreadCount: 0 },
      { _id: "c3", name: "Chat 3", participants: [], unreadCount: 0 },
      { _id: "c4", name: "Chat 4", participants: [], unreadCount: 0 },
      { _id: "c5", name: "Chat 5", participants: [], unreadCount: 0 },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: conversations }),
    });

    render(<BuzzWidget />);

    await waitFor(() => {
      expect(screen.getByText("Chat 1")).toBeTruthy();
    });
    expect(screen.getByText("Chat 2")).toBeTruthy();
    expect(screen.getByText("Chat 3")).toBeTruthy();
    expect(screen.queryByText("Chat 4")).toBeNull();
    expect(screen.queryByText("Chat 5")).toBeNull();
  });

  it("calls fetch with correct URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    render(<BuzzWidget />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/conversations",
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });
});
