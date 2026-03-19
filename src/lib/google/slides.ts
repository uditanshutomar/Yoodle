import { getGoogleServices } from "./client";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("google:slides");

export interface PresentationInfo {
  presentationId: string;
  title: string;
  webViewLink: string;
}

export interface MomSlideData {
  title: string;
  date: string;
  summary: string;
  keyDecisions: string[];
  actionItems: { task: string; assignee: string; dueDate: string }[];
  nextSteps: string[];
}

/**
 * Create a new empty Google Slides presentation.
 */
export async function createPresentation(
  userId: string,
  title: string
): Promise<PresentationInfo> {
  const { slides, drive } = await getGoogleServices(userId);

  const res = await slides.presentations.create({
    requestBody: { title },
  });

  const presentationId = res.data.presentationId || "";

  const fileRes = await drive.files.get({
    fileId: presentationId,
    fields: "webViewLink",
  });

  return {
    presentationId,
    title: res.data.title || title,
    webViewLink:
      fileRes.data.webViewLink ||
      `https://docs.google.com/presentation/d/${presentationId}/edit`,
  };
}

/**
 * Add a slide with title and body text to an existing presentation.
 * Uses the TITLE_AND_BODY predefined layout.
 */
export async function addSlide(
  userId: string,
  presentationId: string,
  title: string,
  body: string
): Promise<void> {
  const { slides } = await getGoogleServices(userId);

  // Generate a unique object ID for the new slide
  const slideId = `slide_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Step 1: Create the slide
  await slides.presentations.batchUpdate({
    presentationId,
    requestBody: {
      requests: [
        {
          createSlide: {
            objectId: slideId,
            slideLayoutReference: {
              predefinedLayout: "TITLE_AND_BODY",
            },
          },
        },
      ],
    },
  });

  // Step 2: Get the slide to find placeholder element IDs
  const pres = await slides.presentations.get({ presentationId });
  const slide = pres.data.slides?.find((s) => s.objectId === slideId);

  if (!slide?.pageElements) {
    log.warn({ presentationId, slideId }, "Slide created but no page elements found — text cannot be inserted");
    return;
  }

  let titleElementId: string | undefined;
  let bodyElementId: string | undefined;

  for (const element of slide.pageElements) {
    const placeholder = element.shape?.placeholder;
    if (placeholder?.type === "TITLE") {
      titleElementId = element.objectId ?? undefined;
    } else if (
      placeholder?.type === "BODY" ||
      placeholder?.type === "SUBTITLE"
    ) {
      bodyElementId = element.objectId ?? undefined;
    }
  }

  // Step 3: Insert text into placeholders
  const textRequests: object[] = [];

  if (titleElementId) {
    textRequests.push({
      insertText: {
        objectId: titleElementId,
        text: title,
        insertionIndex: 0,
      },
    });
  }

  if (bodyElementId) {
    textRequests.push({
      insertText: {
        objectId: bodyElementId,
        text: body,
        insertionIndex: 0,
      },
    });
  }

  if (textRequests.length > 0) {
    await slides.presentations.batchUpdate({
      presentationId,
      requestBody: { requests: textRequests },
    });
  }
}

/**
 * Create a full Minutes of Meeting (MoM) presentation.
 * Creates a presentation with 4 slides: Summary, Key Decisions, Action Items, Next Steps.
 */
export async function createMomPresentation(
  userId: string,
  data: MomSlideData
): Promise<PresentationInfo> {
  const presTitle = `${data.title} - MoM (${data.date})`;
  const presentation = await createPresentation(userId, presTitle);

  // Build all slides — continue on individual slide failures so the
  // presentation is still usable even if one slide fails to populate.
  const slides: { title: string; body: string }[] = [
    { title: "Summary", body: data.summary },
    {
      title: "Key Decisions",
      body: data.keyDecisions.map((d, i) => `${i + 1}. ${d}`).join("\n"),
    },
    {
      title: "Action Items",
      body: data.actionItems
        .map((item) => `• ${item.task} (Assignee: ${item.assignee}, Due: ${item.dueDate})`)
        .join("\n"),
    },
    {
      title: "Next Steps",
      body: data.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    },
  ];

  for (const slide of slides) {
    try {
      await addSlide(userId, presentation.presentationId, slide.title, slide.body);
    } catch (err) {
      log.warn(
        { err, presentationId: presentation.presentationId, slideTitle: slide.title },
        "Failed to add MoM slide — continuing with remaining slides",
      );
    }
  }

  return presentation;
}
