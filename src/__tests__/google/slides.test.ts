import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSlides, mockDrive } = vi.hoisted(() => {
  const mockSlides = {
    presentations: {
      create: vi.fn(),
      batchUpdate: vi.fn(),
      get: vi.fn(),
    },
  };
  const mockDrive = {
    files: {
      get: vi.fn(),
    },
  };
  return { mockSlides, mockDrive };
});

vi.mock("@/lib/google/client", () => ({
  getGoogleServices: vi.fn().mockResolvedValue({
    slides: mockSlides,
    drive: mockDrive,
  }),
}));

import {
  createPresentation,
  addSlide,
  createMomPresentation,
} from "@/lib/google/slides";
import type { MomSlideData } from "@/lib/google/slides";

describe("Google Slides service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSlides.presentations.create.mockResolvedValue({
      data: {
        presentationId: "pres-123",
        title: "Test Presentation",
      },
    });

    mockDrive.files.get.mockResolvedValue({
      data: {
        webViewLink: "https://docs.google.com/presentation/d/pres-123/edit",
      },
    });

    mockSlides.presentations.batchUpdate.mockResolvedValue({ data: {} });

    mockSlides.presentations.get.mockResolvedValue({
      data: { slides: [] },
    });
  });

  describe("createPresentation", () => {
    it("creates a presentation and returns info with webViewLink", async () => {
      const result = await createPresentation("user-1", "My Presentation");

      expect(mockSlides.presentations.create).toHaveBeenCalledWith({
        requestBody: { title: "My Presentation" },
      });
      expect(mockDrive.files.get).toHaveBeenCalledWith({
        fileId: "pres-123",
        fields: "webViewLink",
      });
      expect(result).toEqual({
        presentationId: "pres-123",
        title: "Test Presentation",
        webViewLink: "https://docs.google.com/presentation/d/pres-123/edit",
      });
    });

    it("falls back to constructed URL when webViewLink is missing", async () => {
      mockDrive.files.get.mockResolvedValue({ data: {} });

      const result = await createPresentation("user-1", "Fallback Test");

      expect(result.webViewLink).toBe(
        "https://docs.google.com/presentation/d/pres-123/edit"
      );
    });
  });

  describe("addSlide", () => {
    it("creates a slide and inserts text into placeholders", async () => {
      mockSlides.presentations.get.mockImplementation(async () => {
        const createCall = mockSlides.presentations.batchUpdate.mock.calls[0];
        const slideId =
          createCall[0].requestBody.requests[0].createSlide.objectId;
        return {
          data: {
            slides: [
              {
                objectId: slideId,
                pageElements: [
                  {
                    objectId: "title-el",
                    shape: { placeholder: { type: "TITLE" } },
                  },
                  {
                    objectId: "body-el",
                    shape: { placeholder: { type: "BODY" } },
                  },
                ],
              },
            ],
          },
        };
      });

      await addSlide("user-1", "pres-123", "Slide Title", "Slide body text");

      expect(mockSlides.presentations.batchUpdate).toHaveBeenCalledTimes(2);

      // First call: createSlide
      const createCall = mockSlides.presentations.batchUpdate.mock.calls[0][0];
      expect(createCall.presentationId).toBe("pres-123");
      expect(
        createCall.requestBody.requests[0].createSlide.slideLayoutReference
          .predefinedLayout
      ).toBe("TITLE_AND_BODY");

      // Second call: insertText for title and body
      const textCall = mockSlides.presentations.batchUpdate.mock.calls[1][0];
      expect(textCall.presentationId).toBe("pres-123");
      expect(textCall.requestBody.requests).toHaveLength(2);
      expect(textCall.requestBody.requests[0].insertText.objectId).toBe(
        "title-el"
      );
      expect(textCall.requestBody.requests[0].insertText.text).toBe(
        "Slide Title"
      );
      expect(textCall.requestBody.requests[1].insertText.objectId).toBe(
        "body-el"
      );
      expect(textCall.requestBody.requests[1].insertText.text).toBe(
        "Slide body text"
      );
    });

    it("does not throw when no page elements found", async () => {
      mockSlides.presentations.get.mockImplementation(async () => {
        const createCall = mockSlides.presentations.batchUpdate.mock.calls[0];
        const slideId =
          createCall[0].requestBody.requests[0].createSlide.objectId;
        return {
          data: {
            slides: [{ objectId: slideId, pageElements: [] }],
          },
        };
      });

      await expect(
        addSlide("user-1", "pres-123", "Title", "Body")
      ).resolves.toBeUndefined();

      // Only the createSlide batchUpdate, no text insertion
      expect(mockSlides.presentations.batchUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("createMomPresentation", () => {
    const momData: MomSlideData = {
      title: "Sprint Planning",
      date: "2026-03-17",
      summary: "Discussed sprint goals and priorities.",
      keyDecisions: ["Adopt new CI pipeline", "Postpone feature X"],
      actionItems: [
        { task: "Set up CI", owner: "Alice", due: "2026-03-20" },
        { task: "Update docs", owner: "Bob", due: "2026-03-22" },
      ],
      nextSteps: ["Review progress Friday", "Demo to stakeholders"],
    };

    it("creates a full MoM deck with 4 slides", async () => {
      let callIndex = 0;
      mockSlides.presentations.get.mockImplementation(async () => {
        const createCallIndex = callIndex * 2;
        callIndex++;
        const createCall =
          mockSlides.presentations.batchUpdate.mock.calls[createCallIndex];
        const slideId =
          createCall[0].requestBody.requests[0].createSlide.objectId;
        return {
          data: {
            slides: [
              {
                objectId: slideId,
                pageElements: [
                  {
                    objectId: `title-${slideId}`,
                    shape: { placeholder: { type: "TITLE" } },
                  },
                  {
                    objectId: `body-${slideId}`,
                    shape: { placeholder: { type: "BODY" } },
                  },
                ],
              },
            ],
          },
        };
      });

      const result = await createMomPresentation("user-1", momData);

      expect(result.presentationId).toBe("pres-123");
      expect(result.title).toBe("Test Presentation");

      // 4 slides x 2 batchUpdate each = 8 batchUpdate calls
      expect(mockSlides.presentations.batchUpdate).toHaveBeenCalledTimes(8);

      // Verify the presentation title includes MoM and date
      expect(mockSlides.presentations.create).toHaveBeenCalledWith({
        requestBody: { title: "Sprint Planning - MoM (2026-03-17)" },
      });
    });

    it("returns a valid PresentationInfo", async () => {
      mockSlides.presentations.get.mockImplementation(async () => {
        const calls = mockSlides.presentations.batchUpdate.mock.calls;
        const lastCall = calls[calls.length - 1];
        const slideId =
          lastCall?.[0]?.requestBody?.requests?.[0]?.createSlide?.objectId ??
          "unknown";
        return {
          data: {
            slides: [
              {
                objectId: slideId,
                pageElements: [
                  {
                    objectId: "t",
                    shape: { placeholder: { type: "TITLE" } },
                  },
                  {
                    objectId: "b",
                    shape: { placeholder: { type: "BODY" } },
                  },
                ],
              },
            ],
          },
        };
      });

      const result = await createMomPresentation("user-1", momData);

      expect(result).toHaveProperty("presentationId");
      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("webViewLink");
      expect(result.webViewLink).toContain("docs.google.com/presentation");
    });
  });
});
