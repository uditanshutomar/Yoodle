import {
  FunctionDeclarationsTool,
  FunctionCallingMode,
  SchemaType,
} from "@google/generative-ai";
import { sendEmail, searchEmails, modifyEmailLabels, listEmails, getUnreadCount, getEmail, replyToEmail } from "@/lib/google/gmail";
import { createEvent, listEvents, updateEvent, deleteEvent } from "@/lib/google/calendar";
import {
  createBoardTask, updateBoardTask, moveBoardTask,
  assignBoardTask, deleteBoardTask, listBoardTasks, searchBoardTasks,
} from "@/lib/board/tools";
import {
  createTaskFromMeeting, createTaskFromEmail, createTaskFromChat,
  scheduleMeetingForTask, linkDocToTask, linkMeetingToTask,
  generateSubtasks, getTaskContext,
} from "@/lib/board/cross-domain";
import { searchFiles, listFiles, createGoogleDoc } from "@/lib/google/drive";
import { searchContacts } from "@/lib/google/contacts";
import { getDocContent, appendToDoc, findAndReplaceInDoc } from "@/lib/google/docs";
import { readSheet, writeSheet, appendToSheet, createSpreadsheet, clearSheetRange } from "@/lib/google/sheets";
import connectDB from "@/lib/infra/db/client";
import AIMemory from "@/lib/infra/db/models/ai-memory";
import Meeting from "@/lib/infra/db/models/meeting";
import User from "@/lib/infra/db/models/user";
import { generateMeetingCode } from "@/lib/utils/id";
import Task from "@/lib/infra/db/models/task";
import mongoose from "mongoose";
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
          recurrence: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description:
              "RFC 5545 recurrence rules (optional). E.g. ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'], ['RRULE:FREQ=DAILY;COUNT=5'], ['RRULE:FREQ=MONTHLY;BYMONTHDAY=15'].",
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

    {
      name: "create_focus_block",
      description: "Create a calendar focus/work block for a specific task. Automatically titles the event with the task name and links back to the task. Use when a task has a due date but no calendar time blocked for it.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The task ID to create a focus block for." },
          start: { type: SchemaType.STRING, description: "Start time in ISO 8601 format." },
          end: { type: SchemaType.STRING, description: "End time in ISO 8601 format." },
          timeZone: { type: SchemaType.STRING, description: "IANA timezone (e.g. America/New_York). Optional." },
        },
        required: ["taskId", "start", "end"],
      },
    },
    {
      name: "find_mutual_free_slots",
      description: "Find mutual free time slots across multiple team members for scheduling a meeting. Checks each user's Google Calendar and returns overlapping availability. Use when someone asks 'when can we all meet?' or needs to find a time that works for everyone.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          userEmails: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "Email addresses of team members to check availability for.",
          },
          date: { type: SchemaType.STRING, description: "Date to check in YYYY-MM-DD format. Defaults to today." },
          durationMinutes: { type: SchemaType.NUMBER, description: "Desired meeting duration in minutes (default 30)." },
          workHoursStart: { type: SchemaType.NUMBER, description: "Work hours start in 24h format (default 9)." },
          workHoursEnd: { type: SchemaType.NUMBER, description: "Work hours end in 24h format (default 18)." },
        },
        required: ["userEmails"],
      },
    },

    // ── Board Tasks ──────────────────────────────────────────────
    {
      name: "create_board_task",
      description:
        "Create a new task on a kanban board. Use when the user asks to add a task, to-do, or work item. If no boardId specified, uses the user's personal board.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING, description: "Task title." },
          description: { type: SchemaType.STRING, description: "Task description in markdown (optional)." },
          boardId: { type: SchemaType.STRING, description: "Board ID to create the task on. Omit to use the user's personal board." },
          columnId: { type: SchemaType.STRING, description: "Column ID to place the task in. Defaults to the first column (To Do)." },
          priority: { type: SchemaType.STRING, description: "Priority: 'urgent', 'high', 'medium', 'low', or 'none'. Default: 'none'." },
          assigneeId: { type: SchemaType.STRING, description: "User ID to assign the task to (optional)." },
          dueDate: { type: SchemaType.STRING, description: "Due date in ISO 8601 format (optional)." },
          labels: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Label IDs to apply (optional)." },
        },
        required: ["title"],
      },
    },
    {
      name: "update_board_task",
      description: "Update an existing board task's title, description, priority, due date, or labels.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The board task ID to update." },
          title: { type: SchemaType.STRING, description: "New title (optional)." },
          description: { type: SchemaType.STRING, description: "New description (optional)." },
          priority: { type: SchemaType.STRING, description: "New priority (optional)." },
          dueDate: { type: SchemaType.STRING, description: "New due date in ISO 8601 (optional)." },
          labels: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "New label IDs (optional)." },
        },
        required: ["taskId"],
      },
    },
    {
      name: "move_board_task",
      description: "Move a board task to a different column (change status). Use when user says to move, complete, or change status of a task.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The task ID to move." },
          columnId: { type: SchemaType.STRING, description: "Target column ID." },
        },
        required: ["taskId", "columnId"],
      },
    },
    {
      name: "assign_board_task",
      description: "Assign or reassign a board task to a user.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The task ID." },
          assigneeId: { type: SchemaType.STRING, description: "User ID to assign to." },
        },
        required: ["taskId", "assigneeId"],
      },
    },
    {
      name: "delete_board_task",
      description: "Delete a board task permanently.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The task ID to delete." },
        },
        required: ["taskId"],
      },
    },
    {
      name: "list_board_tasks",
      description: "List board tasks with optional filters. Use to check tasks on a board, find overdue items, or see what's assigned to someone.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          boardId: { type: SchemaType.STRING, description: "Filter by board ID (optional — returns tasks across all user's boards if omitted)." },
          assigneeId: { type: SchemaType.STRING, description: "Filter by assignee user ID (optional)." },
          priority: { type: SchemaType.STRING, description: "Filter by priority: 'urgent', 'high', 'medium', 'low' (optional)." },
          columnId: { type: SchemaType.STRING, description: "Filter by column/status (optional)." },
          overdueOnly: { type: SchemaType.BOOLEAN, description: "Only return overdue tasks (optional)." },
          limit: { type: SchemaType.NUMBER, description: "Max results (default: 20)." },
        },
        required: [],
      },
    },
    {
      name: "search_board_tasks",
      description: "Search board tasks by text across titles and descriptions.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          query: { type: SchemaType.STRING, description: "Search query text." },
          boardId: { type: SchemaType.STRING, description: "Limit search to a specific board (optional)." },
        },
        required: ["query"],
      },
    },

    // ── Cross-Domain Tools ───────────────────────────────────────
    {
      name: "create_task_from_meeting",
      description: "Convert MoM action items from a meeting into board tasks. Creates tasks linked back to the meeting with attendees as collaborators.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          meetingId: { type: SchemaType.STRING, description: "The meeting ID to create tasks from." },
          actionItemIndex: { type: SchemaType.NUMBER, description: "Specific action item index (0-based). Omit to create tasks for ALL action items." },
          boardId: { type: SchemaType.STRING, description: "Target board ID (defaults to personal board)." },
        },
        required: ["meetingId"],
      },
    },
    {
      name: "create_task_from_email",
      description: "Create a board task from an email, linking the email to the task for reference.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          emailId: { type: SchemaType.STRING, description: "Gmail message ID to create task from." },
          title: { type: SchemaType.STRING, description: "Task title (extracted from email subject if omitted)." },
          boardId: { type: SchemaType.STRING, description: "Target board ID (defaults to personal board)." },
          priority: { type: SchemaType.STRING, description: "Priority level (optional)." },
        },
        required: ["emailId"],
      },
    },
    {
      name: "create_task_from_chat",
      description: "Create a board task from a chat conversation message, linking back to the conversation.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          conversationId: { type: SchemaType.STRING, description: "Conversation ID." },
          messageId: { type: SchemaType.STRING, description: "Specific message ID to extract task from (optional)." },
          title: { type: SchemaType.STRING, description: "Task title." },
          boardId: { type: SchemaType.STRING, description: "Target board ID (defaults to conversation board if exists, else personal)." },
        },
        required: ["conversationId", "title"],
      },
    },
    {
      name: "schedule_meeting_for_task",
      description: "Schedule a Yoodle meeting related to a board task. Pre-fills with task title, assignee and collaborators as participants.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The board task ID." },
          duration: { type: SchemaType.NUMBER, description: "Meeting duration in minutes (default: 30)." },
          scheduledAt: { type: SchemaType.STRING, description: "When to schedule in ISO 8601 (optional)." },
        },
        required: ["taskId"],
      },
    },
    {
      name: "link_doc_to_task",
      description: "Attach a Google Drive document to a board task. Search Drive by query or provide a direct document ID.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The board task ID." },
          query: { type: SchemaType.STRING, description: "Search query to find the document in Drive (optional if googleDocId provided)." },
          googleDocId: { type: SchemaType.STRING, description: "Direct Google Doc/Drive file ID (optional if query provided)." },
        },
        required: ["taskId"],
      },
    },
    {
      name: "link_meeting_to_task",
      description: "Link an existing Yoodle meeting to a board task for tracking.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The board task ID." },
          meetingId: { type: SchemaType.STRING, description: "The meeting ID to link." },
        },
        required: ["taskId", "meetingId"],
      },
    },
    {
      name: "generate_subtasks",
      description: "AI-generate a subtask breakdown for a board task based on its title and description.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The board task ID to generate subtasks for." },
          count: { type: SchemaType.NUMBER, description: "Suggested number of subtasks (3-10, default: 5)." },
        },
        required: ["taskId"],
      },
    },
    {
      name: "get_task_context",
      description: "Get deep context about a board task including linked meeting status, documents, emails, and activity log. Use before answering questions about a specific task.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The board task ID." },
        },
        required: ["taskId"],
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

    // ── Memory ──────────────────────────────────────────────────────
    {
      name: "save_memory",
      description:
        "Silently save an important piece of context about the user. Use this whenever the user reveals a preference, relationship, habit, or important context. Do NOT tell the user you are saving a memory — just save it quietly.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          category: {
            type: SchemaType.STRING,
            description:
              "Category of the memory: 'preference', 'context', 'task', 'relationship', or 'habit'.",
          },
          content: {
            type: SchemaType.STRING,
            description:
              "What to remember, written as a concise fact. e.g. 'Prefers morning meetings', 'Manager is Sarah Chen'.",
          },
          confidence: {
            type: SchemaType.NUMBER,
            description:
              "How confident this is worth saving, 0 to 1. Use 0.9+ for explicit statements, 0.6-0.8 for inferred context.",
          },
        },
        required: ["category", "content", "confidence"],
      },
    },

    // ── Yoodle Meetings ────────────────────────────────────────────
    {
      name: "create_yoodle_meeting",
      description:
        "Create a Yoodle meeting room and return the join link. Use this WHENEVER the user asks to send a meeting link, schedule a meeting, or start a video call. ALWAYS use Yoodle meetings (not Google Meet) unless the user explicitly says 'Google Meet'. The returned link is a real Yoodle room link.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          title: {
            type: SchemaType.STRING,
            description: "Meeting title (e.g. 'Quick Sync with Sukriti').",
          },
          scheduledAt: {
            type: SchemaType.STRING,
            description:
              "When the meeting is scheduled for, in ISO 8601 format. Omit for an instant meeting.",
          },
          attendeeEmails: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "Email addresses of people to invite (optional). An email with the Yoodle link will be sent to them.",
          },
          duration: {
            type: SchemaType.NUMBER,
            description:
              "Meeting duration in minutes. Default: 10. Calendar rounds to 15-min slots (10→15, 20→15, 25→30). Common values: 10, 15, 30, 45, 60.",
          },
          addToCalendar: {
            type: SchemaType.BOOLEAN,
            description:
              "Whether to also create a Google Calendar event with the Yoodle link. Default: true.",
          },
        },
        required: ["title"],
      },
    },

    // ── Pending Actions ─────────────────────────────────────────────
    {
      name: "propose_action",
      description:
        "Propose a write action for user review instead of executing it directly. Use this for ALL write operations: sending emails, creating/updating/deleting calendar events, creating/completing/deleting tasks, writing to docs/sheets, etc. The action will appear in the user's Actions panel where they can Accept, Deny, or request changes via AI.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          actionType: {
            type: SchemaType.STRING,
            description:
              "The tool that would be called: 'send_email', 'reply_to_email', 'create_yoodle_meeting', 'create_calendar_event', 'update_calendar_event', 'delete_calendar_event', 'create_board_task', 'update_board_task', 'move_board_task', 'assign_board_task', 'delete_board_task', 'create_task_from_meeting', 'create_task_from_email', 'create_task_from_chat', 'schedule_meeting_for_task', 'link_doc_to_task', 'link_meeting_to_task', 'generate_subtasks', 'append_to_doc', 'find_replace_in_doc', 'write_sheet', 'append_to_sheet', 'clear_sheet_range'.",
          },
          args: {
            type: SchemaType.OBJECT,
            description:
              "The exact arguments that would be passed to the write tool. Must match the target tool's parameter schema.",
            properties: {},
          },
          summary: {
            type: SchemaType.STRING,
            description:
              "A one-line human-readable summary of the action, e.g. 'Reply to Sarah Chen re: Q2 budget — approved, discuss in 1:1'.",
          },
        },
        required: ["actionType", "args", "summary"],
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
        // Resolve timezone: prefer AI-provided, fallback to user's profile, then UTC
        let tz = args.timeZone as string | undefined;
        if (!tz) {
          try {
            await connectDB();
            const user = await User.findById(userId).select("timezone").lean();
            tz = (user as { timezone?: string } | null)?.timezone || undefined;
          } catch { /* fallback to UTC */ }
        }
        // Check for scheduling conflicts
        let conflictWarning = "";
        try {
          const conflictEvents = await listEvents(userId, {
            timeMin: args.start as string,
            timeMax: args.end as string,
            maxResults: 5,
          });
          if (conflictEvents.length > 0) {
            const conflictList = conflictEvents
              .map((e) => `"${e.title}" (${new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}–${new Date(e.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })})`)
              .join(", ");
            conflictWarning = ` ⚠️ Overlaps with: ${conflictList}`;
          }
        } catch { /* conflict check is best-effort */ }

        const event = await createEvent(userId, {
          title: args.title as string,
          start: args.start as string,
          end: args.end as string,
          description: args.description as string | undefined,
          attendees: args.attendees as string[] | undefined,
          location: args.location as string | undefined,
          addMeetLink: args.addMeetLink as boolean | undefined,
          timeZone: tz,
          recurrence: args.recurrence as string[] | undefined,
        });
        const attendeeEmails = (event.attendees ?? []).map((a) => a.email).filter(Boolean);
        const attendeeStr =
          attendeeEmails.length > 0
            ? ` with ${attendeeEmails.join(", ")}`
            : "";
        return {
          success: true,
          summary: `Created event "${event.title}" at ${event.start}${attendeeStr}${event.meetLink ? " (with Meet link)" : ""}${conflictWarning}`,
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
            attendees: (e.attendees ?? []).map((a) => a.email),
            meetLink: e.meetLink,
          })),
        };
      }

      case "update_calendar_event": {
        // Resolve timezone for update too
        let updateTz = args.timeZone as string | undefined;
        if (!updateTz && (args.start || args.end)) {
          try {
            await connectDB();
            const user = await User.findById(userId).select("timezone").lean();
            updateTz = (user as { timezone?: string } | null)?.timezone || undefined;
          } catch { /* fallback to UTC */ }
        }
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
            timeZone: updateTz,
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

      case "create_focus_block": {
        await connectDB();
        const fbTaskId = args.taskId as string;
        if (!fbTaskId || !mongoose.Types.ObjectId.isValid(fbTaskId)) {
          return { success: false, summary: "Invalid task ID." };
        }
        const fbTask = await Task.findById(fbTaskId).select("title boardId").lean();
        if (!fbTask) return { success: false, summary: "Task not found." };

        // Resolve timezone
        let fbTz = args.timeZone as string | undefined;
        if (!fbTz) {
          try {
            const fbUser = await User.findById(userId).select("timezone").lean();
            fbTz = (fbUser as { timezone?: string } | null)?.timezone || undefined;
          } catch { /* fallback */ }
        }

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        const taskLink = `${baseUrl}/boards/${fbTask.boardId}?task=${fbTaskId}`;

        const fbEvent = await createEvent(userId, {
          title: `🔨 ${fbTask.title}`,
          start: args.start as string,
          end: args.end as string,
          description: `Focus block for task: ${fbTask.title}\nOpen task: ${taskLink}`,
          timeZone: fbTz,
        });

        return {
          success: true,
          summary: `Created focus block "🔨 ${fbTask.title}" from ${args.start} to ${args.end}`,
          data: { eventId: fbEvent.id, taskId: fbTaskId, title: fbTask.title },
        };
      }

      case "find_mutual_free_slots": {
        await connectDB();
        const emails = (args.userEmails as string[]) || [];
        if (emails.length === 0) return { success: false, summary: "No user emails provided." };

        const dateStr = (args.date as string) || new Date().toISOString().split("T")[0];
        const duration = (args.durationMinutes as number) || 30;
        const workStart = (args.workHoursStart as number) || 9;
        const workEnd = (args.workHoursEnd as number) || 18;

        // Resolve Yoodle user IDs from emails
        const users = await User.find({ email: { $in: emails } }).select("_id email").lean();
        const userMap = new Map(users.map((u: { _id: unknown; email: string }) => [u.email, u._id!.toString()]));

        const timeMin = `${dateStr}T${String(workStart).padStart(2, "0")}:00:00Z`;
        const timeMax = `${dateStr}T${String(workEnd).padStart(2, "0")}:00:00Z`;

        // Fetch all users' events in parallel
        const busySlots: { start: number; end: number }[][] = [];
        const checkedEmails: string[] = [];
        const failedEmails: string[] = [];

        // Always include the requesting user
        try {
          const myEvents = await listEvents(userId, { timeMin, timeMax, maxResults: 30 });
          busySlots.push(myEvents.map((e) => ({
            start: new Date(e.start).getTime(),
            end: new Date(e.end).getTime(),
          })));
          checkedEmails.push("you");
        } catch { /* requesting user's calendar failed */ }

        for (const email of emails) {
          const uid = userMap.get(email);
          if (!uid || uid === userId) continue;
          try {
            const events = await listEvents(uid, { timeMin, timeMax, maxResults: 30 });
            busySlots.push(events.map((e) => ({
              start: new Date(e.start).getTime(),
              end: new Date(e.end).getTime(),
            })));
            checkedEmails.push(email.split("@")[0]);
          } catch {
            failedEmails.push(email.split("@")[0]);
          }
        }

        // Merge all busy slots and find gaps
        const allBusy = busySlots.flat().sort((a, b) => a.start - b.start);
        const dayStart = new Date(`${dateStr}T${String(workStart).padStart(2, "0")}:00:00Z`).getTime();
        const dayEnd = new Date(`${dateStr}T${String(workEnd).padStart(2, "0")}:00:00Z`).getTime();
        const durationMs = duration * 60000;

        // Sweep line to find free windows
        const freeSlots: { start: string; end: string; minutes: number }[] = [];
        let cursor = Math.max(dayStart, Date.now());

        for (const slot of allBusy) {
          if (slot.start > cursor && slot.start - cursor >= durationMs) {
            const slotEnd = Math.min(slot.start, dayEnd);
            if (slotEnd - cursor >= durationMs) {
              freeSlots.push({
                start: new Date(cursor).toISOString(),
                end: new Date(slotEnd).toISOString(),
                minutes: Math.round((slotEnd - cursor) / 60000),
              });
            }
          }
          cursor = Math.max(cursor, slot.end);
        }

        // Check remaining time after last event
        if (dayEnd > cursor && dayEnd - cursor >= durationMs) {
          freeSlots.push({
            start: new Date(cursor).toISOString(),
            end: new Date(dayEnd).toISOString(),
            minutes: Math.round((dayEnd - cursor) / 60000),
          });
        }

        const failedNote = failedEmails.length > 0 ? ` (couldn't check: ${failedEmails.join(", ")})` : "";
        return {
          success: true,
          summary: freeSlots.length > 0
            ? `Found ${freeSlots.length} mutual free slot(s) on ${dateStr} for ${checkedEmails.join(", ")}${failedNote}`
            : `No mutual free slots found on ${dateStr} for ${duration}+ minutes${failedNote}`,
          data: { date: dateStr, freeSlots, checkedUsers: checkedEmails, failedUsers: failedEmails },
        };
      }

      // ── Board Tasks ─────────────────────────────────────────────
      case "create_board_task":
        return createBoardTask(userId, args);
      case "update_board_task":
        return updateBoardTask(userId, args);
      case "move_board_task":
        return moveBoardTask(userId, args);
      case "assign_board_task":
        return assignBoardTask(userId, args);
      case "delete_board_task":
        return deleteBoardTask(userId, args);
      case "list_board_tasks":
        return listBoardTasks(userId, args);
      case "search_board_tasks":
        return searchBoardTasks(userId, args);

      // ── Cross-Domain Tools ──────────────────────────────────────
      case "create_task_from_meeting":
        return createTaskFromMeeting(userId, args);
      case "create_task_from_email":
        return createTaskFromEmail(userId, args);
      case "create_task_from_chat":
        return createTaskFromChat(userId, args);
      case "schedule_meeting_for_task":
        return scheduleMeetingForTask(userId, args);
      case "link_doc_to_task":
        return linkDocToTask(userId, args);
      case "link_meeting_to_task":
        return linkMeetingToTask(userId, args);
      case "generate_subtasks":
        return generateSubtasks(userId, args);
      case "get_task_context":
        return getTaskContext(userId, args);

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
          args.matchCase === true
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

      // ── Memory ────────────────────────────────────────────────
      case "save_memory": {
        await connectDB();

        const category = args.category as string;
        const content = args.content as string;
        const confidence = args.confidence as number;

        // Validate category against the schema's allowed values.
        // Must stay in sync with MEMORY_CATEGORIES in ai-memory.ts.
        const VALID_CATEGORIES = ["preference", "context", "task", "relationship", "habit"];
        const safeCategory = VALID_CATEGORIES.includes(category) ? category : "context";

        // Validate content is non-empty before querying
        if (!content || content.trim().length === 0) {
          return { success: false, summary: "Cannot save empty memory." };
        }

        // Dedup: check if a similar memory already exists
        // Escape regex special characters to prevent regex injection
        const prefix = content.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const existing = await AIMemory.findOne({
          userId,
          category: safeCategory,
          content: { $regex: prefix, $options: "i" },
        });

        if (existing) {
          existing.content = content;
          existing.confidence = confidence;
          existing.updatedAt = new Date();
          await existing.save();
          return {
            success: true,
            summary: `Updated memory: ${content}`,
          };
        }

        await AIMemory.create({
          userId,
          category: safeCategory,
          content,
          source: "chat",
          confidence,
        });

        return {
          success: true,
          summary: `Saved memory: ${content}`,
        };
      }

      // ── Yoodle Meetings ──────────────────────────────────────
      case "create_yoodle_meeting": {
        await connectDB();

        const title = (args.title as string) || "Yoodle Meeting";
        const scheduledAtRaw = args.scheduledAt as string | undefined;
        const attendeeEmails = (args.attendeeEmails as string[] | undefined) || [];
        const rawDuration = (args.duration as number) || 10; // default 10 minutes
        // Round to nearest 15-min slot (minimum 15)
        const durationMin = Math.max(15, Math.round(rawDuration / 15) * 15);
        const addToCalendar = args.addToCalendar !== false; // default true

        // Validate scheduledAt to prevent Invalid Date from LLM-generated strings
        let scheduledAt: string | undefined;
        if (scheduledAtRaw) {
          const parsed = new Date(scheduledAtRaw);
          if (!isNaN(parsed.getTime())) {
            scheduledAt = parsed.toISOString();
          } else {
            log.warn({ scheduledAtRaw }, "Invalid scheduledAt from LLM, ignoring");
          }
        }

        // Validate userId is a valid ObjectId before constructing
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          return { success: false, summary: "Invalid user ID." };
        }

        // Create the Yoodle meeting in MongoDB
        const code = generateMeetingCode();
        const meeting = await Meeting.create({
          code,
          title,
          hostId: new mongoose.Types.ObjectId(userId),
          type: "regular",
          status: "scheduled",
          scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
          scheduledDuration: durationMin,
          participants: [
            {
              userId: new mongoose.Types.ObjectId(userId),
              role: "host",
              status: "joined",
              joinedAt: new Date(),
            },
          ],
          settings: {
            maxParticipants: 25,
            allowRecording: true,
            allowScreenShare: true,
            waitingRoom: false,
            muteOnJoin: false,
          },
        });

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
        const yoodleLink = `${baseUrl}/meetings/${code}/room`;

        // Optionally add to Google Calendar with Yoodle link (not Google Meet)
        let calendarEventId: string | undefined;
        if (addToCalendar) {
          try {
            const startTime = scheduledAt || new Date().toISOString();
            const endDate = new Date(new Date(startTime).getTime() + durationMin * 60000);
            const event = await createEvent(userId, {
              title,
              start: startTime,
              end: endDate.toISOString(),
              description: `Join Yoodle meeting: ${yoodleLink}`,
              attendees: attendeeEmails.length > 0 ? attendeeEmails : undefined,
              location: yoodleLink,
              addMeetLink: false, // Yoodle link, NOT Google Meet
            });
            calendarEventId = event.id;
            // Store calendar event ID on the meeting for later sync
            await Meeting.updateOne(
              { _id: meeting._id },
              { $set: { calendarEventId: event.id } }
            );
          } catch (calErr) {
            log.warn({ err: calErr }, "failed to create calendar event for yoodle meeting");
          }
        }

        // Send invite email if attendees provided
        let emailSent = false;
        if (attendeeEmails.length > 0) {
          try {
            await sendEmail(userId, {
              to: attendeeEmails,
              subject: `Meeting invite: ${title}`,
              body: `You're invited to a Yoodle meeting!\n\nTitle: ${title}\n${scheduledAt ? `When: ${new Date(scheduledAt).toLocaleString()}\n` : ""}Join here: ${yoodleLink}\n\nSee you there!`,
            });
            emailSent = true;
          } catch (emailErr) {
            log.warn({ err: emailErr }, "failed to send meeting invite email");
          }
        }

        const attendeeStr = attendeeEmails.length > 0 ? ` — invited ${attendeeEmails.join(", ")}` : "";
        return {
          success: true,
          summary: `Created Yoodle meeting "${title}"${attendeeStr}${calendarEventId ? " + added to calendar" : ""}${emailSent ? " + email sent" : ""}`,
          data: {
            meetingId: meeting._id.toString(),
            code,
            title,
            yoodleLink,
            calendarEventId,
            emailSent,
          },
        };
      }

      // ── Pending Actions ───────────────────────────────────────
      case "propose_action": {
        // Don't execute anything — just return the proposal for the client to render
        const actionType = args.actionType as string;
        const actionArgs = args.args as Record<string, unknown>;
        const summary = args.summary as string;

        return {
          success: true,
          summary: `Proposed: ${summary}`,
          data: {
            pendingAction: true,
            actionId: `action-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
            actionType,
            args: actionArgs,
            summary,
          },
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
