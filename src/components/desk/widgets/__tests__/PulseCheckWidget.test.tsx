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

import PulseCheckWidget from "../PulseCheckWidget";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PulseCheckWidget", () => {
  it("shows 4 loading skeletons in a grid while fetching", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<PulseCheckWidget />);
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons).toHaveLength(4);
  });

  it("shows error message with Retry button on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    render(<PulseCheckWidget />);

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

    render(<PulseCheckWidget />);

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeTruthy();
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { totalMeetings: 5, avgScore: 80, totalDecisions: 3, totalActionItems: 7 },
      }),
    });

    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("Meetings")).toBeTruthy();
    });
  });

  it("shows 'Unexpected data format' when totalMeetings is not a number", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { totalMeetings: "not-a-number" } }),
    });

    render(<PulseCheckWidget />);

    await waitFor(() => {
      expect(screen.getByText("Unexpected data format")).toBeTruthy();
    });
  });

  it("shows 'Unexpected data format' when data is null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: null }),
    });

    render(<PulseCheckWidget />);

    await waitFor(() => {
      expect(screen.getByText("Unexpected data format")).toBeTruthy();
    });
  });

  it("shows stats grid with Meetings, Vibe Check, Decisions, and Actions", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          totalMeetings: 12,
          avgScore: 75,
          totalDecisions: 8,
          totalActionItems: 15,
        },
      }),
    });

    render(<PulseCheckWidget />);

    await waitFor(() => {
      expect(screen.getByText("Meetings")).toBeTruthy();
    });
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Vibe Check")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("Decisions")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("Actions")).toBeTruthy();
    expect(screen.getByText("15")).toBeTruthy();
  });

  it("shows green color for Vibe Check when avgScore >= 70", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { totalMeetings: 5, avgScore: 85, totalDecisions: 2, totalActionItems: 3 },
      }),
    });

    render(<PulseCheckWidget />);

    await waitFor(() => {
      expect(screen.getByText("85%")).toBeTruthy();
    });

    const vibeValue = screen.getByText("85%");
    expect(vibeValue.className).toContain("text-green-600");
  });

  it("shows yellow color for Vibe Check when avgScore >= 40 and < 70", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { totalMeetings: 5, avgScore: 55, totalDecisions: 2, totalActionItems: 3 },
      }),
    });

    render(<PulseCheckWidget />);

    await waitFor(() => {
      expect(screen.getByText("55%")).toBeTruthy();
    });

    const vibeValue = screen.getByText("55%");
    expect(vibeValue.className).toContain("text-yellow-600");
  });

  it("shows red color for Vibe Check when avgScore < 40", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { totalMeetings: 5, avgScore: 25, totalDecisions: 1, totalActionItems: 2 },
      }),
    });

    render(<PulseCheckWidget />);

    await waitFor(() => {
      expect(screen.getByText("25%")).toBeTruthy();
    });

    const vibeValue = screen.getByText("25%");
    expect(vibeValue.className).toContain("text-[#FF6B6B]");
  });

  it("defaults missing fields to 0", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { totalMeetings: 3 },
      }),
    });

    render(<PulseCheckWidget />);

    await waitFor(() => {
      expect(screen.getByText("Meetings")).toBeTruthy();
    });
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy(); // avgScore defaults to 0
  });

  it("calls fetch with correct URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { totalMeetings: 1, avgScore: 50, totalDecisions: 0, totalActionItems: 0 },
      }),
    });

    render(<PulseCheckWidget />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/meetings/analytics/trends?range=month",
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });
});
