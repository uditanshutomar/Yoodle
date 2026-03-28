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

import ReplaysWidget from "../ReplaysWidget";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReplaysWidget", () => {
  it("shows 3 loading skeletons while fetching", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ReplaysWidget />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons).toHaveLength(3);
  });

  it("shows error message with Retry button on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    render(<ReplaysWidget />);

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

    render(<ReplaysWidget />);

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeTruthy();
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("No past meetings yet")).toBeTruthy();
    });
  });

  it("shows empty state when no past meetings", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    render(<ReplaysWidget />);

    await waitFor(() => {
      expect(screen.getByText("No past meetings yet")).toBeTruthy();
    });
  });

  it("shows meeting list with title and formatted date", async () => {
    const meetings = [
      { _id: "m1", title: "Sprint Review", endTime: "2026-03-15T16:00:00Z" },
      { _id: "m2", title: "Design Sync", scheduledAt: "2026-03-10T09:00:00Z" },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: meetings }),
    });

    render(<ReplaysWidget />);

    await waitFor(() => {
      expect(screen.getByText("Sprint Review")).toBeTruthy();
    });
    expect(screen.getByText("Design Sync")).toBeTruthy();

    // Links should point to meeting detail pages
    const links = screen.getAllByRole("link");
    expect(links[0].getAttribute("href")).toBe("/meetings/m1/recording");
    expect(links[1].getAttribute("href")).toBe("/meetings/m2/recording");
  });

  it("parses nested data.meetings response format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { meetings: [{ _id: "m1", title: "Nested Replay" }] },
      }),
    });

    render(<ReplaysWidget />);

    await waitFor(() => {
      expect(screen.getByText("Nested Replay")).toBeTruthy();
    });
  });

  it("calls fetch with correct URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    render(<ReplaysWidget />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/meetings?status=ended&limit=3",
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });
});
