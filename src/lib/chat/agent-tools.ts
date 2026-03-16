import { listEvents } from "@/lib/google/calendar";
import { listTasks } from "@/lib/google/tasks";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("agent-tools");

export interface GatheredData {
  calendar?: string;
  tasks?: string;
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

  await Promise.allSettled(promises);
  return result;
}

/** Race a promise against a timeout, returning fallback string on timeout */
async function withTimeout(
  promise: Promise<string>,
  ms: number,
  fallback: string
): Promise<string> {
  try {
    return await Promise.race([
      promise,
      new Promise<string>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);
  } catch {
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
  if (parts.length === 0) return "(no data fetched)";
  return parts.join("\n\n");
}
