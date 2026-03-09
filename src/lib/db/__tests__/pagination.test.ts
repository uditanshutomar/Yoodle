import { describe, it, expect } from "vitest";
import {
  paginationSchema,
  paginate,
  PAGINATION_DEFAULTS,
} from "../pagination";

describe("PAGINATION_DEFAULTS", () => {
  it("has expected default values", () => {
    expect(PAGINATION_DEFAULTS.page).toBe(1);
    expect(PAGINATION_DEFAULTS.limit).toBe(50);
    expect(PAGINATION_DEFAULTS.maxLimit).toBe(100);
  });
});

describe("paginationSchema", () => {
  it("parses valid pagination params", () => {
    const result = paginationSchema.parse({ page: 2, limit: 20 });

    expect(result.page).toBe(2);
    expect(result.limit).toBe(20);
  });

  it("applies defaults when values are omitted", () => {
    const result = paginationSchema.parse({});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });

  it("coerces string values to numbers", () => {
    const result = paginationSchema.parse({ page: "3", limit: "25" });

    expect(result.page).toBe(3);
    expect(result.limit).toBe(25);
  });

  it("rejects page less than 1", () => {
    expect(() => paginationSchema.parse({ page: 0 })).toThrow();
    expect(() => paginationSchema.parse({ page: -1 })).toThrow();
  });

  it("rejects limit less than 1", () => {
    expect(() => paginationSchema.parse({ limit: 0 })).toThrow();
    expect(() => paginationSchema.parse({ limit: -5 })).toThrow();
  });

  it("rejects limit greater than maxLimit (100)", () => {
    expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
    expect(() => paginationSchema.parse({ limit: 500 })).toThrow();
  });

  it("accepts limit at the boundary (100)", () => {
    const result = paginationSchema.parse({ limit: 100 });
    expect(result.limit).toBe(100);
  });

  it("rejects non-integer values", () => {
    expect(() => paginationSchema.parse({ page: 1.5 })).toThrow();
    expect(() => paginationSchema.parse({ limit: 2.7 })).toThrow();
  });
});

describe("paginate", () => {
  it("calculates correct skip for page 1", () => {
    const { skip, meta } = paginate({ page: 1, limit: 20 }, 100);

    expect(skip).toBe(0);
    expect(meta.page).toBe(1);
    expect(meta.limit).toBe(20);
  });

  it("calculates correct skip for page 2", () => {
    const { skip, meta } = paginate({ page: 2, limit: 20 }, 100);

    expect(skip).toBe(20);
    expect(meta.page).toBe(2);
  });

  it("calculates correct skip for page 3 with limit 10", () => {
    const { skip } = paginate({ page: 3, limit: 10 }, 100);

    expect(skip).toBe(20);
  });

  it("returns correct totalPages", () => {
    const { meta } = paginate({ page: 1, limit: 20 }, 100);
    expect(meta.totalPages).toBe(5);

    const { meta: meta2 } = paginate({ page: 1, limit: 20 }, 95);
    expect(meta2.totalPages).toBe(5); // ceil(95/20) = 5

    const { meta: meta3 } = paginate({ page: 1, limit: 20 }, 101);
    expect(meta3.totalPages).toBe(6); // ceil(101/20) = 6
  });

  it("returns correct total count", () => {
    const { meta } = paginate({ page: 1, limit: 20 }, 42);
    expect(meta.total).toBe(42);
  });

  it("sets hasNextPage correctly", () => {
    const { meta: firstPage } = paginate({ page: 1, limit: 20 }, 100);
    expect(firstPage.hasNextPage).toBe(true);

    const { meta: lastPage } = paginate({ page: 5, limit: 20 }, 100);
    expect(lastPage.hasNextPage).toBe(false);
  });

  it("sets hasPrevPage correctly", () => {
    const { meta: firstPage } = paginate({ page: 1, limit: 20 }, 100);
    expect(firstPage.hasPrevPage).toBe(false);

    const { meta: secondPage } = paginate({ page: 2, limit: 20 }, 100);
    expect(secondPage.hasPrevPage).toBe(true);
  });

  it("clamps page to totalPages when page exceeds total", () => {
    const { skip, meta } = paginate({ page: 999, limit: 20 }, 100);

    // totalPages = 5, so page should be clamped to 5
    expect(meta.page).toBe(5);
    expect(skip).toBe(80); // (5-1) * 20
    expect(meta.hasNextPage).toBe(false);
  });

  it("handles zero total items", () => {
    const { skip, meta } = paginate({ page: 1, limit: 20 }, 0);

    expect(skip).toBe(0);
    expect(meta.page).toBe(1);
    expect(meta.totalPages).toBe(1); // Math.ceil(0/20) || 1 = 1
    expect(meta.total).toBe(0);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPrevPage).toBe(false);
  });

  it("handles single-page results", () => {
    const { meta } = paginate({ page: 1, limit: 50 }, 10);

    expect(meta.totalPages).toBe(1);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPrevPage).toBe(false);
  });

  it("returns the correct limit in meta", () => {
    const { meta } = paginate({ page: 1, limit: 25 }, 100);
    expect(meta.limit).toBe(25);
  });
});
