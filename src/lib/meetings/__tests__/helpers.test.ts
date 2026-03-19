import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { buildMeetingFilter, isHostOrParticipant, MEETING_CODE_REGEX } from "../helpers";

describe("MEETING_CODE_REGEX", () => {
  it("matches valid meeting codes", () => {
    expect(MEETING_CODE_REGEX.test("yoo-abc-123")).toBe(true);
    expect(MEETING_CODE_REGEX.test("yoo-000-zzz")).toBe(true);
    expect(MEETING_CODE_REGEX.test("yoo-a1b-c2d")).toBe(true);
  });

  it("rejects invalid meeting codes", () => {
    expect(MEETING_CODE_REGEX.test("yoo-ABC-123")).toBe(false); // uppercase
    expect(MEETING_CODE_REGEX.test("yoo-ab-123")).toBe(false); // too short
    expect(MEETING_CODE_REGEX.test("yoo-abcd-123")).toBe(false); // too long
    expect(MEETING_CODE_REGEX.test("abc-def-ghi")).toBe(false); // wrong prefix
    expect(MEETING_CODE_REGEX.test("")).toBe(false);
  });
});

describe("buildMeetingFilter", () => {
  it("returns _id filter for valid ObjectId", () => {
    const id = new mongoose.Types.ObjectId().toString();
    const filter = buildMeetingFilter(id);
    expect(filter._id).toBeDefined();
    expect(filter._id!.toString()).toBe(id);
  });

  it("returns code filter for meeting code", () => {
    const filter = buildMeetingFilter("yoo-abc-123");
    expect(filter.code).toBe("yoo-abc-123");
    expect(filter._id).toBeUndefined();
  });

  it("lowercases meeting code", () => {
    // Even though the regex won't match uppercase, buildMeetingFilter still lowercases
    const filter = buildMeetingFilter("YOO-ABC-123");
    expect(filter.code).toBe("yoo-abc-123");
  });

  it("treats ambiguous strings as code (not ObjectId)", () => {
    // A string that looks like a valid ObjectId but also matches the code regex
    // would be treated as ObjectId since ObjectId.isValid check comes first,
    // but the code regex check prevents it from matching
    const filter = buildMeetingFilter("not-an-id");
    expect(filter.code).toBe("not-an-id");
  });
});

describe("isHostOrParticipant", () => {
  const hostId = new mongoose.Types.ObjectId();
  const participantId = new mongoose.Types.ObjectId();
  const strangerId = new mongoose.Types.ObjectId();

  const meeting = {
    hostId,
    participants: [{ userId: participantId }],
  };

  it("returns true for the host", () => {
    expect(isHostOrParticipant(meeting, hostId.toString())).toBe(true);
  });

  it("returns true for a participant", () => {
    expect(isHostOrParticipant(meeting, participantId.toString())).toBe(true);
  });

  it("returns false for a stranger", () => {
    expect(isHostOrParticipant(meeting, strangerId.toString())).toBe(false);
  });

  it("handles empty participants array", () => {
    const mtg = { hostId, participants: [] };
    expect(isHostOrParticipant(mtg, strangerId.toString())).toBe(false);
    expect(isHostOrParticipant(mtg, hostId.toString())).toBe(true);
  });
});
