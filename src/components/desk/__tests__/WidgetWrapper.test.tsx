// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("React", React);

import { Sparkles } from "lucide-react";
import WidgetWrapper from "../WidgetWrapper";
import type { WidgetMeta } from "../widget-registry";

const mockMeta: WidgetMeta = {
  id: "test-widget",
  title: "Test Widget",
  icon: Sparkles,
  minW: 3,
  minH: 2,
  defaultW: 4,
  defaultH: 2,
  description: "A test widget",
};

describe("WidgetWrapper", () => {
  it("renders title and children", () => {
    render(
      <WidgetWrapper meta={mockMeta}>
        <p>Child content</p>
      </WidgetWrapper>,
    );

    expect(screen.getByText("Test Widget")).toBeDefined();
    expect(screen.getByText("Child content")).toBeDefined();
  });

  it("shows remove button in edit mode", () => {
    const onRemove = vi.fn();
    render(
      <WidgetWrapper meta={mockMeta} editMode onRemove={onRemove}>
        <p>Child</p>
      </WidgetWrapper>,
    );

    expect(screen.getByLabelText("Remove Test Widget widget")).toBeDefined();
  });

  it("hides remove button when not in edit mode", () => {
    render(
      <WidgetWrapper meta={mockMeta} onRemove={() => {}}>
        <p>Child</p>
      </WidgetWrapper>,
    );

    expect(
      screen.queryByLabelText("Remove Test Widget widget"),
    ).toBeNull();
  });

  it("calls onRemove when remove button clicked", () => {
    const onRemove = vi.fn();
    render(
      <WidgetWrapper meta={mockMeta} editMode onRemove={onRemove}>
        <p>Child</p>
      </WidgetWrapper>,
    );

    fireEvent.click(screen.getByLabelText("Remove Test Widget widget"));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("renders children content", () => {
    render(
      <WidgetWrapper meta={mockMeta}>
        <div data-testid="custom-child">Hello</div>
      </WidgetWrapper>,
    );

    expect(screen.getByTestId("custom-child")).toBeDefined();
    expect(screen.getByText("Hello")).toBeDefined();
  });
});
