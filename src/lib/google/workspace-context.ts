import { hasGoogleAccess } from "./client";
import { listEmails, getUnreadCount } from "./gmail";
import { listEvents } from "./calendar";
import { listTasks } from "./tasks";
import { listFiles } from "./drive";

/**
 * Build a rich workspace context string for the AI assistant.
 * Fetches the user's recent emails, upcoming events, pending tasks, and recent files
 * to give Doodle full awareness of their Google Workspace state.
 */
export async function buildWorkspaceContext(userId: string): Promise<string> {
  const hasAccess = await hasGoogleAccess(userId);
  if (!hasAccess) return "";

  const parts: string[] = [];

  // Fetch all workspace data in parallel
  const [emailResult, calendarResult, tasksResult, driveResult, unreadResult] =
    await Promise.allSettled([
      listEmails(userId, { maxResults: 5 }),
      listEvents(userId, { maxResults: 10 }),
      listTasks(userId, "@default", { maxResults: 10 }),
      listFiles(userId, { maxResults: 5, orderBy: "modifiedTime desc" }),
      getUnreadCount(userId),
    ]);

  // Unread email count
  if (unreadResult.status === "fulfilled") {
    parts.push(`Unread emails: ${unreadResult.value}`);
  }

  // Recent emails
  if (emailResult.status === "fulfilled" && emailResult.value.length > 0) {
    const emailSummaries = emailResult.value
      .map((e) => `  - From: ${e.from} | Subject: "${e.subject}" | ${e.isUnread ? "UNREAD" : "read"} | ${e.date}`)
      .join("\n");
    parts.push(`Recent emails:\n${emailSummaries}`);
  }

  // Upcoming calendar events
  if (calendarResult.status === "fulfilled" && calendarResult.value.length > 0) {
    const eventSummaries = calendarResult.value
      .map((e) => {
        const attendeeList = e.attendees.length > 0
          ? ` (with: ${e.attendees.map((a) => a.name || a.email).join(", ")})`
          : "";
        return `  - "${e.title}" at ${e.start}${attendeeList}${e.meetLink ? " [has Meet link]" : ""}`;
      })
      .join("\n");
    parts.push(`Upcoming calendar events:\n${eventSummaries}`);
  }

  // Pending tasks
  if (tasksResult.status === "fulfilled" && tasksResult.value.length > 0) {
    const taskSummaries = tasksResult.value
      .map((t) => `  - ${t.title}${t.due ? ` (due: ${t.due})` : ""}${t.notes ? ` — ${t.notes}` : ""}`)
      .join("\n");
    parts.push(`Pending Google Tasks:\n${taskSummaries}`);
  }

  // Recently modified files
  if (driveResult.status === "fulfilled" && driveResult.value.length > 0) {
    const fileSummaries = driveResult.value
      .map((f) => `  - "${f.name}" (${f.mimeType}) — modified ${f.modifiedTime}`)
      .join("\n");
    parts.push(`Recently modified Drive files:\n${fileSummaries}`);
  }

  if (parts.length === 0) return "";

  return `\n\nGoogle Workspace Context (user's real data — use this to help them):\n${parts.join("\n\n")}`;
}
