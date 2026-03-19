import { describe, it, expect } from "vitest";
import { generateMeetingCode } from "../id";

describe("generateMeetingCode", () => {
  it("produces yoo-xxx-xxx format", () => {
    const code = generateMeetingCode();
    expect(code).toMatch(/^yoo-[a-z0-9]{3}-[a-z0-9]{3}$/);
    expect(code.startsWith("yoo-")).toBe(true);
    expect(code.length).toBe(11);
  });

  it("excludes confusable characters (0, o, l, 1)", () => {
    // Generate many codes and check none contain excluded chars
    for (let i = 0; i < 200; i++) {
      const code = generateMeetingCode();
      const segments = code.replace("yoo-", "").replace("-", "");
      expect(segments).not.toMatch(/[01ol]/);
    }
  });

  it("generates unique codes", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateMeetingCode());
    }
    expect(codes.size).toBe(100);
  });
});
