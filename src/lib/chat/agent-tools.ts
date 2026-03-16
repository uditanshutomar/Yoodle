import { listEvents } from "@/lib/google/calendar";
import { listTasks } from "@/lib/google/tasks";
import { listEmails, getUnreadCount } from "@/lib/google/gmail";
import { listFiles } from "@/lib/google/drive";
import { searchContacts } from "@/lib/google/contacts";
import { getDocContent } from "@/lib/google/docs";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("agent-tools");

export interface GatheredData {
  calendar?: string;
  tasks?: string;
  emails?: string;
  files?: string;
  contacts?: string;
  docs?: string;
  errors?: string[];
}

/** Tool execution timeout — 10s per tool to avoid blocking the pipeline */
const TOOL_TIMEOUT_MS = 10_000;

/**
 * Execute tool plan from the DECIDE stage.
 * Returns formatted string data the RESPOND stage can use.
 */
export async function executeToolPlan(
  userId: string,
  toolPlan: string[]
): Promise<GatheredData> {
  const result: GatheredData = { errors: [] };

  const tools = toolPlan.filter((t) => t !== "none");
  if (tools.length === 0) return result;

  const promises: Promise<void>[] = [];

  if (tools.includes("check_calendar")) {
    promises.push(
      withTimeout(fetchCalendar(userId), TOOL_TIMEOUT_MS, "Calendar: Timed out fetching data.")
        .then((data) => { result.calendar = data; })
    );
  }

  if (tools.includes("check_tasks")) {
    promises.push(
      withTimeout(fetchTasks(userId), TOOL_TIMEOUT_MS, "Tasks: Timed out fetching data.")
        .then((data) => { result.tasks = data; })
    );
  }

  if (tools.includes("check_emails")) {
    promises.push(
      withTimeout(fetchEmails(userId), TOOL_TIMEOUT_MS, "Emails: Timed out fetching data.")
        .then((data) => { result.emails = data; })
    );
  }

  if (tools.includes("check_recent_files")) {
    promises.push(
      withTimeout(fetchRecentFiles(userId), TOOL_TIMEOUT_MS, "Files: Timed out fetching data.")
        .then((data) => { result.files = data; })
    );
  }

  // search_contacts:NAME — extract the name from the tool string
  const contactTool = tools.find((t) => t.startsWith("search_contacts:"));
  if (contactTool) {
    const query = contactTool.split(":").slice(1).join(":");
    if (!query.trim()) {
      result.errors?.push("search_contacts: no name provided");
    } else {
      promises.push(
        withTimeout(fetchContacts(userId, query), TOOL_TIMEOUT_MS, "Contacts: Timed out fetching data.")
          .then((data) => { result.contacts = data; })
      );
    }
  }

  // read_doc:DOC_ID — read a Google Doc by its document ID
  const docTool = tools.find((t) => t.startsWith("read_doc:"));
  if (docTool) {
    const docId = docTool.split(":").slice(1).join(":");
    if (!docId.trim() || docId.startsWith("<")) {
      result.errors?.push("read_doc: no valid document ID provided");
    } else {
      promises.push(
        withTimeout(fetchDocContent(userId, docId), TOOL_TIMEOUT_MS, "Docs: Timed out reading document.")
          .then((data) => { result.docs = data; })
      );
    }
  }

  await Promise.allSettled(promises);
  return result;
}

/** Race a promise against a timeout, returning fallback string on timeout.
 *  Clears the timer when the real promise wins. Returns a settled-flag wrapper
 *  so the late-resolving promise cannot mutate results after the race is over. */
async function withTimeout(
  promise: Promise<string>,
  ms: number,
  fallback: string
): Promise<string> {
  let settled = false;
  let timerId: ReturnType<typeof setTimeout>;

  try {
    const result = await Promise.race([
      promise.then((v) => { settled = true; clearTimeout(timerId); return v; }),
      new Promise<string>((resolve) => {
        timerId = setTimeout(() => { if (!settled) { settled = true; resolve(fallback); } }, ms);
      }),
    ]);
    return result;
  } catch {
    settled = true;
    clearTimeout(timerId!);
    return fallback;
  }
}

async function fetchCalendar(userId: string): Promise<string> {
  try {
    // Get events for the next 3 days
    const now = new Date();
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const events = await listEvents(userId, {
      maxResults: 15,
      timeMin: now.toISOString(),
      timeMax: threeDaysLater.toISOString(),
    });

    if (events.length === 0) {
      return "Calendar: No events in the next 3 days — wide open.";
    }

    // Use the ISO start/end times directly — Gemini can interpret them correctly
    // and the Google Calendar API returns times in the user's calendar timezone
    const formatted = events.map((e) => {
      const start = new Date(e.start);
      const end = new Date(e.end);
      // Format using the ISO string which preserves timezone from Google Calendar
      const day = formatDay(start);
      const timeRange = `${formatTime(start)}–${formatTime(end)}`;
      const attendeeList = e.attendees?.length
        ? ` (with ${e.attendees.slice(0, 5).map((a: { email: string }) => a.email.split("@")[0]).join(", ")}${e.attendees.length > 5 ? ` +${e.attendees.length - 5} more` : ""})`
        : "";
      return `  ${day} ${timeRange}: ${e.title}${attendeeList}`;
    });

    // Compute free slots for today
    const todayStr = now.toISOString().split("T")[0];
    const todayEvents = events
      .filter((e) => e.start.startsWith(todayStr) || new Date(e.start).toDateString() === now.toDateString())
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    // Work hours: 9am–6pm (relative to current server time, good enough for gap detection)
    const workStart = new Date(now);
    workStart.setHours(9, 0, 0, 0);
    const workEnd = new Date(now);
    workEnd.setHours(18, 0, 0, 0);

    let freeSlots = "";
    if (now > workEnd) {
      freeSlots = "\nWork hours are over for today.";
    } else if (todayEvents.length === 0) {
      freeSlots = `\nFree today: ${formatTime(now > workStart ? now : workStart)}–${formatTime(workEnd)}`;
    } else {
      const gaps: string[] = [];
      let cursor = new Date(Math.max(now.getTime(), workStart.getTime()));

      for (const evt of todayEvents) {
        const evtStart = new Date(evt.start);
        const evtEnd = new Date(evt.end);

        // Skip events that already ended
        if (evtEnd <= cursor) continue;

        if (evtStart > cursor) {
          const gapMins = Math.round((evtStart.getTime() - cursor.getTime()) / 60000);
          if (gapMins >= 30) {
            gaps.push(`${formatTime(cursor)}–${formatTime(evtStart)} (${gapMins}min)`);
          }
        }
        // Move cursor to the later of current cursor or event end
        if (evtEnd > cursor) cursor = evtEnd;
      }

      // Check remaining time after last event
      if (cursor < workEnd) {
        const gapMins = Math.round((workEnd.getTime() - cursor.getTime()) / 60000);
        if (gapMins >= 30) {
          gaps.push(`${formatTime(cursor)}–${formatTime(workEnd)} (${gapMins}min)`);
        }
      }

      if (gaps.length > 0) {
        freeSlots = `\nFree slots today: ${gaps.join(", ")}`;
      } else {
        freeSlots = "\nNo free slots today (back-to-back meetings)";
      }
    }

    return `Calendar (next 3 days):\n${formatted.join("\n")}${freeSlots}`;
  } catch (error) {
    log.warn({ error, userId }, "Failed to fetch calendar for agent");
    return "Calendar: Unable to access (Google account may not be connected).";
  }
}

async function fetchTasks(userId: string): Promise<string> {
  try {
    const tasks = await listTasks(userId, "@default", {
      showCompleted: false,
      maxResults: 10,
    });

    if (tasks.length === 0) {
      return "Tasks: No pending tasks.";
    }

    const now = new Date();
    const formatted = tasks.map((t) => {
      const due = t.due ? ` (due ${formatDay(new Date(t.due))})` : "";
      const isOverdue = t.due && new Date(t.due) < now;
      return `  ${isOverdue ? "⚠ " : "- "}${t.title}${due}`;
    });

    const overdue = tasks.filter((t) => t.due && new Date(t.due) < now);
    const overdueNote =
      overdue.length > 0 ? `\n${overdue.length} OVERDUE` : "";

    return `Tasks (${tasks.length} pending${overdueNote}):\n${formatted.join("\n")}`;
  } catch (error) {
    log.warn({ error, userId }, "Failed to fetch tasks for agent");
    return "Tasks: Unable to access (Google account may not be connected).";
  }
}

async function fetchEmails(userId: string): Promise<string> {
  try {
    const [emails, unreadCount] = await Promise.all([
      listEmails(userId, { maxResults: 8, labelIds: ["INBOX"] }),
      getUnreadCount(userId),
    ]);

    if (emails.length === 0) {
      return `Emails: Inbox empty. ${unreadCount} unread.`;
    }

    const formatted = emails.slice(0, 8).map((e) => {
      const from = e.from.split("<")[0].trim() || e.from;
      const date = new Date(e.date);
      const age = getRelativeTime(date);
      const unread = e.isUnread ? " 🔵" : "";
      return `  ${unread}${from}: "${e.subject}" (${age})`;
    });

    const urgentKeywords = /urgent|asap|critical|deadline|action required|immediately/i;
    const urgentCount = emails.filter(
      (e) => urgentKeywords.test(e.subject) || urgentKeywords.test(e.snippet)
    ).length;

    const urgentNote = urgentCount > 0 ? ` — ${urgentCount} potentially urgent` : "";

    return `Emails (${unreadCount} unread${urgentNote}):\n${formatted.join("\n")}`;
  } catch (error) {
    log.warn({ error, userId }, "Failed to fetch emails for agent");
    return "Emails: Unable to access (Google account may not be connected).";
  }
}

async function fetchRecentFiles(userId: string): Promise<string> {
  try {
    const files = await listFiles(userId, { maxResults: 8 });

    if (files.length === 0) {
      return "Drive: No recent files.";
    }

    const formatted = files.map((f) => {
      const modified = f.modifiedTime ? getRelativeTime(new Date(f.modifiedTime)) : "";
      const type = getMimeLabel(f.mimeType);
      const link = f.webViewLink ? ` — ${f.webViewLink}` : "";
      const fileId = f.id ? ` [id:${f.id}]` : "";
      return `  - ${f.name} (${type}, ${modified})${fileId}${link}`;
    });

    return `Recent files:\n${formatted.join("\n")}\nTip: Use file IDs above with read_doc to read Google Docs content.`;
  } catch (error) {
    log.warn({ error, userId }, "Failed to fetch files for agent");
    return "Drive: Unable to access (Google account may not be connected).";
  }
}

async function fetchContacts(userId: string, query: string): Promise<string> {
  try {
    const contacts = await searchContacts(userId, query, 5);

    if (contacts.length === 0) {
      return `Contacts: No results for "${query}".`;
    }

    const formatted = contacts.map((c) => {
      const parts = [c.name];
      if (c.email) parts.push(c.email);
      if (c.organization) parts.push(c.organization);
      if (c.phone) parts.push(c.phone);
      return `  - ${parts.join(" | ")}`;
    });

    return `Contacts matching "${query}":\n${formatted.join("\n")}`;
  } catch (error) {
    log.warn({ error, userId, query }, "Failed to search contacts for agent");
    return "Contacts: Unable to access (Google account may not be connected).";
  }
}

async function fetchDocContent(userId: string, documentId: string): Promise<string> {
  try {
    const doc = await getDocContent(userId, documentId);

    if (!doc.body || doc.body.trim().length === 0) {
      return `Doc "${doc.title}": Empty document.\nLink: ${doc.webViewLink || `https://docs.google.com/document/d/${documentId}/edit`}`;
    }

    // Truncate body to ~2000 chars to avoid bloating the prompt
    const MAX_BODY = 2000;
    const body = doc.body.length > MAX_BODY
      ? doc.body.slice(0, MAX_BODY) + "\n... (truncated — full doc available via link)"
      : doc.body;

    const link = doc.webViewLink || `https://docs.google.com/document/d/${documentId}/edit`;
    return `Doc "${doc.title}":\n${body}\n\nOpen in Drive: ${link}`;
  } catch (error) {
    log.warn({ error, userId, documentId }, "Failed to read doc for agent");
    return "Docs: Unable to read document (may not exist or Google account not connected).";
  }
}

/** Get a human-readable relative time string */
function getRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  // Guard against future dates (clock skew, timezone offsets)
  if (diffMs < 0) return "just now";
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return formatDay(date);
}

/** Map Google Drive MIME types to short labels */
function getMimeLabel(mime: string): string {
  const map: Record<string, string> = {
    "application/vnd.google-apps.document": "Doc",
    "application/vnd.google-apps.spreadsheet": "Sheet",
    "application/vnd.google-apps.presentation": "Slides",
    "application/vnd.google-apps.folder": "Folder",
    "application/pdf": "PDF",
    "image/png": "PNG",
    "image/jpeg": "JPEG",
  };
  return map[mime] || mime.split("/").pop() || "file";
}

/** Format a Date to short day string like "Mon Mar 15" */
function formatDay(d: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
}

/** Format a Date to short time string like "2:30 PM" */
function formatTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * Format gathered data into a single string for the RESPOND prompt.
 */
export function formatGatheredData(data: GatheredData): string {
  const parts: string[] = [];
  if (data.calendar) parts.push(data.calendar);
  if (data.tasks) parts.push(data.tasks);
  if (data.emails) parts.push(data.emails);
  if (data.files) parts.push(data.files);
  if (data.contacts) parts.push(data.contacts);
  if (data.docs) parts.push(data.docs);
  if (parts.length === 0) return "(no data fetched)";
  return parts.join("\n\n");
}
