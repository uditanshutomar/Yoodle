/**
 * BullMQ Job Payload Types
 *
 * Typed payloads for each durable queue. These are serialized to JSON
 * and stored in Redis — all fields must be JSON-serializable (no ObjectId,
 * no Date objects, no Buffers).
 */

// ── Post-Meeting Cascade ────────────────────────────────────────────

export interface PostMeetingCascadePayload {
  /** Meeting ObjectId (as string) */
  meetingId: string;
  /** Host user ObjectId (as string) */
  hostId: string;
  /** ISO string of when the meeting ended — used for calendar end-time sync */
  endedAt: string;
}

// ── Calendar Sync ───────────────────────────────────────────────────

export interface CalendarSyncPayload {
  /** Action to perform on the calendar event */
  action: "delete";
  /** User whose OAuth token to use */
  userId: string;
  /** Google Calendar event ID */
  calendarEventId: string;
  /** Meeting ObjectId for logging context */
  meetingId: string;
}

// ── Recording Process ────────────────────────────────────────────────

export interface RecordingProcessPayload {
  /** Meeting ObjectId (as string) */
  meetingId: string;
  /** User who uploaded the recording */
  userId: string;
  /** Google Drive file ID of the uploaded recording */
  driveFileId: string;
  /** Original file name */
  fileName: string;
}
