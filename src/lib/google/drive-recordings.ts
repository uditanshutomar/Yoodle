import { Readable } from "stream";
import { getGoogleServices } from "./client";
import { withRetry, isTransientError } from "@/lib/utils/retry";

const YOODLE_FOLDER_NAME = "Yoodle Recordings";

/**
 * Ensure a "Yoodle Recordings" folder exists in the user's Google Drive.
 * Returns the folder ID.  Caches per-user with TTL to avoid repeated lookups.
 * If the cached folder ID produces a 404, the cache entry is evicted and retried.
 */
const FOLDER_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const folderCache = new Map<string, { id: string; cachedAt: number }>();

/** Clear cached folder ID on 404 so the next call re-discovers the folder */
export function clearFolderCache(userId: string) {
  folderCache.delete(userId);
}

async function ensureYoodleFolder(userId: string): Promise<string> {
  const entry = folderCache.get(userId);
  if (entry && Date.now() - entry.cachedAt < FOLDER_CACHE_TTL_MS) return entry.id;

  const { drive } = await getGoogleServices(userId);

  // Search for existing folder
  const search = await drive.files.list({
    q: `name = '${YOODLE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
  });

  if (search.data.files && search.data.files.length > 0) {
    const folderId = search.data.files[0].id!;
    folderCache.set(userId, { id: folderId, cachedAt: Date.now() });
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
  folderCache.set(userId, { id: folderId, cachedAt: Date.now() });
  return folderId;
}

/**
 * Ensure a sub-folder for a specific meeting exists inside "Yoodle Recordings".
 */
async function ensureMeetingFolder(
  userId: string,
  meetingId: string,
  meetingTitle?: string
): Promise<string> {
  const parentId = await ensureYoodleFolder(userId);
  const { drive } = await getGoogleServices(userId);

  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const timePart = now.toTimeString().slice(0, 5).replace(":", "-");
  const safeName = meetingTitle
    ? meetingTitle.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "_")
    : "Meeting";
  const folderName = `${safeName}_${datePart}_${timePart}`;

  // Check if the meeting sub-folder already exists
  const escapedMeetingSuffix = meetingId.slice(-6).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const escapedParentId = parentId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const search = await drive.files.list({
    q: `name contains '${escapedMeetingSuffix}' and '${escapedParentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
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

  const res = await withRetry(
    () => drive.files.create({
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
    }),
    { retryOn: isTransientError }
  );

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

    const escapedSuffix = meetingId.slice(-6).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const escapedParent = parentId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const search = await drive.files.list({
      q: `name contains '${escapedSuffix}' and '${escapedParent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
      pageSize: 1,
    });

    if (!search.data.files || search.data.files.length === 0) {
      return [];
    }

    folderId = search.data.files[0].id!;

    // List video/audio files in the meeting folder
    const escapedFolderId = folderId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const files = await drive.files.list({
      q: `'${escapedFolderId}' in parents and trashed = false and (mimeType contains 'video/' or mimeType contains 'audio/')`,
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

