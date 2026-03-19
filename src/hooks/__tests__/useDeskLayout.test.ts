// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { useDeskLayout } from "../useDeskLayout";
import {
  DEFAULT_LAYOUT,
  WIDGET_REGISTRY,
} from "@/components/desk/widget-registry";

const STORAGE_KEY = "yoodle:desk-layout";

const mockStorage: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, val: string) => {
    mockStorage[key] = val;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  }),
});

beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDeskLayout", () => {
  // 1. Returns DEFAULT_LAYOUT when localStorage is empty
  it("returns DEFAULT_LAYOUT when localStorage is empty", () => {
    const { result } = renderHook(() => useDeskLayout());
    expect(result.current.layout).toEqual(DEFAULT_LAYOUT);
  });

  // 2. Returns DEFAULT_LAYOUT when localStorage has invalid JSON
  it("returns DEFAULT_LAYOUT when localStorage has invalid JSON", () => {
    mockStorage[STORAGE_KEY] = "not-valid-json{{{";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useDeskLayout());
    expect(result.current.layout).toEqual(DEFAULT_LAYOUT);
    expect(warnSpy).toHaveBeenCalledWith(
      "[useDeskLayout] Failed to parse saved layout:",
      expect.any(SyntaxError),
    );
    warnSpy.mockRestore();
  });

  // 3. Returns DEFAULT_LAYOUT when localStorage has empty array
  it("returns DEFAULT_LAYOUT when localStorage has empty array", () => {
    mockStorage[STORAGE_KEY] = JSON.stringify([]);
    const { result } = renderHook(() => useDeskLayout());
    expect(result.current.layout).toEqual(DEFAULT_LAYOUT);
  });

  // 4. Returns DEFAULT_LAYOUT when items fail validation (missing fields)
  it("returns DEFAULT_LAYOUT when items fail validation", () => {
    mockStorage[STORAGE_KEY] = JSON.stringify([
      { i: "up-next", x: 0 }, // missing y, w, h
    ]);
    const { result } = renderHook(() => useDeskLayout());
    expect(result.current.layout).toEqual(DEFAULT_LAYOUT);
  });

  // 5. Returns saved layout when localStorage has valid data
  it("returns saved layout when localStorage has valid data", () => {
    const saved = [
      { i: "up-next", x: 0, y: 0, w: 12, h: 4 },
      { i: "buzz", x: 0, y: 4, w: 6, h: 2 },
    ];
    mockStorage[STORAGE_KEY] = JSON.stringify(saved);
    const { result } = renderHook(() => useDeskLayout());
    expect(result.current.layout).toEqual(saved);
  });

  // 6. addWidget adds a new widget at bottom of grid with correct metadata
  it("addWidget adds a new widget at bottom of grid", () => {
    const { result } = renderHook(() => useDeskLayout());

    // Remove "buzz" first so we can add it back
    act(() => {
      result.current.removeWidget("buzz");
    });

    const layoutBeforeAdd = result.current.layout;
    const maxY = layoutBeforeAdd.reduce(
      (max, item) => Math.max(max, item.y + item.h),
      0,
    );

    act(() => {
      result.current.addWidget("buzz");
    });

    const added = result.current.layout.find((item) => item.i === "buzz");
    expect(added).toBeDefined();
    expect(added!.x).toBe(0);
    expect(added!.y).toBe(maxY);
    expect(added!.w).toBe(WIDGET_REGISTRY["buzz"].defaultW);
    expect(added!.h).toBe(WIDGET_REGISTRY["buzz"].defaultH);
    expect(added!.minW).toBe(WIDGET_REGISTRY["buzz"].minW);
    expect(added!.minH).toBe(WIDGET_REGISTRY["buzz"].minH);
  });

  // 7. addWidget does NOT add duplicate widgets
  it("addWidget does not add duplicate widgets", () => {
    const { result } = renderHook(() => useDeskLayout());
    const lengthBefore = result.current.layout.length;

    // "up-next" is already in DEFAULT_LAYOUT
    act(() => {
      result.current.addWidget("up-next");
    });

    expect(result.current.layout.length).toBe(lengthBefore);
  });

  // 8. addWidget does NOT add unknown widget IDs
  it("addWidget does not add unknown widget IDs", () => {
    const { result } = renderHook(() => useDeskLayout());
    const lengthBefore = result.current.layout.length;

    act(() => {
      result.current.addWidget("nonexistent-widget");
    });

    expect(result.current.layout.length).toBe(lengthBefore);
  });

  // 9. removeWidget removes a widget from layout
  it("removeWidget removes a widget from layout", () => {
    const { result } = renderHook(() => useDeskLayout());

    expect(result.current.layout.some((item) => item.i === "up-next")).toBe(
      true,
    );

    act(() => {
      result.current.removeWidget("up-next");
    });

    expect(result.current.layout.some((item) => item.i === "up-next")).toBe(
      false,
    );
    // Also persists immediately
    expect(localStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.any(String),
    );
  });

  // 10. resetLayout restores DEFAULT_LAYOUT
  it("resetLayout restores DEFAULT_LAYOUT", () => {
    const { result } = renderHook(() => useDeskLayout());

    act(() => {
      result.current.removeWidget("up-next");
      result.current.removeWidget("buzz");
    });

    expect(result.current.layout.length).toBeLessThan(DEFAULT_LAYOUT.length);

    act(() => {
      result.current.resetLayout();
    });

    expect(result.current.layout).toEqual(DEFAULT_LAYOUT);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify(DEFAULT_LAYOUT),
    );
  });

  // 11. updateLayout updates layout and debounces localStorage persistence
  it("updateLayout debounces localStorage persistence by 400ms", () => {
    const { result } = renderHook(() => useDeskLayout());

    const newLayout = [{ i: "up-next", x: 0, y: 0, w: 12, h: 4 }];

    act(() => {
      result.current.updateLayout(newLayout);
    });

    // Layout state updates immediately
    expect(result.current.layout).toEqual(newLayout);

    // localStorage should NOT have been called yet for the debounced persist
    const setItemCalls = (localStorage.setItem as ReturnType<typeof vi.fn>).mock
      .calls;
    const debounceCallsBefore = setItemCalls.filter(
      ([key]: [string]) => key === STORAGE_KEY,
    );
    expect(debounceCallsBefore).toHaveLength(0);

    // Advance timers past debounce period
    act(() => {
      vi.advanceTimersByTime(400);
    });

    const setItemCallsAfter = (
      localStorage.setItem as ReturnType<typeof vi.fn>
    ).mock.calls;
    const debounceCallsAfter = setItemCallsAfter.filter(
      ([key]: [string]) => key === STORAGE_KEY,
    );
    expect(debounceCallsAfter).toHaveLength(1);
    expect(debounceCallsAfter[0][1]).toBe(JSON.stringify(newLayout));
  });

  // 12. editMode starts as false
  it("editMode starts as false", () => {
    const { result } = renderHook(() => useDeskLayout());
    expect(result.current.editMode).toBe(false);
  });
});
