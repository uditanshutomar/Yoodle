// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("React", React);

import StickyBoardWidget from "../StickyBoardWidget";

describe("StickyBoardWidget", () => {
  it("renders empty state message", () => {
    render(<StickyBoardWidget />);

    expect(screen.getByText("Connect a board in Preferences")).toBeDefined();
    expect(screen.getByText("Your tasks will appear here")).toBeDefined();
  });

  it("shows StickyNote icon with aria-hidden", () => {
    const { container } = render(<StickyBoardWidget />);

    const icon = container.querySelector('[aria-hidden="true"]');
    expect(icon).not.toBeNull();
  });
});
