// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("React", React);

import YoodlerSaysWidget from "../YoodlerSaysWidget";

describe("YoodlerSaysWidget", () => {
  it("renders without crashing", () => {
    render(<YoodlerSaysWidget />);
  });

  it("shows all 3 suggestion texts", () => {
    render(<YoodlerSaysWidget />);

    expect(
      screen.getByText("You have meetings today — check your Rooms"),
    ).toBeDefined();
    expect(
      screen.getByText("3 stickies are overdue on The Board"),
    ).toBeDefined();
    expect(
      screen.getByText(/Your Vibe Check trend is improving/),
    ).toBeDefined();
  });

  it("has sparkle icons that are aria-hidden", () => {
    const { container } = render(<YoodlerSaysWidget />);

    const hiddenIcons = container.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenIcons.length).toBe(3);
  });
});
