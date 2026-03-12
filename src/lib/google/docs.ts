import { getGoogleServices } from "./client";
import { docs_v1 } from "googleapis";

export interface DocContent {
  title: string;
  body: string;
  documentId: string;
}

/**
 * Get the content of a Google Doc.
 */
export async function getDocContent(
  userId: string,
  documentId: string
): Promise<DocContent> {
  const { docs } = await getGoogleServices(userId);

  const res = await docs.documents.get({ documentId });
  const doc = res.data;

  const body = extractTextFromDoc(doc);

  return {
    title: doc.title || "",
    body,
    documentId: doc.documentId || documentId,
  };
}

/**
 * Append text to the end of a Google Doc.
 */
export async function appendToDoc(
  userId: string,
  documentId: string,
  text: string
): Promise<void> {
  const { docs } = await getGoogleServices(userId);

  // Get the current end index of the document
  const doc = await docs.documents.get({ documentId });
  const endIndex =
    doc.data.body?.content?.slice(-1)?.[0]?.endIndex || 1;

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: endIndex - 1 },
            text,
          },
        },
      ],
    },
  });
}

/**
 * Replace all occurrences of a string in a Google Doc.
 */
export async function replaceTextInDoc(
  userId: string,
  documentId: string,
  searchText: string,
  replaceText: string
): Promise<void> {
  const { docs } = await getGoogleServices(userId);

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          replaceAllText: {
            containsText: {
              text: searchText,
              matchCase: true,
            },
            replaceText,
          },
        },
      ],
    },
  });
}

/**
 * Extract plain text from a Google Docs document object.
 */
function extractTextFromDoc(doc: docs_v1.Schema$Document): string {
  const content = doc.body?.content || [];
  let text = "";

  for (const element of content) {
    if (element.paragraph) {
      for (const el of element.paragraph.elements || []) {
        if (el.textRun?.content) {
          text += el.textRun.content;
        }
      }
    } else if (element.table) {
      for (const row of element.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          for (const cellContent of cell.content || []) {
            if (cellContent.paragraph) {
              for (const el of cellContent.paragraph.elements || []) {
                if (el.textRun?.content) {
                  text += el.textRun.content;
                }
              }
            }
          }
          text += "\t";
        }
        text += "\n";
      }
    }
  }

  return text;
}
