import {
  FunctionDeclarationsTool,
  FunctionCallingMode,
  SchemaType,
} from "@google/generative-ai";
import { sendEmail, searchEmails, modifyEmailLabels } from "@/lib/google/gmail";
import { createEvent, listEvents, deleteEvent } from "@/lib/google/calendar";
import { createTask, completeTask, listTasks } from "@/lib/google/tasks";
import { searchFiles, createGoogleDoc } from "@/lib/google/drive";
import { searchContacts } from "@/lib/google/contacts";
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
        },
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
        });
        const attendeeStr =
          event.attendees.length > 0
            ? ` with ${event.attendees.map((a) => a.email).join(", ")}`
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

      case "delete_calendar_event": {
        await deleteEvent(userId, args.eventId as string);
        return {
          success: true,
          summary: `Deleted calendar event ${args.eventId}`,
        };
      }

      // ── Tasks ────────────────────────────────────────────────
      case "create_task": {
        const task = await createTask(userId, "@default", {
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

      case "list_tasks": {
        const tasks = await listTasks(userId, "@default", {
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

      case "create_google_doc": {
        const doc = await createGoogleDoc(userId, args.title as string);
        return {
          success: true,
          summary: `Created Google Doc "${doc.name}"${doc.webViewLink ? ` — ${doc.webViewLink}` : ""}`,
          data: {
            id: doc.id,
            name: doc.name,
            webViewLink: doc.webViewLink,
          },
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
