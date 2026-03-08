import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth/middleware";
import { hasGoogleAccess } from "@/lib/google/client";
import * as gmail from "@/lib/google/gmail";
import * as calendar from "@/lib/google/calendar";
import * as drive from "@/lib/google/drive";
import * as docs from "@/lib/google/docs";
import * as sheets from "@/lib/google/sheets";
import * as tasks from "@/lib/google/tasks";
import * as contacts from "@/lib/google/contacts";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

// ── Validation ──────────────────────────────────────────────────────

const actionSchema = z.object({
  action: z.string().min(1, "Action is required."),
  params: z.record(z.string(), z.unknown()).optional().default({}),
});

// ── Action registry ─────────────────────────────────────────────────

type ActionHandler = (
  userId: string,
  params: Record<string, unknown>
) => Promise<unknown>;

const ACTIONS: Record<string, ActionHandler> = {
  // Gmail
  "gmail.list": (userId, params) =>
    gmail.listEmails(userId, {
      maxResults: (params.maxResults as number) || 10,
      query: params.query as string,
    }),
  "gmail.search": (userId, params) =>
    gmail.searchEmails(userId, params.query as string, (params.maxResults as number) || 10),
  "gmail.send": (userId, params) =>
    gmail.sendEmail(userId, {
      to: params.to as string[],
      subject: params.subject as string,
      body: params.body as string,
      cc: params.cc as string[],
      bcc: params.bcc as string[],
      isHtml: params.isHtml as boolean,
      replyToMessageId: params.replyToMessageId as string,
      threadId: params.threadId as string,
    }),
  "gmail.unreadCount": (userId) => gmail.getUnreadCount(userId),
  "gmail.markRead": (userId, params) =>
    gmail.modifyEmailLabels(userId, params.messageId as string, [], ["UNREAD"]),
  "gmail.markUnread": (userId, params) =>
    gmail.modifyEmailLabels(userId, params.messageId as string, ["UNREAD"], []),
  "gmail.archive": (userId, params) =>
    gmail.modifyEmailLabels(userId, params.messageId as string, [], ["INBOX"]),

  // Calendar
  "calendar.list": (userId, params) =>
    calendar.listEvents(userId, {
      maxResults: (params.maxResults as number) || 20,
      timeMin: params.timeMin as string,
      timeMax: params.timeMax as string,
    }),
  "calendar.get": (userId, params) =>
    calendar.getEvent(userId, params.eventId as string),
  "calendar.create": (userId, params) =>
    calendar.createEvent(userId, {
      title: params.title as string,
      description: params.description as string,
      start: params.start as string,
      end: params.end as string,
      location: params.location as string,
      attendees: params.attendees as string[],
      addMeetLink: params.addMeetLink as boolean,
      timeZone: params.timeZone as string,
    }),
  "calendar.update": (userId, params) =>
    calendar.updateEvent(userId, params.eventId as string, params.updates as Partial<calendar.CreateEventOptions>),
  "calendar.delete": (userId, params) =>
    calendar.deleteEvent(userId, params.eventId as string),
  "calendar.freeBusy": (userId, params) =>
    calendar.getFreeBusy(userId, params.timeMin as string, params.timeMax as string),

  // Drive
  "drive.list": (userId, params) =>
    drive.listFiles(userId, {
      maxResults: (params.maxResults as number) || 20,
      query: params.query as string,
      folderId: params.folderId as string,
    }),
  "drive.search": (userId, params) =>
    drive.searchFiles(userId, params.query as string, (params.maxResults as number) || 10),
  "drive.get": (userId, params) =>
    drive.getFile(userId, params.fileId as string),
  "drive.getContent": (userId, params) =>
    drive.getFileContent(userId, params.fileId as string),
  "drive.createDoc": (userId, params) =>
    drive.createGoogleDoc(userId, params.title as string, params.folderId as string),
  "drive.createSheet": (userId, params) =>
    drive.createGoogleSheet(userId, params.title as string, params.folderId as string),
  "drive.createSlides": (userId, params) =>
    drive.createGoogleSlides(userId, params.title as string, params.folderId as string),

  // Docs
  "docs.get": (userId, params) =>
    docs.getDocContent(userId, params.documentId as string),
  "docs.append": (userId, params) =>
    docs.appendToDoc(userId, params.documentId as string, params.text as string),
  "docs.replace": (userId, params) =>
    docs.replaceTextInDoc(userId, params.documentId as string, params.searchText as string, params.replaceText as string),

  // Sheets
  "sheets.getMeta": (userId, params) =>
    sheets.getSpreadsheet(userId, params.spreadsheetId as string),
  "sheets.read": (userId, params) =>
    sheets.readSheet(userId, params.spreadsheetId as string, params.range as string),
  "sheets.write": (userId, params) =>
    sheets.writeSheet(userId, params.spreadsheetId as string, params.range as string, params.values as string[][]),
  "sheets.append": (userId, params) =>
    sheets.appendToSheet(userId, params.spreadsheetId as string, params.range as string, params.values as string[][]),
  "sheets.clear": (userId, params) =>
    sheets.clearSheet(userId, params.spreadsheetId as string, params.range as string),

  // Tasks
  "tasks.listLists": (userId) => tasks.listTaskLists(userId),
  "tasks.list": (userId, params) =>
    tasks.listTasks(userId, (params.taskListId as string) || "@default", {
      showCompleted: params.showCompleted as boolean,
    }),
  "tasks.create": (userId, params) =>
    tasks.createTask(userId, (params.taskListId as string) || "@default", {
      title: params.title as string,
      notes: params.notes as string,
      due: params.due as string,
    }),
  "tasks.update": (userId, params) =>
    tasks.updateTask(userId, params.taskListId as string, params.taskId as string, params.updates as Record<string, unknown>),
  "tasks.complete": (userId, params) =>
    tasks.completeTask(userId, params.taskListId as string, params.taskId as string),
  "tasks.delete": (userId, params) =>
    tasks.deleteTask(userId, params.taskListId as string, params.taskId as string),

  // Contacts
  "contacts.list": (userId, params) =>
    contacts.listContacts(userId, { maxResults: (params.maxResults as number) || 20 }),
  "contacts.search": (userId, params) =>
    contacts.searchContacts(userId, params.query as string, (params.maxResults as number) || 10),
};

// ── POST /api/ai/workspace-action ──────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    let userId: string;

    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    // Check Google access
    const hasAccess = await hasGoogleAccess(userId);
    if (!hasAccess) {
      return forbiddenResponse(
        "Google Workspace not connected. Please sign in with Google to enable Workspace features."
      );
    }

    const body = await request.json();
    const parsed = actionSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse({
        message: "Validation failed.",
        status: 400,
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { action, params } = parsed.data;

    const handler = ACTIONS[action];
    if (!handler) {
      return errorResponse({
        message: `Unknown action: ${action}`,
        status: 400,
      });
    }

    const result = await handler(userId, params);
    return successResponse({ action, result });
  } catch (error) {
    console.error("[Workspace Action Error]", error);

    // Handle Google API errors specifically
    const errorMessage =
      error instanceof Error ? error.message : "Workspace action failed.";

    if (errorMessage.includes("invalid_grant") || errorMessage.includes("Token has been expired")) {
      return errorResponse({
        message: "Google session expired. Please re-authenticate with Google.",
        status: 401,
      });
    }

    return serverErrorResponse(errorMessage);
  }
}
