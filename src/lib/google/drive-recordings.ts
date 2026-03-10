import { Readable } from "stream";
import { getGoogleServices } from "./client";

const YOODLE_FOLDER_NAME = "Yoodle Recordings";

/**
 * Ensure a "Yoodle Recordings" folder exists in the user's Google Drive.
 * Returns the folder ID.  Caches per-user to avoid repeated lookups.
 */
const folderCache = new Map<string, string>();

export async function ensureYoodleFolder(userId: string): Promise<string> {
  const cached = folderCache.get(userId);
  if (cached) return cached;

  const { drive } = await getGoogleServices(userId);

  // Search for existing folder
  const search = await drive.files.list({
    q: `name = '${YOODLE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
  });

  if (search.data.files && search.data.files.length > 0) {
    const folderId = search.data.files[0].id!;
    folderCache.set(userId, folderId);
    return folderId;
  }

  // Create the folder
  const folder = await drive.files.create({
    requestBody: {
      name: YOODLE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  const folderId = folder.data.id!;
  folderCache.set(userId, folderId);
  return folderId;
}

/**
 * Ensure a sub-folder for a specific meeting exists inside "Yoodle Recordings".
 */
export async function ensureMeetingFolder(
  userId: string,
  meetingId: string,
  meetingTitle?: string
): Promise<string> {
  const parentId = await ensureYoodleFolder(userId);
  const { drive } = await getGoogleServices(userId);

  const folderName = meetingTitle
    ? `${meetingTitle} (${meetingId.slice(-6)})`
    : `Meeting ${meetingId.slice(-6)}`;

  // Check if the meeting sub-folder already exists
  const search = await drive.files.list({
    q: `name contains '${meetingId.slice(-6)}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
  });

  if (search.data.files && search.data.files.length > 0) {
    return search.data.files[0].id!;
  }

  // Create it
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });

  return folder.data.id!;
}

export interface DriveRecording {
  fileId: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  webViewLink?: string;
  webContentLink?: string;
}

/**
 * Upload a recording buffer to Google Drive under the meeting's folder.
 */
export async function uploadRecordingToDrive(
  userId: string,
  meetingId: string,
  options: {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    meetingTitle?: string;
  }
): Promise<DriveRecording> {
  const folderId = await ensureMeetingFolder(
    userId,
    meetingId,
    options.meetingTitle
  );

  const { drive } = await getGoogleServices(userId);

  const res = await drive.files.create({
    requestBody: {
      name: options.fileName,
      mimeType: options.mimeType,
      parents: [folderId],
    },
    media: {
      mimeType: options.mimeType,
      body: Readable.from(options.buffer),
    },
    fields: "id, name, mimeType, size, createdTime, webViewLink, webContentLink",
  });

  return {
    fileId: res.data.id!,
    name: res.data.name || options.fileName,
    mimeType: res.data.mimeType || options.mimeType,
    size: res.data.size || undefined,
    createdTime: res.data.createdTime || undefined,
    webViewLink: res.data.webViewLink || undefined,
    webContentLink: res.data.webContentLink || undefined,
  };
}

/**
 * List all recordings for a meeting from Google Drive.
 */
export async function listMeetingRecordings(
  userId: string,
  meetingId: string
): Promise<DriveRecording[]> {
  let folderId: string;
  try {
    // Try to find the meeting folder — if it doesn't exist, there are no recordings
    const parentId = await ensureYoodleFolder(userId);
    const { drive } = await getGoogleServices(userId);

    const search = await drive.files.list({
      q: `name contains '${meetingId.slice(-6)}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
      pageSize: 1,
    });

    if (!search.data.files || search.data.files.length === 0) {
      return [];
    }

    folderId = search.data.files[0].id!;

    // List video/audio files in the meeting folder
    const files = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and (mimeType contains 'video/' or mimeType contains 'audio/')`,
      fields:
        "files(id, name, mimeType, size, createdTime, webViewLink, webContentLink)",
      orderBy: "createdTime desc",
      pageSize: 50,
    });

    return (files.data.files || []).map((f) => ({
      fileId: f.id!,
      name: f.name || "",
      mimeType: f.mimeType || "",
      size: f.size || undefined,
      createdTime: f.createdTime || undefined,
      webViewLink: f.webViewLink || undefined,
      webContentLink: f.webContentLink || undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Get a temporary download link for a recording file.
 * Returns a webContentLink that can be used for direct download.
 */
export async function getRecordingDownloadUrl(
  userId: string,
  fileId: string
): Promise<string | null> {
  try {
    const { drive } = await getGoogleServices(userId);

    // Make the file accessible via a direct download link
    const file = await drive.files.get({
      fileId,
      fields: "webContentLink, webViewLink",
    });

    return file.data.webContentLink || file.data.webViewLink || null;
  } catch {
    return null;
  }
}
