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
    queryParts.push(`'${options.folderId}' in parents`);
  }
  if (options.mimeType) {
    queryParts.push(`mimeType = '${options.mimeType}'`);
  }
  if (options.query) {
    queryParts.push(`fullText contains '${options.query.replace(/'/g, "\\'")}'`);
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
 * Get file metadata by ID.
 */
export async function getFile(
  userId: string,
  fileId: string
): Promise<DriveFile> {
  const { drive } = await getGoogleServices(userId);

  const res = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, webViewLink, createdTime, modifiedTime, size, owners, shared",
  });

  return formatFile(res.data);
}

/**
 * Read plain text content of a Google Doc, Sheet, or text file.
 */
export async function getFileContent(
  userId: string,
  fileId: string
): Promise<string> {
  const { drive } = await getGoogleServices(userId);

  const res = await drive.files.export({
    fileId,
    mimeType: "text/plain",
  });

  return res.data as string;
}

/**
 * Create a new file in Google Drive.
 */
export async function createFile(
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

/**
 * Create a new Google Sheet.
 */
export async function createGoogleSheet(
  userId: string,
  title: string,
  folderId?: string
): Promise<DriveFile> {
  return createFile(userId, {
    name: title,
    mimeType: "application/vnd.google-apps.spreadsheet",
    folderId,
  });
}

/**
 * Create a new Google Slides presentation.
 */
export async function createGoogleSlides(
  userId: string,
  title: string,
  folderId?: string
): Promise<DriveFile> {
  return createFile(userId, {
    name: title,
    mimeType: "application/vnd.google-apps.presentation",
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
