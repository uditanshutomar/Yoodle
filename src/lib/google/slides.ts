import { getGoogleServices } from "./client";

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
  actionItems: { task: string; owner: string; due: string }[];
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

  if (!slide?.pageElements) return;

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

  // Slide 1: Summary
  await addSlide(userId, presentation.presentationId, "Summary", data.summary);

  // Slide 2: Key Decisions (numbered)
  const decisionsBody = data.keyDecisions
    .map((d, i) => `${i + 1}. ${d}`)
    .join("\n");
  await addSlide(
    userId,
    presentation.presentationId,
    "Key Decisions",
    decisionsBody
  );

  // Slide 3: Action Items (bulleted with owner/due)
  const actionItemsBody = data.actionItems
    .map((item) => `• ${item.task} (Owner: ${item.owner}, Due: ${item.due})`)
    .join("\n");
  await addSlide(
    userId,
    presentation.presentationId,
    "Action Items",
    actionItemsBody
  );

  // Slide 4: Next Steps (numbered)
  const nextStepsBody = data.nextSteps
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");
  await addSlide(
    userId,
    presentation.presentationId,
    "Next Steps",
    nextStepsBody
  );

  return presentation;
}
