// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("React", React);

import TheFeedWidget from "../TheFeedWidget";

describe("TheFeedWidget", () => {
  it("renders coming soon message", () => {
    render(<TheFeedWidget />);

    expect(screen.getByText("Coming soon")).toBeDefined();
    expect(
      screen.getByText("Workspace activity will appear here"),
    ).toBeDefined();
  });

  it("shows Rss icon with aria-hidden", () => {
    const { container } = render(<TheFeedWidget />);

    const icon = container.querySelector('[aria-hidden="true"]');
    expect(icon).not.toBeNull();
  });
});
