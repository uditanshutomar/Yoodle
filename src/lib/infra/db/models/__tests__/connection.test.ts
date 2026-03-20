import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("Connection model", () => {
  it("exports CONNECTION_STATUSES constant", async () => {
    const { CONNECTION_STATUSES } = await import("../connection");
    expect(CONNECTION_STATUSES).toEqual(["pending", "accepted", "blocked"]);
  });

  it("exports Connection model", async () => {
    const { default: Connection } = await import("../connection");
    expect(Connection).toBeDefined();
    expect(Connection.modelName).toBe("Connection");
  });
});
