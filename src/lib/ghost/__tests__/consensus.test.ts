import { describe, it, expect, vi } from "vitest";

// Mock DB and models to prevent MONGODB_URI requirement
vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/db/models/meeting", () => ({ default: {} }));

import { checkConsensus } from "../consensus";

describe("checkConsensus", () => {
  describe("with Map input", () => {
    it("returns allVoted=true when all participants voted", () => {
      const participants = new Map([
        ["a", { votedToSave: true }],
        ["b", { votedToSave: true }],
        ["c", { votedToSave: true }],
      ]);
      const result = checkConsensus(participants);
      expect(result.allVoted).toBe(true);
      expect(result.totalVotes).toBe(3);
      expect(result.totalParticipants).toBe(3);
      expect(result.percentage).toBe(100);
      expect(result.voted).toBe(true);
    });

    it("returns allVoted=false when not all participants voted", () => {
      const participants = new Map([
        ["a", { votedToSave: true }],
        ["b", { votedToSave: false }],
        ["c", { votedToSave: true }],
      ]);
      const result = checkConsensus(participants);
      expect(result.allVoted).toBe(false);
      expect(result.totalVotes).toBe(2);
      expect(result.totalParticipants).toBe(3);
      expect(result.percentage).toBe(67);
      expect(result.voted).toBe(true);
    });

    it("handles empty Map", () => {
      const result = checkConsensus(new Map());
      expect(result.allVoted).toBe(false);
      expect(result.voted).toBe(false);
      expect(result.totalVotes).toBe(0);
      expect(result.totalParticipants).toBe(0);
      expect(result.percentage).toBe(0);
    });

    it("handles single participant who voted", () => {
      const participants = new Map([["solo", { votedToSave: true }]]);
      const result = checkConsensus(participants);
      expect(result.allVoted).toBe(true);
      expect(result.percentage).toBe(100);
    });

    it("handles single participant who did not vote", () => {
      const participants = new Map([["solo", { votedToSave: false }]]);
      const result = checkConsensus(participants);
      expect(result.allVoted).toBe(false);
      expect(result.voted).toBe(false);
      expect(result.percentage).toBe(0);
    });
  });

  describe("with Array input", () => {
    it("returns allVoted=true when all participants voted", () => {
      const participants = [
        { votedToSave: true },
        { votedToSave: true },
      ];
      const result = checkConsensus(participants);
      expect(result.allVoted).toBe(true);
      expect(result.totalVotes).toBe(2);
      expect(result.percentage).toBe(100);
    });

    it("returns allVoted=false with partial votes", () => {
      const participants = [
        { votedToSave: true },
        { votedToSave: false },
        { votedToSave: false },
      ];
      const result = checkConsensus(participants);
      expect(result.allVoted).toBe(false);
      expect(result.totalVotes).toBe(1);
      expect(result.percentage).toBe(33);
    });

    it("handles empty array", () => {
      const result = checkConsensus([]);
      expect(result.allVoted).toBe(false);
      expect(result.totalParticipants).toBe(0);
    });
  });
});
