import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFilesList = vi.fn();
const mockFilesCreate = vi.fn();

vi.mock("@/lib/google/client", () => ({
  getGoogleServices: vi.fn().mockResolvedValue({
    drive: {
      files: {
        list: (...args: unknown[]) => mockFilesList(...args),
        create: (...args: unknown[]) => mockFilesCreate(...args),
      },
    },
  }),
}));

import {
  getOrCreateRootMeetingFolder,
  getOrCreateMeetingFolder,
} from "@/lib/google/drive";

describe("Drive auto-folder structure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOrCreateRootMeetingFolder", () => {
    it("returns existing folder if found", async () => {
      mockFilesList.mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "root-123",
              name: "Yoodle Meetings",
              mimeType: "application/vnd.google-apps.folder",
              shared: false,
            },
          ],
        },
      });

      const result = await getOrCreateRootMeetingFolder("user-1");

      expect(result.id).toBe("root-123");
      expect(result.name).toBe("Yoodle Meetings");
      expect(mockFilesCreate).not.toHaveBeenCalled();
    });

    it("creates folder when not found", async () => {
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
      mockFilesCreate.mockResolvedValueOnce({
        data: {
          id: "new-root-456",
          name: "Yoodle Meetings",
          mimeType: "application/vnd.google-apps.folder",
        },
      });

      const result = await getOrCreateRootMeetingFolder("user-1");

      expect(result.id).toBe("new-root-456");
      expect(result.name).toBe("Yoodle Meetings");
      expect(mockFilesCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe("getOrCreateMeetingFolder", () => {
    it("creates full 3-level hierarchy when nothing exists", async () => {
      // Root folder search -> not found
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
      // Root folder create
      mockFilesCreate.mockResolvedValueOnce({
        data: {
          id: "root-1",
          name: "Yoodle Meetings",
          mimeType: "application/vnd.google-apps.folder",
        },
      });
      // Month folder search -> not found
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
      // Month folder create
      mockFilesCreate.mockResolvedValueOnce({
        data: {
          id: "month-1",
          name: "2026-03",
          mimeType: "application/vnd.google-apps.folder",
        },
      });
      // Meeting folder dedup search -> not found
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
      // Meeting folder create
      mockFilesCreate.mockResolvedValueOnce({
        data: {
          id: "meeting-1",
          name: "Sprint Planning",
          mimeType: "application/vnd.google-apps.folder",
        },
      });

      const result = await getOrCreateMeetingFolder(
        "user-1",
        "Sprint Planning",
        new Date("2026-03-15"),
      );

      expect(result.id).toBe("meeting-1");
      expect(result.name).toBe("Sprint Planning");
      expect(mockFilesCreate).toHaveBeenCalledTimes(3);
    });

    it("reuses existing root and month folders", async () => {
      // Root folder search -> found
      mockFilesList.mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "root-1",
              name: "Yoodle Meetings",
              mimeType: "application/vnd.google-apps.folder",
              shared: false,
            },
          ],
        },
      });
      // Month folder search -> found
      mockFilesList.mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "month-1",
              name: "2026-01",
              mimeType: "application/vnd.google-apps.folder",
              shared: false,
            },
          ],
        },
      });
      // Meeting folder dedup search -> not found
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
      // Meeting folder create
      mockFilesCreate.mockResolvedValueOnce({
        data: {
          id: "meeting-2",
          name: "Retro",
          mimeType: "application/vnd.google-apps.folder",
        },
      });

      const result = await getOrCreateMeetingFolder(
        "user-1",
        "Retro",
        new Date("2026-01-20"),
      );

      expect(result.id).toBe("meeting-2");
      // Only the meeting folder should be created
      expect(mockFilesCreate).toHaveBeenCalledTimes(1);
    });

    it("sanitizes meeting title with forbidden characters", async () => {
      // Root found
      mockFilesList.mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "root-1",
              name: "Yoodle Meetings",
              mimeType: "application/vnd.google-apps.folder",
              shared: false,
            },
          ],
        },
      });
      // Month found
      mockFilesList.mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "month-1",
              name: "2026-03",
              mimeType: "application/vnd.google-apps.folder",
              shared: false,
            },
          ],
        },
      });
      // Meeting folder dedup search -> not found
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
      // Meeting folder create
      mockFilesCreate.mockResolvedValueOnce({
        data: {
          id: "meeting-3",
          name: "Q1-Q2 Review - Financials",
          mimeType: "application/vnd.google-apps.folder",
        },
      });

      await getOrCreateMeetingFolder(
        "user-1",
        'Q1/Q2 Review: Financials "Draft"',
        new Date("2026-03-10"),
      );

      const createCall = mockFilesCreate.mock.calls[0][0];
      const folderName = createCall.requestBody.name;
      expect(folderName).not.toMatch(/[/\\?%*:|"<>]/);
      expect(folderName).toBe('Q1-Q2 Review- Financials -Draft-');
    });

    it("truncates long meeting titles to 100 chars", async () => {
      // Root found
      mockFilesList.mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "root-1",
              name: "Yoodle Meetings",
              mimeType: "application/vnd.google-apps.folder",
              shared: false,
            },
          ],
        },
      });
      // Month found
      mockFilesList.mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "month-1",
              name: "2026-06",
              mimeType: "application/vnd.google-apps.folder",
              shared: false,
            },
          ],
        },
      });
      const longTitle = "A".repeat(150);
      // Meeting folder dedup search -> not found
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
      // Meeting folder create
      mockFilesCreate.mockResolvedValueOnce({
        data: {
          id: "meeting-4",
          name: "A".repeat(100),
          mimeType: "application/vnd.google-apps.folder",
        },
      });

      await getOrCreateMeetingFolder("user-1", longTitle, new Date("2026-06-01"));

      const createCall = mockFilesCreate.mock.calls[0][0];
      expect(createCall.requestBody.name.length).toBeLessThanOrEqual(100);
    });
  });
});
