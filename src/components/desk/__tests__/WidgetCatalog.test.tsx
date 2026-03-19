// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("React", React);

import WidgetCatalog from "../WidgetCatalog";
import { ALL_WIDGET_IDS, WIDGET_REGISTRY } from "../widget-registry";

describe("WidgetCatalog", () => {
  it("returns null when all widgets are already added", () => {
    const { container } = render(
      <WidgetCatalog activeIds={ALL_WIDGET_IDS} onAdd={vi.fn()} />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("shows available widgets when some are missing", () => {
    const activeIds = ALL_WIDGET_IDS.slice(0, -2);
    const missingIds = ALL_WIDGET_IDS.slice(-2);

    render(<WidgetCatalog activeIds={activeIds} onAdd={vi.fn()} />);

    for (const id of missingIds) {
      expect(screen.getByText(WIDGET_REGISTRY[id].title)).toBeDefined();
    }
  });

  it("calls onAdd with correct ID when a widget button is clicked", () => {
    const onAdd = vi.fn();
    // Only include first widget so the rest are available
    const activeIds = [ALL_WIDGET_IDS[0]];

    render(<WidgetCatalog activeIds={activeIds} onAdd={onAdd} />);

    const secondWidgetId = ALL_WIDGET_IDS[1];
    const secondWidgetTitle = WIDGET_REGISTRY[secondWidgetId].title;

    fireEvent.click(screen.getByText(secondWidgetTitle));
    expect(onAdd).toHaveBeenCalledWith(secondWidgetId);
  });

  it("shows widget title and description for each available widget", () => {
    render(<WidgetCatalog activeIds={[]} onAdd={vi.fn()} />);

    for (const id of ALL_WIDGET_IDS) {
      const meta = WIDGET_REGISTRY[id];
      expect(screen.getByText(meta.title)).toBeDefined();
      expect(screen.getByText(meta.description)).toBeDefined();
    }
  });
});
