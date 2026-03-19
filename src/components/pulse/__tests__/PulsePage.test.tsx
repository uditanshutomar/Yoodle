// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Ensure React is globally available for JSX transform in source files
vi.stubGlobal("React", React);

vi.mock("framer-motion", () => {
  const motionKeys = ["whileHover", "whileTap", "initial", "animate", "exit", "transition", "variants"];
  const filterMotionProps = (props: Record<string, unknown>) => {
    const filtered = { ...props };
    for (const key of motionKeys) delete filtered[key];
    return filtered;
  };
  return {
    motion: {
      div: ({ children, ...props }: Record<string, unknown>) => <div {...filterMotionProps(props)}>{children}</div>,
      button: ({ children, ...props }: Record<string, unknown>) => <button {...filterMotionProps(props as Record<string, unknown>)}>{children as React.ReactNode}</button>,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("lucide-react", () => ({
  Activity: (props: Record<string, unknown>) => <span data-testid="icon-activity" {...props} />,
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="icon-alert" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <span data-testid="icon-refresh" {...props} />,
  BarChart3: (props: Record<string, unknown>) => <span data-testid="icon-bar" {...props} />,
  CheckSquare: (props: Record<string, unknown>) => <span data-testid="icon-check" {...props} />,
  Users: (props: Record<string, unknown>) => <span data-testid="icon-users" {...props} />,
  Clock: (props: Record<string, unknown>) => <span data-testid="icon-clock" {...props} />,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import PulsePage from "../PulsePage";

function pulseResponse(data: Record<string, unknown>) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true, data }),
  });
}

function errorResponse(status = 500) {
  return Promise.resolve({ ok: false, status });
}

const sampleData = {
  totalMeetings: 12,
  avgScore: 75,
  totalDecisions: 8,
  totalActionItems: 15,
  avgDuration: 45,
  patterns: [
    { type: "trend", message: "Meetings are getting longer", severity: "warning" },
    { type: "alert", message: "Low participation detected", severity: "critical" },
  ],
};

describe("PulsePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders "Pulse" heading and "Your workspace heartbeat" subtitle', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<PulsePage />);
    expect(screen.getByText("Pulse")).toBeDefined();
    expect(screen.getByText("Your workspace heartbeat")).toBeDefined();
  });

  it("shows range selector with Week/Month/Quarter buttons", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<PulsePage />);
    expect(screen.getByText("Week")).toBeDefined();
    expect(screen.getByText("Month")).toBeDefined();
    expect(screen.getByText("Quarter")).toBeDefined();
  });

  it("shows loading state initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<PulsePage />);
    const pulseElements = document.querySelectorAll(".animate-pulse");
    expect(pulseElements.length).toBe(4);
  });

  it("shows error state with retry on fetch failure", async () => {
    mockFetch.mockReturnValueOnce(errorResponse(500));
    render(<PulsePage />);
    await waitFor(() => {
      expect(screen.getByText("Failed to load analytics")).toBeDefined();
    });
    expect(screen.getByText("Retry")).toBeDefined();
  });

  it("shows empty state when totalMeetings is 0", async () => {
    mockFetch.mockReturnValueOnce(
      pulseResponse({ ...sampleData, totalMeetings: 0 })
    );
    render(<PulsePage />);
    await waitFor(() => {
      expect(screen.getByText("No meeting data yet")).toBeDefined();
    });
  });

  it("shows stats cards with correct values", async () => {
    mockFetch.mockReturnValueOnce(pulseResponse(sampleData));
    render(<PulsePage />);
    await waitFor(() => {
      expect(screen.getByText("Meetings")).toBeDefined();
    });
    expect(screen.getByText("12")).toBeDefined();
    expect(screen.getByText("Avg Vibe Check")).toBeDefined();
    expect(screen.getByText("75")).toBeDefined();
    expect(screen.getByText("Decisions")).toBeDefined();
    expect(screen.getByText("8")).toBeDefined();
    expect(screen.getByText("Action Items")).toBeDefined();
    expect(screen.getByText("15")).toBeDefined();
  });

  it("shows Heads Up patterns section", async () => {
    mockFetch.mockReturnValueOnce(pulseResponse(sampleData));
    render(<PulsePage />);
    await waitFor(() => {
      expect(screen.getByText("Heads Up")).toBeDefined();
    });
    expect(screen.getByText("Meetings are getting longer")).toBeDefined();
    expect(screen.getByText("Low participation detected")).toBeDefined();
  });

  it("changing range triggers new fetch", async () => {
    mockFetch.mockReturnValueOnce(pulseResponse(sampleData));
    render(<PulsePage />);
    await waitFor(() => {
      expect(screen.getByText("Meetings")).toBeDefined();
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/meetings/analytics/trends?range=week",
      expect.objectContaining({ credentials: "include" })
    );

    mockFetch.mockReturnValueOnce(pulseResponse({ ...sampleData, totalMeetings: 20 }));
    fireEvent.click(screen.getByText("Month"));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
    expect(mockFetch).toHaveBeenLastCalledWith(
      "/api/meetings/analytics/trends?range=month",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it('shows "Unexpected data format" when data shape is wrong', async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { foo: "bar" } }),
      })
    );
    render(<PulsePage />);
    await waitFor(() => {
      expect(screen.getByText("Unexpected data format")).toBeDefined();
    });
  });
});
