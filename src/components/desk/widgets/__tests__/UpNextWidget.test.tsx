// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

import UpNextWidget from "../UpNextWidget";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UpNextWidget", () => {
  it("shows 3 loading skeletons while fetching", () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<UpNextWidget />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons).toHaveLength(3);
  });

  it("shows error message on fetch failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    render(<UpNextWidget />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load (500)")).toBeTruthy();
    });
  });

  it("shows empty state with 'Start a Room' link when no meetings", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    render(<UpNextWidget />);

    await waitFor(() => {
      expect(screen.getByText("No upcoming meetings")).toBeTruthy();
    });

    const link = screen.getByText(/Start a Room/);
    expect(link.closest("a")).toBeTruthy();
    expect(link.closest("a")?.getAttribute("href")).toBe("/meetings/new");
  });

  it("shows meeting list with title and formatted time", async () => {
    const meetings = [
      { _id: "m1", title: "Standup", scheduledAt: "2026-03-19T10:00:00Z" },
      { _id: "m2", title: "Retro", startTime: "2026-03-19T14:30:00Z" },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: meetings }),
    });

    render(<UpNextWidget />);

    await waitFor(() => {
      expect(screen.getByText("Standup")).toBeTruthy();
    });
    expect(screen.getByText("Retro")).toBeTruthy();

    // Links should point to meeting detail pages
    const links = screen.getAllByRole("link");
    expect(links[0].getAttribute("href")).toBe("/meetings/m1");
    expect(links[1].getAttribute("href")).toBe("/meetings/m2");
  });

  it("parses nested data.meetings response format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { meetings: [{ _id: "m1", title: "Nested Meeting" }] },
      }),
    });

    render(<UpNextWidget />);

    await waitFor(() => {
      expect(screen.getByText("Nested Meeting")).toBeTruthy();
    });
  });

  it("parses top-level meetings response format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        meetings: [{ _id: "m1", title: "Top Level" }],
      }),
    });

    render(<UpNextWidget />);

    await waitFor(() => {
      expect(screen.getByText("Top Level")).toBeTruthy();
    });
  });

  it("calls fetch with correct URL and credentials", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    render(<UpNextWidget />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/meetings?status=scheduled&limit=5",
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });
});
