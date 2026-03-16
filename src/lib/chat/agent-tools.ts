import { listEvents } from "@/lib/google/calendar";
import { listTasks } from "@/lib/google/tasks";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("agent-tools");

export interface GatheredData {
  calendar?: string;
  tasks?: string;
  errors?: string[];
}

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
      fetchCalendar(userId).then((data) => {
        result.calendar = data;
      })
    );
  }

  if (tools.includes("check_tasks")) {
    promises.push(
      fetchTasks(userId).then((data) => {
        result.tasks = data;
      })
    );
  }

  await Promise.allSettled(promises);
  return result;
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

    const formatted = events.map((e) => {
      const start = new Date(e.start);
      const end = new Date(e.end);
      const day = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const timeRange = `${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}–${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
      const attendees = e.attendees?.length
        ? ` (with ${e.attendees.map((a: { email: string }) => a.email.split("@")[0]).join(", ")})`
        : "";
      return `  ${day} ${timeRange}: ${e.title}${attendees}`;
    });

    // Also compute free slots for today
    const todayEnd = new Date(now);
    todayEnd.setHours(18, 0, 0, 0); // Assume work ends at 6pm

    const todayEvents = events.filter((e) => {
      const start = new Date(e.start);
      return start.toDateString() === now.toDateString();
    });

    let freeSlots = "";
    if (todayEvents.length === 0) {
      freeSlots = `\nFree today: All day until 6:00 PM`;
    } else {
      // Simple gap detection
      const gaps: string[] = [];
      let cursor = new Date(Math.max(now.getTime(), new Date(now).setHours(9, 0, 0, 0)));

      for (const evt of todayEvents) {
        const evtStart = new Date(evt.start);
        const evtEnd = new Date(evt.end);
        if (evtStart > cursor) {
          const gapMins = Math.round((evtStart.getTime() - cursor.getTime()) / 60000);
          if (gapMins >= 30) {
            gaps.push(
              `${cursor.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}–${evtStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} (${gapMins}min)`
            );
          }
        }
        cursor = evtEnd > cursor ? evtEnd : cursor;
      }

      if (cursor < todayEnd) {
        const gapMins = Math.round((todayEnd.getTime() - cursor.getTime()) / 60000);
        if (gapMins >= 30) {
          gaps.push(
            `${cursor.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}–6:00 PM (${gapMins}min)`
          );
        }
      }

      if (gaps.length > 0) {
        freeSlots = `\nFree slots today: ${gaps.join(", ")}`;
      } else {
        freeSlots = `\nNo free slots today (back-to-back until 6 PM)`;
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

    const formatted = tasks.map((t) => {
      const due = t.due
        ? ` (due ${new Date(t.due).toLocaleDateString("en-US", { month: "short", day: "numeric" })})`
        : "";
      return `  - ${t.title}${due}`;
    });

    const overdue = tasks.filter((t) => t.due && new Date(t.due) < new Date());
    const overdueNote =
      overdue.length > 0 ? `\n⚠ ${overdue.length} overdue task(s)` : "";

    return `Tasks (${tasks.length} pending):\n${formatted.join("\n")}${overdueNote}`;
  } catch (error) {
    log.warn({ error, userId }, "Failed to fetch tasks for agent");
    return "Tasks: Unable to access (Google account may not be connected).";
  }
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
