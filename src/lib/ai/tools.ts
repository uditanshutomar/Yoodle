import {
  FunctionDeclarationsTool,
  FunctionCallingMode,
  SchemaType,
} from "@google/generative-ai";
import { sendEmail, searchEmails, modifyEmailLabels, listEmails, getUnreadCount, getEmail, replyToEmail } from "@/lib/google/gmail";
import { createEvent, listEvents, updateEvent, deleteEvent } from "@/lib/google/calendar";
import { createTask, completeTask, listTasks, listTaskLists, updateTask, deleteTask } from "@/lib/google/tasks";
import { searchFiles, listFiles, createGoogleDoc } from "@/lib/google/drive";
import { searchContacts } from "@/lib/google/contacts";
import { getDocContent, appendToDoc, findAndReplaceInDoc } from "@/lib/google/docs";
import { readSheet, writeSheet, appendToSheet, createSpreadsheet, clearSheetRange } from "@/lib/google/sheets";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("ai:tools");

// ── Gemini Function Declarations ────────────────────────────────────

export const WORKSPACE_TOOLS: FunctionDeclarationsTool = {
  functionDeclarations: [
    // ── Gmail ──────────────────────────────────────────────────────
    {
      name: "send_email",
      description:
        "Send an email on behalf of the user. Use this when the user asks to send, compose, or draft an email.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          to: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "List of recipient email addresses.",
          },
          subject: {
            type: SchemaType.STRING,
            description: "Email subject line.",
          },
          body: {
            type: SchemaType.STRING,
            description:
              "Email body content. Use plain text unless the user asks for HTML formatting.",
          },
          cc: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "CC recipients (optional).",
          },
          bcc: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "BCC recipients (optional).",
          },
          isHtml: {
            type: SchemaType.BOOLEAN,
            description:
              "Set to true if the body contains HTML formatting. Default: false (plain text).",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
    {
      name: "search_emails",
      description:
        "Search the user's Gmail for emails matching a query. Use Gmail search syntax (from:, to:, subject:, is:unread, etc.).",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          query: {
            type: SchemaType.STRING,
            description:
              "Gmail search query (e.g. 'from:boss@company.com is:unread').",
          },
          maxResults: {
            type: SchemaType.NUMBER,
            description: "Max number of results to return (default: 10).",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "list_emails",
      description:
        "List the user's recent emails from their inbox. Use to check recent mail without a specific search query.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          maxResults: {
            type: SchemaType.NUMBER,
            description: "Max number of emails to return (default: 10).",
          },
        },
        required: [],
      },
    },
    {
      name: "get_unread_count",
      description:
        "Get the total count of unread emails in the user's inbox.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {},
        required: [],
      },
    },
    {
      name: "mark_email_read",
      description: "Mark an email as read by its message ID.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          messageId: {
            type: SchemaType.STRING,
            description: "The Gmail message ID to mark as read.",
          },
        },
        required: ["messageId"],
      },
    },

    {
      name: "get_email",
      description:
        "Get the full content of a specific email by its message ID. Use after searching/listing emails when the user wants to read the full body.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          messageId: {
            type: SchemaType.STRING,
            description: "The Gmail message ID to retrieve.",
          },
        },
        required: ["messageId"],
      },
    },
    {
      name: "reply_to_email",
      description:
        "Reply to an existing email thread. Automatically handles threading (In-Reply-To, References, Re: prefix). Use when the user asks to reply to an email.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          messageId: {
            type: SchemaType.STRING,
            description:
              "The Gmail message ID of the email to reply to.",
          },
          body: {
            type: SchemaType.STRING,
            description: "The reply body text.",
          },
          cc: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "CC recipients for the reply (optional).",
          },
          bcc: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "BCC recipients for the reply (optional).",
          },
        },
        required: ["messageId", "body"],
      },
    },

    // ── Google Calendar ────────────────────────────────────────────
    {
      name: "create_calendar_event",
      description:
        "Create a new Google Calendar event. Use this when the user asks to schedule a meeting, event, or appointment.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          title: {
            type: SchemaType.STRING,
            description: "Event title/summary.",
          },
          start: {
            type: SchemaType.STRING,
            description:
              "Start date/time in ISO 8601 format (e.g. '2025-01-15T14:00:00').",
          },
          end: {
            type: SchemaType.STRING,
            description:
              "End date/time in ISO 8601 format (e.g. '2025-01-15T15:00:00').",
          },
          description: {
            type: SchemaType.STRING,
            description: "Event description or agenda (optional).",
          },
          attendees: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "List of attendee email addresses (optional).",
          },
          location: {
            type: SchemaType.STRING,
            description: "Event location (optional).",
          },
          addMeetLink: {
            type: SchemaType.BOOLEAN,
            description:
              "Whether to add a Google Meet link to the event (optional, default false).",
          },
          timeZone: {
            type: SchemaType.STRING,
            description:
              "IANA time zone for the event (e.g. 'America/New_York', 'Asia/Kolkata'). Defaults to the user's system time zone.",
          },
        },
        required: ["title", "start", "end"],
      },
    },
    {
      name: "list_calendar_events",
      description:
        "List upcoming Google Calendar events. Use to check the user's schedule.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          maxResults: {
            type: SchemaType.NUMBER,
            description: "Max number of events to return (default: 10).",
          },
          timeMin: {
            type: SchemaType.STRING,
            description:
              "Start of time range in ISO 8601 format (default: now).",
          },
          timeMax: {
            type: SchemaType.STRING,
            description: "End of time range in ISO 8601 format (optional).",
          },
        },
        required: [],
      },
    },
    {
      name: "update_calendar_event",
      description:
        "Update an existing Google Calendar event. Change the title, time, description, attendees, or location.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          eventId: {
            type: SchemaType.STRING,
            description: "The Calendar event ID to update.",
          },
          title: {
            type: SchemaType.STRING,
            description: "New event title (optional).",
          },
          start: {
            type: SchemaType.STRING,
            description: "New start date/time in ISO 8601 format (optional).",
          },
          end: {
            type: SchemaType.STRING,
            description: "New end date/time in ISO 8601 format (optional).",
          },
          description: {
            type: SchemaType.STRING,
            description: "New event description (optional).",
          },
          attendees: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "New list of attendee email addresses (optional).",
          },
          location: {
            type: SchemaType.STRING,
            description: "New event location (optional).",
          },
          timeZone: {
            type: SchemaType.STRING,
            description:
              "IANA time zone for the event (e.g. 'America/New_York'). Only needed if changing the event time.",
          },
        },
        required: ["eventId"],
      },
    },
    {
      name: "delete_calendar_event",
      description: "Delete a Google Calendar event by its event ID.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          eventId: {
            type: SchemaType.STRING,
            description: "The Calendar event ID to delete.",
          },
        },
        required: ["eventId"],
      },
    },

    // ── Google Tasks ───────────────────────────────────────────────
    {
      name: "create_task",
      description:
        "Create a new task in Google Tasks. Use when the user asks to add a task, to-do, or reminder.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          title: {
            type: SchemaType.STRING,
            description: "Task title.",
          },
          notes: {
            type: SchemaType.STRING,
            description: "Task notes or details (optional).",
          },
          due: {
            type: SchemaType.STRING,
            description:
              "Due date in ISO 8601 format, e.g. '2025-01-15T00:00:00.000Z' (optional).",
          },
          taskListId: {
            type: SchemaType.STRING,
            description: "Task list ID to create the task in (default: '@default').",
          },
        },
        required: ["title"],
      },
    },
    {
      name: "complete_task",
      description: "Mark a Google Task as completed.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: {
            type: SchemaType.STRING,
            description: "The task ID to complete.",
          },
          taskListId: {
            type: SchemaType.STRING,
            description:
              "The task list ID containing the task (default: '@default').",
          },
        },
        required: ["taskId"],
      },
    },
    {
      name: "update_task",
      description: "Update an existing Google Task's title, notes, or due date.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: {
            type: SchemaType.STRING,
            description: "The task ID to update.",
          },
          taskListId: {
            type: SchemaType.STRING,
            description: "The task list ID (default: '@default').",
          },
          title: {
            type: SchemaType.STRING,
            description: "New task title (optional).",
          },
          notes: {
            type: SchemaType.STRING,
            description: "New task notes (optional).",
          },
          due: {
            type: SchemaType.STRING,
            description: "New due date in ISO 8601 format (optional).",
          },
        },
        required: ["taskId"],
      },
    },
    {
      name: "delete_task",
      description: "Delete a Google Task permanently.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: {
            type: SchemaType.STRING,
            description: "The task ID to delete.",
          },
          taskListId: {
            type: SchemaType.STRING,
            description: "The task list ID (default: '@default').",
          },
        },
        required: ["taskId"],
      },
    },
    {
      name: "list_tasks",
      description:
        "List tasks from Google Tasks. Use to check the user's pending tasks.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          showCompleted: {
            type: SchemaType.BOOLEAN,
            description: "Whether to include completed tasks (default: false).",
          },
          maxResults: {
            type: SchemaType.NUMBER,
            description: "Max number of tasks to return (default: 20).",
          },
          taskListId: {
            type: SchemaType.STRING,
            description: "Task list ID to query (default: '@default').",
          },
        },
        required: [],
      },
    },
    {
      name: "list_task_lists",
      description: "List all of the user's Google Task lists.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {},
        required: [],
      },
    },

    // ── Google Drive ───────────────────────────────────────────────
    {
      name: "search_drive_files",
      description:
        "Search the user's Google Drive files by name or content.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          query: {
            type: SchemaType.STRING,
            description: "Search query string.",
          },
          maxResults: {
            type: SchemaType.NUMBER,
            description: "Max number of results (default: 10).",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "list_drive_files",
      description:
        "List recent files in the user's Google Drive, ordered by last modified.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          maxResults: {
            type: SchemaType.NUMBER,
            description: "Max number of files to return (default: 10).",
          },
          orderBy: {
            type: SchemaType.STRING,
            description: "Sort order (default: 'modifiedTime desc'). Options: 'modifiedTime desc', 'name', 'createdTime desc'.",
          },
        },
        required: [],
      },
    },
    {
      name: "create_google_doc",
      description:
        "Create a new empty Google Doc in the user's Drive. Returns the document's web link.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          title: {
            type: SchemaType.STRING,
            description: "Document title.",
          },
        },
        required: ["title"],
      },
    },

    // ── Google Docs ───────────────────────────────────────────────
    {
      name: "read_doc",
      description:
        "Read the content of a Google Doc as plain text. Use to view or analyze document content.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          documentId: {
            type: SchemaType.STRING,
            description: "The Google Doc document ID.",
          },
        },
        required: ["documentId"],
      },
    },
    {
      name: "append_to_doc",
      description:
        "Append text to the end of a Google Doc. Use to add content to an existing document.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          documentId: {
            type: SchemaType.STRING,
            description: "The Google Doc document ID.",
          },
          text: {
            type: SchemaType.STRING,
            description: "The text to append to the document.",
          },
        },
        required: ["documentId", "text"],
      },
    },
    {
      name: "find_replace_in_doc",
      description:
        "Find and replace text in a Google Doc. Replaces all occurrences of the search text.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          documentId: {
            type: SchemaType.STRING,
            description: "The Google Doc document ID.",
          },
          find: {
            type: SchemaType.STRING,
            description: "The text to find.",
          },
          replace: {
            type: SchemaType.STRING,
            description: "The replacement text.",
          },
          matchCase: {
            type: SchemaType.BOOLEAN,
            description: "Whether the search is case-sensitive (default: false).",
          },
        },
        required: ["documentId", "find", "replace"],
      },
    },

    // ── Google Sheets ─────────────────────────────────────────────
    {
      name: "read_sheet",
      description:
        "Read data from a Google Sheets spreadsheet. Returns values from the specified range.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          spreadsheetId: {
            type: SchemaType.STRING,
            description: "The spreadsheet ID.",
          },
          range: {
            type: SchemaType.STRING,
            description: "The A1 notation range to read (e.g. 'Sheet1!A1:D10', 'A:C'). Defaults to 'Sheet1' (entire first sheet) if omitted.",
          },
        },
        required: ["spreadsheetId"],
      },
    },
    {
      name: "write_sheet",
      description:
        "Write data to a specific range in a Google Sheets spreadsheet. Overwrites existing data in the range.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          spreadsheetId: {
            type: SchemaType.STRING,
            description: "The spreadsheet ID.",
          },
          range: {
            type: SchemaType.STRING,
            description: "The A1 notation range to write to (e.g. 'Sheet1!A1:D3').",
          },
          values: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
            },
            description: "2D array of values to write (rows x columns). Each inner array is a row.",
          },
        },
        required: ["spreadsheetId", "range", "values"],
      },
    },
    {
      name: "append_to_sheet",
      description:
        "Append rows of data to the end of a Google Sheets spreadsheet table.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          spreadsheetId: {
            type: SchemaType.STRING,
            description: "The spreadsheet ID.",
          },
          range: {
            type: SchemaType.STRING,
            description: "The A1 notation of the table to append to (e.g. 'Sheet1!A:D').",
          },
          values: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
            },
            description: "2D array of row data to append.",
          },
        },
        required: ["spreadsheetId", "range", "values"],
      },
    },
    {
      name: "create_spreadsheet",
      description:
        "Create a new Google Sheets spreadsheet in the user's Drive.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          title: {
            type: SchemaType.STRING,
            description: "Spreadsheet title.",
          },
        },
        required: ["title"],
      },
    },
    {
      name: "clear_sheet_range",
      description:
        "Clear all data from a specific range in a Google Sheets spreadsheet.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          spreadsheetId: {
            type: SchemaType.STRING,
            description: "The spreadsheet ID.",
          },
          range: {
            type: SchemaType.STRING,
            description: "The A1 notation range to clear (e.g. 'Sheet1!A1:D10').",
          },
        },
        required: ["spreadsheetId", "range"],
      },
    },

    // ── Google Contacts ────────────────────────────────────────────
    {
      name: "search_contacts",
      description:
        "Search the user's Google Contacts by name or email. Useful for looking up email addresses.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          query: {
            type: SchemaType.STRING,
            description: "Search query (name, email, or organization).",
          },
          maxResults: {
            type: SchemaType.NUMBER,
            description: "Max number of results (default: 10).",
          },
        },
        required: ["query"],
      },
    },
  ],
};

/** Tool config that lets Gemini decide when to call functions */
export const TOOL_CONFIG = {
  functionCallingConfig: {
    mode: FunctionCallingMode.AUTO,
  },
};

// ── Tool Executor ───────────────────────────────────────────────────

export interface ToolResult {
  success: boolean;
  summary: string;
  data?: unknown;
}

/**
 * Execute a workspace tool by name. Maps Gemini function calls to the
 * existing Google API functions in src/lib/google/.
 */
export async function executeWorkspaceTool(
  userId: string,
  functionName: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  log.info({ functionName, args }, "executing workspace tool");

  try {
    switch (functionName) {
      // ── Gmail ────────────────────────────────────────────────
      case "send_email": {
        const result = await sendEmail(userId, {
          to: args.to as string[],
          subject: args.subject as string,
          body: args.body as string,
          cc: args.cc as string[] | undefined,
          bcc: args.bcc as string[] | undefined,
          isHtml: args.isHtml as boolean | undefined,
        });
        const recipients = (args.to as string[]).join(", ");
        return {
          success: true,
          summary: `Email sent to ${recipients} with subject "${args.subject}"`,
          data: result,
        };
      }

      case "search_emails": {
        const emails = await searchEmails(
          userId,
          args.query as string,
          (args.maxResults as number) || 10
        );
        return {
          success: true,
          summary: `Found ${emails.length} email(s) matching "${args.query}"`,
          data: emails.map((e) => ({
            id: e.id,
            from: e.from,
            subject: e.subject,
            snippet: e.snippet,
            date: e.date,
            isUnread: e.isUnread,
          })),
        };
      }

      case "list_emails": {
        const emails = await listEmails(userId, {
          maxResults: (args.maxResults as number) || 10,
        });
        return {
          success: true,
          summary: `Found ${emails.length} recent email(s)`,
          data: emails.map((e) => ({
            id: e.id,
            from: e.from,
            subject: e.subject,
            snippet: e.snippet,
            date: e.date,
            isUnread: e.isUnread,
          })),
        };
      }

      case "get_unread_count": {
        const count = await getUnreadCount(userId);
        return {
          success: true,
          summary: `You have ${count} unread email(s)`,
          data: { unreadCount: count },
        };
      }

      case "mark_email_read": {
        await modifyEmailLabels(
          userId,
          args.messageId as string,
          [],
          ["UNREAD"]
        );
        return {
          success: true,
          summary: `Marked email ${args.messageId} as read`,
        };
      }

      case "get_email": {
        const email = await getEmail(userId, args.messageId as string);
        if (!email) {
          return {
            success: false,
            summary: `Email ${args.messageId} not found`,
          };
        }
        return {
          success: true,
          summary: `Retrieved email "${email.subject}" from ${email.from}`,
          data: {
            id: email.id,
            threadId: email.threadId,
            from: email.from,
            to: email.to,
            subject: email.subject,
            body: email.body,
            date: email.date,
            isUnread: email.isUnread,
          },
        };
      }

      case "reply_to_email": {
        const replyResult = await replyToEmail(
          userId,
          args.messageId as string,
          args.body as string,
          {
            cc: args.cc as string[] | undefined,
            bcc: args.bcc as string[] | undefined,
          }
        );
        return {
          success: true,
          summary: `Replied to email thread ${replyResult.threadId}`,
          data: replyResult,
        };
      }

      // ── Calendar ─────────────────────────────────────────────
      case "create_calendar_event": {
        const event = await createEvent(userId, {
          title: args.title as string,
          start: args.start as string,
          end: args.end as string,
          description: args.description as string | undefined,
          attendees: args.attendees as string[] | undefined,
          location: args.location as string | undefined,
          addMeetLink: args.addMeetLink as boolean | undefined,
          timeZone: args.timeZone as string | undefined,
        });
        const attendeeEmails = event.attendees.map((a) => a.email).filter(Boolean);
        const attendeeStr =
          attendeeEmails.length > 0
            ? ` with ${attendeeEmails.join(", ")}`
            : "";
        return {
          success: true,
          summary: `Created event "${event.title}" at ${event.start}${attendeeStr}${event.meetLink ? " (with Meet link)" : ""}`,
          data: {
            id: event.id,
            title: event.title,
            start: event.start,
            end: event.end,
            meetLink: event.meetLink,
            htmlLink: event.htmlLink,
          },
        };
      }

      case "list_calendar_events": {
        const events = await listEvents(userId, {
          maxResults: (args.maxResults as number) || 10,
          timeMin: args.timeMin as string | undefined,
          timeMax: args.timeMax as string | undefined,
        });
        return {
          success: true,
          summary: `Found ${events.length} upcoming event(s)`,
          data: events.map((e) => ({
            id: e.id,
            title: e.title,
            start: e.start,
            end: e.end,
            location: e.location,
            attendees: e.attendees.map((a) => a.email),
            meetLink: e.meetLink,
          })),
        };
      }

      case "update_calendar_event": {
        const updated = await updateEvent(
          userId,
          args.eventId as string,
          {
            title: args.title as string | undefined,
            start: args.start as string | undefined,
            end: args.end as string | undefined,
            description: args.description as string | undefined,
            attendees: args.attendees as string[] | undefined,
            location: args.location as string | undefined,
            timeZone: args.timeZone as string | undefined,
          }
        );
        return {
          success: true,
          summary: `Updated event "${updated.title}"`,
          data: {
            id: updated.id,
            title: updated.title,
            start: updated.start,
            end: updated.end,
          },
        };
      }

      case "delete_calendar_event": {
        await deleteEvent(userId, args.eventId as string);
        return {
          success: true,
          summary: `Deleted calendar event ${args.eventId}`,
        };
      }

      // ── Tasks ────────────────────────────────────────────────
      case "create_task": {
        const taskListId = (args.taskListId as string) || "@default";
        const task = await createTask(userId, taskListId, {
          title: args.title as string,
          notes: args.notes as string | undefined,
          due: args.due as string | undefined,
        });
        return {
          success: true,
          summary: `Created task "${task.title}"${task.due ? ` (due: ${task.due})` : ""}`,
          data: { id: task.id, title: task.title, due: task.due },
        };
      }

      case "complete_task": {
        const completed = await completeTask(
          userId,
          (args.taskListId as string) || "@default",
          args.taskId as string
        );
        return {
          success: true,
          summary: `Completed task "${completed.title}"`,
          data: { id: completed.id, title: completed.title },
        };
      }

      case "update_task": {
        const updatedTask = await updateTask(
          userId,
          (args.taskListId as string) || "@default",
          args.taskId as string,
          {
            title: args.title as string | undefined,
            notes: args.notes as string | undefined,
            due: args.due as string | undefined,
          }
        );
        return {
          success: true,
          summary: `Updated task "${updatedTask.title}"`,
          data: { id: updatedTask.id, title: updatedTask.title, due: updatedTask.due },
        };
      }

      case "delete_task": {
        await deleteTask(
          userId,
          (args.taskListId as string) || "@default",
          args.taskId as string
        );
        return {
          success: true,
          summary: `Deleted task ${args.taskId}`,
        };
      }

      case "list_tasks": {
        const taskListId = (args.taskListId as string) || "@default";
        const tasks = await listTasks(userId, taskListId, {
          showCompleted: args.showCompleted as boolean | undefined,
          maxResults: (args.maxResults as number) || 20,
        });
        return {
          success: true,
          summary: `Found ${tasks.length} task(s)`,
          data: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            due: t.due,
            notes: t.notes,
          })),
        };
      }

      case "list_task_lists": {
        const taskLists = await listTaskLists(userId);
        return {
          success: true,
          summary: `Found ${taskLists.length} task list(s)`,
          data: taskLists.map((tl) => ({ id: tl.id, title: tl.title })),
        };
      }

      // ── Drive ────────────────────────────────────────────────
      case "search_drive_files": {
        const files = await searchFiles(
          userId,
          args.query as string,
          (args.maxResults as number) || 10
        );
        return {
          success: true,
          summary: `Found ${files.length} file(s) matching "${args.query}"`,
          data: files.map((f) => ({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            webViewLink: f.webViewLink,
            modifiedTime: f.modifiedTime,
          })),
        };
      }

      case "list_drive_files": {
        const files = await listFiles(userId, {
          maxResults: (args.maxResults as number) || 10,
          orderBy: (args.orderBy as string) || "modifiedTime desc",
        });
        return {
          success: true,
          summary: `Found ${files.length} file(s)`,
          data: files.map((f) => ({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            webViewLink: f.webViewLink,
            modifiedTime: f.modifiedTime,
          })),
        };
      }

      case "create_google_doc": {
        const doc = await createGoogleDoc(userId, args.title as string);
        return {
          success: true,
          summary: `Created Google Doc "${doc.name}"${doc.webViewLink ? ` — ${doc.webViewLink}` : ""}`,
          data: {
            documentId: doc.id,
            name: doc.name,
            webViewLink: doc.webViewLink,
          },
        };
      }

      // ── Docs ─────────────────────────────────────────────────
      case "read_doc": {
        const docContent = await getDocContent(userId, args.documentId as string);
        return {
          success: true,
          summary: `Read document "${docContent.title}" (${docContent.body.length} chars)`,
          data: {
            documentId: docContent.documentId,
            title: docContent.title,
            body: docContent.body,
            webViewLink: docContent.webViewLink,
          },
        };
      }

      case "append_to_doc": {
        await appendToDoc(userId, args.documentId as string, args.text as string);
        return {
          success: true,
          summary: `Appended text to document ${args.documentId}`,
          data: { documentId: args.documentId },
        };
      }

      case "find_replace_in_doc": {
        const replaceResult = await findAndReplaceInDoc(
          userId,
          args.documentId as string,
          args.find as string,
          args.replace as string,
          (args.matchCase as boolean) || false
        );
        return {
          success: true,
          summary: `Replaced ${replaceResult.occurrences} occurrence(s) of "${args.find}" with "${args.replace}"`,
          data: replaceResult,
        };
      }

      // ── Sheets ───────────────────────────────────────────────
      case "read_sheet": {
        const range = (args.range as string) || "Sheet1";
        const sheetData = await readSheet(
          userId,
          args.spreadsheetId as string,
          range
        );
        const rowCount = sheetData.values?.length || 0;
        return {
          success: true,
          summary: `Read ${rowCount} row(s) from "${sheetData.title}" range "${range}"`,
          data: sheetData,
        };
      }

      case "write_sheet": {
        const writeResult = await writeSheet(
          userId,
          args.spreadsheetId as string,
          args.range as string,
          args.values as string[][]
        );
        return {
          success: true,
          summary: `Wrote ${writeResult.updatedCells} cell(s) to range "${args.range}"`,
          data: writeResult,
        };
      }

      case "append_to_sheet": {
        const appendResult = await appendToSheet(
          userId,
          args.spreadsheetId as string,
          args.range as string,
          args.values as string[][]
        );
        return {
          success: true,
          summary: `Appended ${appendResult.updatedRows} row(s) to "${args.range}"`,
          data: appendResult,
        };
      }

      case "create_spreadsheet": {
        const spreadsheet = await createSpreadsheet(
          userId,
          args.title as string
        );
        return {
          success: true,
          summary: `Created spreadsheet "${spreadsheet.title}" — ${spreadsheet.webViewLink}`,
          data: spreadsheet,
        };
      }

      case "clear_sheet_range": {
        await clearSheetRange(
          userId,
          args.spreadsheetId as string,
          args.range as string
        );
        return {
          success: true,
          summary: `Cleared range "${args.range}"`,
        };
      }

      // ── Contacts ─────────────────────────────────────────────
      case "search_contacts": {
        const contacts = await searchContacts(
          userId,
          args.query as string,
          (args.maxResults as number) || 10
        );
        return {
          success: true,
          summary: `Found ${contacts.length} contact(s) matching "${args.query}"`,
          data: contacts.map((c) => ({
            name: c.name,
            email: c.email,
            phone: c.phone,
            organization: c.organization,
          })),
        };
      }

      default:
        return {
          success: false,
          summary: `Unknown tool: ${functionName}`,
        };
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    log.error({ err: error, functionName }, "workspace tool execution failed");
    return {
      success: false,
      summary: `Failed to execute ${functionName}: ${message}`,
    };
  }
}
