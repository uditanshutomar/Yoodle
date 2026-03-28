// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubGlobal("React", React);

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("framer-motion", () => {
  const motionKeys = new Set(["whileHover", "whileTap", "whileDrag", "whileFocus", "whileInView", "initial", "animate", "exit", "transition", "variants", "drag", "dragConstraints", "dragElastic", "dragMomentum", "layout", "layoutId"]);
  const filterMotionProps = (props: Record<string, unknown>) => {
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (!motionKeys.has(k)) filtered[k] = v;
    }
    return filtered;
  };
  return {
    motion: {
      div: ({ children, ...props }: Record<string, unknown>) => <div {...filterMotionProps(props)}>{children}</div>,
      button: ({ children, ...props }: Record<string, unknown>) => (
        <button {...filterMotionProps(props)}>{children as React.ReactNode}</button>
      ),
    },
  };
});

import LaunchpadWidget from "../LaunchpadWidget";

describe("LaunchpadWidget", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders "Start a Room" button', () => {
    render(<LaunchpadWidget />);
    expect(screen.getByText("Start a Room")).toBeDefined();
  });

  it("renders join code input", () => {
    render(<LaunchpadWidget />);
    expect(screen.getByLabelText("Enter room code")).toBeDefined();
  });

  it("Start a Room navigates to /meetings/new on click", () => {
    render(<LaunchpadWidget />);
    fireEvent.click(screen.getByText("Start a Room"));
    expect(mockPush).toHaveBeenCalledWith("/meetings/new");
  });
});
