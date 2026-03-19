import {
  WIDGET_REGISTRY,
  ALL_WIDGET_IDS,
  DEFAULT_LAYOUT,
} from "@/components/desk/widget-registry";

const EXPECTED_WIDGET_IDS = [
  "up-next",
  "launchpad",
  "sticky-board",
  "yoodler-says",
  "pulse-check",
  "buzz",
  "replays",
  "the-feed",
];

describe("WIDGET_REGISTRY", () => {
  it("has exactly 8 entries", () => {
    expect(Object.keys(WIDGET_REGISTRY)).toHaveLength(8);
  });

  it("contains all expected widget IDs", () => {
    expect(Object.keys(WIDGET_REGISTRY).sort()).toEqual(
      EXPECTED_WIDGET_IDS.sort()
    );
  });

  it.each(EXPECTED_WIDGET_IDS)(
    "widget '%s' has its id matching its registry key",
    (id) => {
      expect(WIDGET_REGISTRY[id].id).toBe(id);
    }
  );

  it.each(EXPECTED_WIDGET_IDS)(
    "widget '%s' has all required metadata fields with valid types",
    (id) => {
      const widget = WIDGET_REGISTRY[id];

      expect(typeof widget.id).toBe("string");
      expect(widget.id.length).toBeGreaterThan(0);

      expect(typeof widget.title).toBe("string");
      expect(widget.title.length).toBeGreaterThan(0);

      expect(widget.icon).toBeDefined();
      expect(["function", "object"]).toContain(typeof widget.icon);

      expect(typeof widget.minW).toBe("number");
      expect(typeof widget.minH).toBe("number");
      expect(typeof widget.defaultW).toBe("number");
      expect(typeof widget.defaultH).toBe("number");

      expect(typeof widget.description).toBe("string");
      expect(widget.description.length).toBeGreaterThan(0);
    }
  );

  it.each(EXPECTED_WIDGET_IDS)(
    "widget '%s' has positive dimension values",
    (id) => {
      const widget = WIDGET_REGISTRY[id];

      expect(widget.minW).toBeGreaterThan(0);
      expect(widget.minH).toBeGreaterThan(0);
      expect(widget.defaultW).toBeGreaterThan(0);
      expect(widget.defaultH).toBeGreaterThan(0);
    }
  );

  it.each(EXPECTED_WIDGET_IDS)(
    "widget '%s' has minW <= defaultW and minH <= defaultH",
    (id) => {
      const widget = WIDGET_REGISTRY[id];

      expect(widget.minW).toBeLessThanOrEqual(widget.defaultW);
      expect(widget.minH).toBeLessThanOrEqual(widget.defaultH);
    }
  );
});

describe("ALL_WIDGET_IDS", () => {
  it("matches Object.keys(WIDGET_REGISTRY)", () => {
    expect(ALL_WIDGET_IDS).toEqual(Object.keys(WIDGET_REGISTRY));
  });

  it("contains exactly 8 IDs", () => {
    expect(ALL_WIDGET_IDS).toHaveLength(8);
  });

  it("has no duplicate IDs", () => {
    const unique = new Set(ALL_WIDGET_IDS);
    expect(unique.size).toBe(ALL_WIDGET_IDS.length);
  });
});

describe("DEFAULT_LAYOUT", () => {
  it("has exactly 8 items", () => {
    expect(DEFAULT_LAYOUT).toHaveLength(8);
  });

  it("every layout item references a valid widget from the registry", () => {
    for (const item of DEFAULT_LAYOUT) {
      expect(WIDGET_REGISTRY).toHaveProperty(item.i);
    }
  });

  it("has no duplicate IDs", () => {
    const ids = DEFAULT_LAYOUT.map((item) => item.i);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("covers all registered widgets", () => {
    const layoutIds = DEFAULT_LAYOUT.map((item) => item.i).sort();
    expect(layoutIds).toEqual(EXPECTED_WIDGET_IDS.sort());
  });

  it.each(DEFAULT_LAYOUT.map((item) => [item.i, item]))(
    "layout item '%s' has non-negative x, y, w, h",
    (_id, item) => {
      const layoutItem = item as (typeof DEFAULT_LAYOUT)[number];
      expect(layoutItem.x).toBeGreaterThanOrEqual(0);
      expect(layoutItem.y).toBeGreaterThanOrEqual(0);
      expect(layoutItem.w).toBeGreaterThan(0);
      expect(layoutItem.h).toBeGreaterThan(0);
    }
  );

  it.each(DEFAULT_LAYOUT.map((item) => [item.i, item]))(
    "layout item '%s' has minW/minH matching its registry entry",
    (id, item) => {
      const layoutItem = item as (typeof DEFAULT_LAYOUT)[number];
      const widget = WIDGET_REGISTRY[id as string];

      if (layoutItem.minW !== undefined) {
        expect(layoutItem.minW).toBe(widget.minW);
      }
      if (layoutItem.minH !== undefined) {
        expect(layoutItem.minH).toBe(widget.minH);
      }
    }
  );

  it("all layout items define minW and minH", () => {
    for (const item of DEFAULT_LAYOUT) {
      expect(item.minW).toBeDefined();
      expect(item.minH).toBeDefined();
    }
  });
});
