// @vitest-environment jsdom
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubGlobal("React", React);

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import StickyBoardWidget from "../StickyBoardWidget";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StickyBoardWidget", () => {
  it("shows loading skeletons while fetching", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { container } = render(<StickyBoardWidget />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons).toHaveLength(3);
  });

  it("shows empty state when no boards exist", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    render(<StickyBoardWidget />);

    await waitFor(() => {
      expect(screen.getByText("No tasks yet")).toBeDefined();
    });
  });

  it("shows tasks when board has tasks", async () => {
    // First call: boards
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [{ _id: "b1", name: "My Board" }] }),
    });
    // Second call: tasks
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          { _id: "t1", title: "Fix bug", status: "todo" },
          { _id: "t2", title: "Add feature", status: "in-progress" },
        ],
      }),
    });

    render(<StickyBoardWidget />);

    await waitFor(() => {
      expect(screen.getByText("Fix bug")).toBeDefined();
    });
    expect(screen.getByText("Add feature")).toBeDefined();
  });
});
