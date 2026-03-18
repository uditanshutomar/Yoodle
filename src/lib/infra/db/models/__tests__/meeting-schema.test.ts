import { describe, it, expect } from "vitest";

describe("Meeting model schema", () => {
  it("has correct collection name and model name", async () => {
    const { default: Meeting } = await import("../meeting");
    expect(Meeting.modelName).toBe("Meeting");
    expect(Meeting.collection.collectionName).toBe("meetings");
  });

  it("has all existing core fields", async () => {
    const { default: Meeting } = await import("../meeting");
    const schema = Meeting.schema;

    expect(schema.path("code")).toBeDefined();
    expect(schema.path("title")).toBeDefined();
    expect(schema.path("description")).toBeDefined();
    expect(schema.path("hostId")).toBeDefined();
    expect(schema.path("participants")).toBeDefined();
    expect(schema.path("scheduledAt")).toBeDefined();
    expect(schema.path("startedAt")).toBeDefined();
    expect(schema.path("endedAt")).toBeDefined();
    expect(schema.path("status")).toBeDefined();
    expect(schema.path("type")).toBeDefined();
    expect(schema.path("settings")).toBeDefined();
    expect(schema.path("recordingId")).toBeDefined();
    expect(schema.path("mom")).toBeDefined();
    expect(schema.path("ghostMessages")).toBeDefined();
    expect(schema.path("ghostNotes")).toBeDefined();
  });

  it("has artifacts path", async () => {
    const { default: Meeting } = await import("../meeting");
    expect(Meeting.schema.path("artifacts")).toBeDefined();
  });

  it("has artifacts.momDocUrl as String", async () => {
    const { default: Meeting } = await import("../meeting");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = Meeting.schema.path("artifacts.momDocUrl") as any;
    expect(p).toBeDefined();
    expect(p.instance).toBe("String");
  });

  it("has artifacts.momDocId as String", async () => {
    const { default: Meeting } = await import("../meeting");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = Meeting.schema.path("artifacts.momDocId") as any;
    expect(p).toBeDefined();
    expect(p.instance).toBe("String");
  });

  it("has artifacts.presentationUrl as String", async () => {
    const { default: Meeting } = await import("../meeting");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = Meeting.schema.path("artifacts.presentationUrl") as any;
    expect(p).toBeDefined();
    expect(p.instance).toBe("String");
  });

  it("has artifacts.folderId as String", async () => {
    const { default: Meeting } = await import("../meeting");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = Meeting.schema.path("artifacts.folderId") as any;
    expect(p).toBeDefined();
    expect(p.instance).toBe("String");
  });

  it("has cascadeExecutedAt as Date", async () => {
    const { default: Meeting } = await import("../meeting");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = Meeting.schema.path("cascadeExecutedAt") as any;
    expect(p).toBeDefined();
    expect(p.instance).toBe("Date");
  });

  it("has templateId as ObjectId ref to MeetingTemplate", async () => {
    const { default: Meeting } = await import("../meeting");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = Meeting.schema.path("templateId") as any;
    expect(p).toBeDefined();
    expect(p.instance).toBe("ObjectId");
    expect(p.options.ref).toBe("MeetingTemplate");
  });

  it("exports IMeetingArtifacts interface correctly", async () => {
    // Verify the interface is importable (compile-time check effectively)
    const mod = await import("../meeting");
    // The type exists if the module exports it; we verify the artifacts
    // sub-schema has the expected fields matching IMeetingArtifacts
    const schema = mod.default.schema;
    const artifactFields = [
      "artifacts.momDocUrl",
      "artifacts.momDocId",
      "artifacts.presentationUrl",
      "artifacts.presentationId",
      "artifacts.folderUrl",
      "artifacts.folderId",
      "artifacts.analyticsSheetId",
    ];
    for (const field of artifactFields) {
      expect(schema.path(field)).toBeDefined();
    }
  });
});
