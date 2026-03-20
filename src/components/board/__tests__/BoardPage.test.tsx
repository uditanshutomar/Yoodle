// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Ensure React is globally available for JSX transform in source files
vi.stubGlobal("React", React);

vi.mock("next/dynamic", () => ({
  default: () => {
    return function MockKanbanBoard({ boardId }: { boardId: string }) {
      return <div data-testid="kanban-board">{boardId}</div>;
    };
  },
}));

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
  Kanban: (props: Record<string, unknown>) => <span data-testid="icon-kanban" {...props} />,
  List: (props: Record<string, unknown>) => <span data-testid="icon-list" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <span data-testid="icon-refresh" {...props} />,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import BoardPage from "../BoardPage";

function successResponse(boards: Array<{ _id: string; title: string }>) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true, data: boards }),
  });
}

function errorResponse(status = 500) {
  return Promise.resolve({ ok: false, status });
}

describe("BoardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading skeleton initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<BoardPage />);
    const pulseElements = document.querySelectorAll(".animate-pulse");
    expect(pulseElements.length).toBe(3);
  });

  it('renders "The Board" heading', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<BoardPage />);
    expect(screen.getByText("The Board")).toBeDefined();
  });

  it("shows error state with retry button on fetch failure", async () => {
    mockFetch.mockReturnValueOnce(errorResponse(500));
    render(<BoardPage />);
    await waitFor(() => {
      expect(screen.getByText("HTTP 500")).toBeDefined();
    });
    expect(screen.getByText("Retry")).toBeDefined();
  });

  it("auto-creates a personal board when none exist", async () => {
    // First call: GET /api/boards returns empty
    mockFetch.mockReturnValueOnce(successResponse([]));
    // Second call: POST /api/boards auto-creates a board
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { _id: "auto-board-1", title: "My Board" } }),
      })
    );
    render(<BoardPage />);
    await waitFor(() => {
      expect(screen.getByTestId("kanban-board")).toBeDefined();
    });
    expect(screen.getByTestId("kanban-board").textContent).toBe("auto-board-1");
    // Verify POST was called to create the board
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenLastCalledWith(
      "/api/boards",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows empty state when auto-create fails", async () => {
    // First call: GET returns empty
    mockFetch.mockReturnValueOnce(successResponse([]));
    // Second call: POST fails
    mockFetch.mockReturnValueOnce(Promise.resolve({ ok: false, status: 500 }));
    render(<BoardPage />);
    await waitFor(() => {
      expect(screen.getByText("No board found")).toBeDefined();
    });
  });

  it("shows KanbanBoard when board data loads successfully", async () => {
    mockFetch.mockReturnValueOnce(
      successResponse([{ _id: "board-123", title: "My Board" }])
    );
    render(<BoardPage />);
    await waitFor(() => {
      expect(screen.getByTestId("kanban-board")).toBeDefined();
    });
    expect(screen.getByTestId("kanban-board").textContent).toBe("board-123");
  });

  it('shows "List view coming soon" when switching to list view', async () => {
    mockFetch.mockReturnValueOnce(
      successResponse([{ _id: "board-123", title: "My Board" }])
    );
    render(<BoardPage />);
    await waitFor(() => {
      expect(screen.getByTestId("kanban-board")).toBeDefined();
    });
    fireEvent.click(screen.getByText("List"));
    expect(screen.getByText("List view coming soon")).toBeDefined();
  });

  it("retry button calls fetch again", async () => {
    mockFetch.mockReturnValueOnce(errorResponse(500));
    render(<BoardPage />);
    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeDefined();
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockReturnValueOnce(
      successResponse([{ _id: "board-456", title: "Retried Board" }])
    );
    fireEvent.click(screen.getByText("Retry"));
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.getByTestId("kanban-board")).toBeDefined();
    });
  });
});
