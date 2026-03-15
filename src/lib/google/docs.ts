import { getGoogleServices } from "./client";

export interface DocContent {
  documentId: string;
  title: string;
  body: string;
  revisionId?: string;
  webViewLink: string;
}

/**
 * Get the content of a Google Doc as plain text.
 */
export async function getDocContent(
  userId: string,
  documentId: string
): Promise<DocContent> {
  const { docs, drive } = await getGoogleServices(userId);

  const [docRes, fileRes] = await Promise.all([
    docs.documents.get({ documentId }),
    drive.files.get({ fileId: documentId, fields: "webViewLink" }),
  ]);

  const doc = docRes.data;
  const body = extractPlainText(doc.body?.content || []);

  return {
    documentId: doc.documentId || documentId,
    title: doc.title || "",
    body,
    revisionId: doc.revisionId ?? undefined,
    webViewLink: fileRes.data.webViewLink || `https://docs.google.com/document/d/${documentId}/edit`,
  };
}

/**
 * Append text to the end of a Google Doc.
 */
export async function appendToDoc(
  userId: string,
  documentId: string,
  text: string
): Promise<{ documentId: string }> {
  const { docs } = await getGoogleServices(userId);

  // Get current doc to check if it already ends with a newline
  const docRes = await docs.documents.get({ documentId });
  const content = docRes.data.body?.content || [];
  const endIndex = getDocEndIndex(content);

  // Check if the doc already ends with a newline to avoid double blank lines
  const existingText = extractPlainText(content);
  const prefix = existingText.endsWith("\n") ? "" : "\n";

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: endIndex },
            text: prefix + text,
          },
        },
      ],
    },
  });

  return { documentId };
}

/**
 * Find and replace text in a Google Doc.
 */
export async function findAndReplaceInDoc(
  userId: string,
  documentId: string,
  find: string,
  replace: string,
  matchCase = false
): Promise<{ occurrences: number }> {
  const { docs } = await getGoogleServices(userId);

  const res = await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          replaceAllText: {
            containsText: {
              text: find,
              matchCase,
            },
            replaceText: replace,
          },
        },
      ],
    },
  });

  const occurrences =
    res.data.replies?.[0]?.replaceAllText?.occurrencesChanged || 0;
  return { occurrences };
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Extract plain text from Google Docs structural elements */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPlainText(content: any[]): string {
  let text = "";
  for (const element of content) {
    if (element.paragraph?.elements) {
      for (const el of element.paragraph.elements) {
        if (el.textRun?.content) {
          text += el.textRun.content;
        }
      }
    }
    if (element.table) {
      for (const row of element.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          text += extractPlainText(cell.content || []);
        }
        text += "\n";
      }
    }
  }
  return text;
}

/** Get the end index of the document body for appending */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDocEndIndex(content: any[]): number {
  if (content.length === 0) return 1;
  const lastElement = content[content.length - 1];
  return (lastElement.endIndex || 1) - 1;
}
