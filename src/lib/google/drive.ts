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

const FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * Get or create the Yoodle Meetings root folder in Drive.
 */
export async function getOrCreateRootMeetingFolder(
  userId: string,
): Promise<DriveFile> {
  const { drive } = await getGoogleServices(userId);

  const res = await drive.files.list({
    q: `name = 'Yoodle Meetings' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id, name, mimeType, webViewLink, createdTime, modifiedTime, size, owners, shared)",
    pageSize: 1,
  });

  const existing = res.data.files?.[0];
  if (existing) {
    return formatFile(existing);
  }

  const created = await drive.files.create({
    requestBody: {
      name: "Yoodle Meetings",
      mimeType: FOLDER_MIME,
    },
    fields: "id, name, mimeType, webViewLink, createdTime, modifiedTime",
  });

  return formatFile(created.data);
}

/**
 * Sanitize a string for use as a folder name.
 * Replaces forbidden characters with `-` and truncates to 100 chars.
 */
function sanitizeFolderName(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, "-")
    .slice(0, 100)
    .trim();
}

/**
 * Get or create a meeting-specific folder: Yoodle Meetings / YYYY-MM / {Meeting Title}
 * Creates a 3-level folder hierarchy.
 */
export async function getOrCreateMeetingFolder(
  userId: string,
  meetingTitle: string,
  meetingDate: Date,
): Promise<DriveFile> {
  const { drive } = await getGoogleServices(userId);
  const root = await getOrCreateRootMeetingFolder(userId);

  // Format month folder name as YYYY-MM
  const year = meetingDate.getFullYear();
  const month = String(meetingDate.getMonth() + 1).padStart(2, "0");
  const monthName = `${year}-${month}`;

  // Search for month folder under root
  const monthRes = await drive.files.list({
    q: `name = '${monthName}' and mimeType = '${FOLDER_MIME}' and '${root.id}' in parents and trashed = false`,
    fields: "files(id, name, mimeType, webViewLink, createdTime, modifiedTime, size, owners, shared)",
    pageSize: 1,
  });

  let monthFolder: DriveFile;
  const existingMonth = monthRes.data.files?.[0];
  if (existingMonth) {
    monthFolder = formatFile(existingMonth);
  } else {
    const createdMonth = await drive.files.create({
      requestBody: {
        name: monthName,
        mimeType: FOLDER_MIME,
        parents: [root.id],
      },
      fields: "id, name, mimeType, webViewLink, createdTime, modifiedTime",
    });
    monthFolder = formatFile(createdMonth.data);
  }

  // Search for existing meeting folder before creating (prevents duplicates on retries)
  const safeName = sanitizeFolderName(meetingTitle);
  const escapedName = safeName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const escapedMonthId = monthFolder.id.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const existingMeeting = await drive.files.list({
    q: `name = '${escapedName}' and mimeType = '${FOLDER_MIME}' and '${escapedMonthId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType, webViewLink, createdTime, modifiedTime, size, owners, shared)",
    pageSize: 1,
  });

  if (existingMeeting.data.files?.[0]) {
    return formatFile(existingMeeting.data.files[0]);
  }

  const createdMeeting = await drive.files.create({
    requestBody: {
      name: safeName,
      mimeType: FOLDER_MIME,
      parents: [monthFolder.id],
    },
    fields: "id, name, mimeType, webViewLink, createdTime, modifiedTime",
  });

  return formatFile(createdMeeting.data);
}
