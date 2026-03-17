import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock heavy dependencies so importing agent-tools doesn't trigger
// Mongoose / Redis / Google API connections.
vi.mock("@/lib/infra/db/mongodb", () => ({}));
vi.mock("@/lib/infra/db/client", () => ({ default: null }));
vi.mock("@/lib/infra/db/redis", () => ({ getRedisClient: () => null }));
vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }),
}));
vi.mock("@/lib/google/client", () => ({}));
vi.mock("@/lib/google/calendar", () => ({}));

vi.mock("@/lib/google/gmail", () => ({}));
vi.mock("@/lib/google/drive", () => ({}));
vi.mock("@/lib/google/contacts", () => ({}));
vi.mock("@/lib/google/docs", () => ({}));
vi.mock("@/lib/google/sheets", () => ({}));

import {
  _getRelativeTime as getRelativeTime,
  _getMimeLabel as getMimeLabel,
  _formatDay as formatDay,
  _formatTime as formatTime,
} from "../agent-tools";

// ── getRelativeTime ─────────────────────────────────────────────────

describe("getRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin "now" to a known time: 2026-03-15T12:00:00Z
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for a date less than 1 minute ago', () => {
    const date = new Date("2026-03-15T11:59:30Z"); // 30 seconds ago
    expect(getRelativeTime(date)).toBe("just now");
  });

  it('returns "just now" for exactly now', () => {
    expect(getRelativeTime(new Date("2026-03-15T12:00:00Z"))).toBe("just now");
  });

  it('returns "just now" for future dates (clock skew)', () => {
    const future = new Date("2026-03-15T13:00:00Z");
    expect(getRelativeTime(future)).toBe("just now");
  });

  it("returns minutes ago for 1-59 minutes", () => {
    expect(getRelativeTime(new Date("2026-03-15T11:59:00Z"))).toBe("1m ago");
    expect(getRelativeTime(new Date("2026-03-15T11:30:00Z"))).toBe("30m ago");
    expect(getRelativeTime(new Date("2026-03-15T11:01:00Z"))).toBe("59m ago");
  });

  it("uses Math.floor not Math.round for minutes", () => {
    // 1 minute 59 seconds = 119 seconds — should be 1m not 2m
    const date = new Date("2026-03-15T11:58:01Z");
    expect(getRelativeTime(date)).toBe("1m ago");
  });

  it("returns hours ago for 1-23 hours", () => {
    expect(getRelativeTime(new Date("2026-03-15T11:00:00Z"))).toBe("1h ago");
    expect(getRelativeTime(new Date("2026-03-15T00:00:00Z"))).toBe("12h ago");
  });

  it("uses Math.floor not Math.round for hours", () => {
    // 1 hour 59 minutes — should be 1h not 2h
    const date = new Date("2026-03-15T10:01:00Z");
    expect(getRelativeTime(date)).toBe("1h ago");
  });

  it('returns "yesterday" for exactly 1 day ago', () => {
    const date = new Date("2026-03-14T12:00:00Z");
    expect(getRelativeTime(date)).toBe("yesterday");
  });

  it("returns days ago for 2-6 days", () => {
    expect(getRelativeTime(new Date("2026-03-13T12:00:00Z"))).toBe("2d ago");
    expect(getRelativeTime(new Date("2026-03-09T12:00:00Z"))).toBe("6d ago");
  });

  it("returns formatted date for 7+ days ago", () => {
    const date = new Date("2026-03-08T12:00:00Z");
    expect(getRelativeTime(date)).toBe(formatDay(date));
  });
});

// ── getMimeLabel ─────────────────────────────────────────────────────

describe("getMimeLabel", () => {
  it("maps Google Docs MIME type", () => {
    expect(getMimeLabel("application/vnd.google-apps.document")).toBe("Doc");
  });

  it("maps Google Sheets MIME type", () => {
    expect(getMimeLabel("application/vnd.google-apps.spreadsheet")).toBe("Sheet");
  });

  it("maps Google Slides MIME type", () => {
    expect(getMimeLabel("application/vnd.google-apps.presentation")).toBe("Slides");
  });

  it("maps Folder MIME type", () => {
    expect(getMimeLabel("application/vnd.google-apps.folder")).toBe("Folder");
  });

  it("maps PDF MIME type", () => {
    expect(getMimeLabel("application/pdf")).toBe("PDF");
  });

  it("maps PNG MIME type", () => {
    expect(getMimeLabel("image/png")).toBe("PNG");
  });

  it("maps JPEG MIME type", () => {
    expect(getMimeLabel("image/jpeg")).toBe("JPEG");
  });

  it("extracts subtype for unknown MIME types", () => {
    expect(getMimeLabel("application/zip")).toBe("zip");
    expect(getMimeLabel("text/csv")).toBe("csv");
    expect(getMimeLabel("video/mp4")).toBe("mp4");
  });

  it('returns "file" for empty string', () => {
    // "".split("/").pop() returns "" which is falsy
    expect(getMimeLabel("")).toBe("file");
  });

  it("handles MIME type with no slash", () => {
    // "unknown".split("/").pop() returns "unknown"
    expect(getMimeLabel("unknown")).toBe("unknown");
  });
});

// ── formatDay ────────────────────────────────────────────────────────

describe("formatDay", () => {
  it("formats a date using local timezone getters", () => {
    // Use local time constructor to avoid timezone shift issues
    const d = new Date(2026, 2, 15); // March 15, 2026 (month is 0-indexed)
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const expectedDay = days[d.getDay()];
    expect(formatDay(d)).toBe(`${expectedDay} Mar 15`);
  });

  it("formats first day of year", () => {
    const d = new Date(2026, 0, 1); // Jan 1, 2026
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const expectedDay = days[d.getDay()];
    expect(formatDay(d)).toBe(`${expectedDay} Jan 1`);
  });

  it("formats last day of year", () => {
    const d = new Date(2026, 11, 31); // Dec 31, 2026
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const expectedDay = days[d.getDay()];
    expect(formatDay(d)).toBe(`${expectedDay} Dec 31`);
  });

  it("includes correct month abbreviation for all months", () => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (let m = 0; m < 12; m++) {
      const d = new Date(2026, m, 10);
      expect(formatDay(d)).toContain(months[m]);
    }
  });
});

// ── formatTime ───────────────────────────────────────────────────────

describe("formatTime", () => {
  it("formats midnight as 12 AM", () => {
    const d = new Date("2026-03-15T00:00:00");
    expect(formatTime(d)).toBe("12 AM");
  });

  it("formats noon as 12 PM", () => {
    const d = new Date("2026-03-15T12:00:00");
    expect(formatTime(d)).toBe("12 PM");
  });

  it("formats morning time with minutes", () => {
    const d = new Date("2026-03-15T09:05:00");
    expect(formatTime(d)).toBe("9:05 AM");
  });

  it("formats afternoon time", () => {
    const d = new Date("2026-03-15T14:30:00");
    expect(formatTime(d)).toBe("2:30 PM");
  });

  it("omits minutes when they are zero", () => {
    const d = new Date("2026-03-15T15:00:00");
    expect(formatTime(d)).toBe("3 PM");
  });

  it("pads single-digit minutes with zero", () => {
    const d = new Date("2026-03-15T08:03:00");
    expect(formatTime(d)).toBe("8:03 AM");
  });

  it("formats 11 PM correctly", () => {
    const d = new Date("2026-03-15T23:59:00");
    expect(formatTime(d)).toBe("11:59 PM");
  });

  it("formats 1 AM correctly", () => {
    const d = new Date("2026-03-15T01:00:00");
    expect(formatTime(d)).toBe("1 AM");
  });
});
