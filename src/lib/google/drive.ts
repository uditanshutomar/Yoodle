import { getGoogleServices } from "./client";
import { drive_v3 } from "googleapis";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  owners?: { displayName: string; emailAddress: string }[];
  shared: boolean;
}

/**
 * List files in Google Drive.
 */
export async function listFiles(
  userId: string,
  options: {
    maxResults?: number;
    query?: string;
    folderId?: string;
    mimeType?: string;
    orderBy?: string;
  } = {}
): Promise<DriveFile[]> {
  const { drive } = await getGoogleServices(userId);

  const queryParts: string[] = ["trashed = false"];

  if (options.folderId) {
    const escapedFolderId = options.folderId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    queryParts.push(`'${escapedFolderId}' in parents`);
  }
  if (options.mimeType) {
    const escapedMime = options.mimeType.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    queryParts.push(`mimeType = '${escapedMime}'`);
  }
  if (options.query) {
    const escaped = options.query.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    // Search both file name and content for broader matches
    queryParts.push(`(name contains '${escaped}' or fullText contains '${escaped}')`);
  }

  const res = await drive.files.list({
    pageSize: options.maxResults || 20,
    q: queryParts.join(" and "),
    orderBy: options.orderBy || "modifiedTime desc",
    fields: "files(id, name, mimeType, webViewLink, createdTime, modifiedTime, size, owners, shared)",
  });

  return (res.data.files || []).map(formatFile);
}

/**
 * Search files by name or content.
 */
export async function searchFiles(
  userId: string,
  query: string,
  maxResults = 10
): Promise<DriveFile[]> {
  return listFiles(userId, { query, maxResults });
}

/**
 * Create a new file in Google Drive.
 */
async function createFile(
  userId: string,
  options: {
    name: string;
    mimeType: string;
    content?: string;
    folderId?: string;
  }
): Promise<DriveFile> {
  const { drive } = await getGoogleServices(userId);

  const fileMetadata: Record<string, unknown> = {
    name: options.name,
    mimeType: options.mimeType,
  };

  if (options.folderId) {
    fileMetadata.parents = [options.folderId];
  }

  const requestParams: Record<string, unknown> = {
    requestBody: fileMetadata,
    fields: "id, name, mimeType, webViewLink, createdTime, modifiedTime",
  };

  if (options.content) {
    requestParams.media = {
      mimeType: "text/plain",
      body: options.content,
    };
  }

  const res = await drive.files.create(requestParams);
  return formatFile(res.data);
}

/**
 * Create a new Google Doc.
 */
export async function createGoogleDoc(
  userId: string,
  title: string,
  folderId?: string
): Promise<DriveFile> {
  return createFile(userId, {
    name: title,
    mimeType: "application/vnd.google-apps.document",
    folderId,
  });
}

function formatFile(file: drive_v3.Schema$File): DriveFile {
  return {
    id: file.id || "",
    name: file.name || "",
    mimeType: file.mimeType || "",
    webViewLink: file.webViewLink ?? undefined,
    createdTime: file.createdTime ?? undefined,
    modifiedTime: file.modifiedTime ?? undefined,
    size: file.size ?? undefined,
    owners: file.owners?.map((o) => ({
      displayName: o.displayName || "",
      emailAddress: o.emailAddress || "",
    })),
    shared: file.shared || false,
  };
}
