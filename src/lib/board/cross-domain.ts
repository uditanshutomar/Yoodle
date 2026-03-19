import connectDB from "@/lib/infra/db/client";
import Board from "@/lib/infra/db/models/board";
import Task from "@/lib/infra/db/models/task";
import TaskComment from "@/lib/infra/db/models/task-comment";
import Meeting from "@/lib/infra/db/models/meeting";
import mongoose from "mongoose";
import { getEmail } from "@/lib/google/gmail";
import { searchFiles } from "@/lib/google/drive";
import { createEvent } from "@/lib/google/calendar";
import { nanoid } from "nanoid";
import { generateMeetingCode } from "@/lib/utils/id";
import { getPersonalBoard } from "./tools";
import { isValidObjectId, verifyTaskAccess, verifyBoardAccess } from "./helpers";
import { createLogger } from "@/lib/infra/logger";
import type { ToolResult } from "@/lib/ai/tools";

const log = createLogger("board:cross-domain");

export async function createTaskFromMeeting(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  if (!isValidObjectId(args.meetingId)) return { success: false, summary: "Invalid meeting ID." };
  const meeting = await Meeting.findById(args.meetingId as string)
    .populate("participants.userId", "displayName name _id")
    .lean();
  if (!meeting) return { success: false, summary: "Meeting not found." };
  // Verify user is a participant (populated userId may be an object or ObjectId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isParticipant = meeting.participants?.some((p: any) => {
    const pid = typeof p.userId === "object" && p.userId ? (p.userId._id || p.userId).toString() : p.userId?.toString();
    return pid === userId;
  });
  if (!isParticipant) return { success: false, summary: "Access denied — you are not a participant of this meeting." };
  if (!meeting.mom?.actionItems?.length) return { success: false, summary: "No MoM action items found for this meeting." };

  const boardId = args.boardId as string | undefined;
  if (boardId && !isValidObjectId(boardId)) return { success: false, summary: "Invalid board ID." };
  const board = boardId ? await verifyBoardAccess(userId, boardId) : await getPersonalBoard(userId);
  if (!board) return { success: false, summary: "Board not found or access denied." };
  const firstColumnId = board.columns[0]?.id;
  if (!firstColumnId) return { success: false, summary: "Board has no columns." };

  const actionItemIndex = args.actionItemIndex as number | undefined;
  const items = actionItemIndex !== undefined
    ? [meeting.mom.actionItems[actionItemIndex]].filter(Boolean)
    : meeting.mom.actionItems;
  if (items.length === 0) return { success: false, summary: "Action item not found at that index." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const participantUsers = (meeting.participants?.map((p: any) => p.userId).filter(Boolean) || []) as { _id: string; displayName?: string; name?: string }[];

  // Fetch the last task position once instead of per-item (N+1 fix)
  const lastTask = await Task.findOne({ boardId: board._id, columnId: firstColumnId }).sort({ position: -1 }).select("position").lean();
  let nextPosition = lastTask ? lastTask.position + 1024 : 1024;

  const createdTasks: string[] = [];
  const taskDocs = items.map((item) => {
    const ownerUser = participantUsers.find(
      (u) => u.displayName?.toLowerCase().includes(item.assignee?.toLowerCase() || "") ||
             u.name?.toLowerCase().includes(item.assignee?.toLowerCase() || "")
    );
    let dueDate: Date | undefined;
    if (item.dueDate && item.dueDate !== "TBD") {
      const parsed = new Date(item.dueDate);
      if (!isNaN(parsed.getTime())) dueDate = parsed;
    }
    const position = nextPosition;
    nextPosition += 1024;
    createdTasks.push(item.task);
    return {
      boardId: board._id, columnId: firstColumnId, position,
      title: item.task, priority: "medium", creatorId: userId,
      assigneeId: ownerUser?._id || undefined, dueDate,
      meetingId: meeting._id,
      collaborators: participantUsers.map((u) => u._id),
      source: { type: "meeting-mom", sourceId: meeting._id.toString() },
      subtasks: [], linkedDocs: [], linkedEmails: [], labels: [],
    };
  });
  await Task.insertMany(taskDocs);

  return {
    success: true,
    summary: `Created ${createdTasks.length} task(s) from meeting "${meeting.title}": ${createdTasks.join(", ")}`,
    data: { count: createdTasks.length, tasks: createdTasks },
  };
}

export async function createTaskFromEmail(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const email = await getEmail(userId, args.emailId as string);
  if (!email) return { success: false, summary: "Email not found." };
  const boardId = args.boardId as string | undefined;
  if (boardId && !isValidObjectId(boardId)) return { success: false, summary: "Invalid board ID." };
  const board = boardId ? await verifyBoardAccess(userId, boardId) : await getPersonalBoard(userId);
  if (!board) return { success: false, summary: "Board not found or access denied." };
  const firstColumnId = board.columns[0]?.id;
  const lastTask = await Task.findOne({ boardId: board._id, columnId: firstColumnId }).sort({ position: -1 }).lean();
  const title = (args.title as string) || email.subject || "Task from email";
  const task = await Task.create({
    boardId: board._id, columnId: firstColumnId, position: lastTask ? lastTask.position + 1024 : 1024,
    title, description: `From email: "${email.subject}" by ${email.from}`,
    priority: (args.priority as string) || "medium", creatorId: userId,
    source: { type: "email", sourceId: args.emailId as string },
    linkedEmails: [{ gmailId: email.id, subject: email.subject || "", from: email.from || "" }],
    subtasks: [], linkedDocs: [], collaborators: [], labels: [],
  });
  return { success: true, summary: `Created task "${title}" from email by ${email.from}`, data: { taskId: task._id.toString(), title } };
}

export async function createTaskFromChat(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const conversationId = args.conversationId as string;
  if (!conversationId || !isValidObjectId(conversationId)) return { success: false, summary: "Invalid conversation ID." };

  // Verify the user is a participant of the conversation
  const Conversation = (await import("@/lib/infra/db/models/conversation")).default;
  const isParticipant = await Conversation.exists({
    _id: conversationId,
    "participants.userId": userId,
  });
  if (!isParticipant) return { success: false, summary: "Conversation not found or access denied." };

  let boardId = args.boardId as string | undefined;
  if (!boardId) {
    const linkedBoard = await Board.findOne({ conversationId });
    boardId = linkedBoard?._id?.toString();
  }
  if (boardId && !isValidObjectId(boardId)) return { success: false, summary: "Invalid board ID." };
  const board = boardId ? await verifyBoardAccess(userId, boardId) : await getPersonalBoard(userId);
  if (!board) return { success: false, summary: "Board not found or access denied." };
  const firstColumnId = board.columns[0]?.id;
  const lastTask = await Task.findOne({ boardId: board._id, columnId: firstColumnId }).sort({ position: -1 }).lean();
  const task = await Task.create({
    boardId: board._id, columnId: firstColumnId, position: lastTask ? lastTask.position + 1024 : 1024,
    title: args.title as string, priority: "medium", creatorId: userId,
    source: { type: "chat", sourceId: conversationId },
    subtasks: [], linkedDocs: [], linkedEmails: [], collaborators: [], labels: [],
  });
  return { success: true, summary: `Created task "${task.title}" from chat`, data: { taskId: task._id.toString(), title: task.title } };
}

export async function scheduleMeetingForTask(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  if (!isValidObjectId(args.taskId)) return { success: false, summary: "Invalid task ID." };
  // Verify access and fetch task with populated fields in one query (avoids re-fetch)
  const taskDoc = await Task.findById(args.taskId as string)
    .populate("assigneeId", "email displayName")
    .populate("collaborators", "email displayName");
  if (!taskDoc) return { success: false, summary: "Task not found." };
  const board = await Board.findOne({
    _id: taskDoc.boardId,
    $or: [{ ownerId: userId }, { "members.userId": userId }],
  }).select("_id").lean();
  if (!board) return { success: false, summary: "Task not found or access denied." };
  const task = taskDoc.toObject();
  const attendeeEmails: string[] = [];
  const assignee = task.assigneeId as { email?: string } | null;
  if (assignee?.email) attendeeEmails.push(assignee.email);
  const collabs = (task.collaborators || []) as { email?: string }[];
  for (const c of collabs) {
    if (c.email && !attendeeEmails.includes(c.email)) attendeeEmails.push(c.email);
  }

  const durationMin = (args.duration as number) || 30;
  const scheduledAt = args.scheduledAt as string | undefined;

  // If scheduledAt is provided, actually create the meeting + calendar event
  if (scheduledAt) {
    const code = generateMeetingCode();
    const title = `${task.title}`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const yoodleLink = `${baseUrl}/meetings/${code}/room`;

    const meeting = await Meeting.create({
      code,
      title,
      hostId: new mongoose.Types.ObjectId(userId),
      type: "regular",
      status: "scheduled",
      scheduledAt: new Date(scheduledAt),
      scheduledDuration: durationMin,
      participants: [
        { userId: new mongoose.Types.ObjectId(userId), role: "host", status: "joined", joinedAt: new Date() },
      ],
      settings: { maxParticipants: 25, allowRecording: true, allowScreenShare: true, waitingRoom: false, muteOnJoin: false },
    });

    // Link meeting to task
    await Task.findByIdAndUpdate(task._id, {
      $push: { linkedMeetings: { meetingId: meeting._id, title, joinUrl: yoodleLink } },
    });

    // Create Google Calendar event with Yoodle link
    let calendarEventId: string | undefined;
    try {
      const startTime = new Date(scheduledAt).toISOString();
      const endDate = new Date(new Date(scheduledAt).getTime() + durationMin * 60000);
      const event = await createEvent(userId, {
        title,
        start: startTime,
        end: endDate.toISOString(),
        description: `Yoodle meeting for task: ${task.title}\nJoin: ${yoodleLink}`,
        location: yoodleLink,
        attendees: attendeeEmails,
      });
      calendarEventId = event?.id;
    } catch (err) {
      log.warn({ err, meetingId: meeting._id.toString() }, "Calendar event creation failed (best-effort)");
    }

    return {
      success: true,
      summary: `Scheduled meeting "${title}" for ${new Date(scheduledAt).toLocaleString()}${calendarEventId ? " (added to Google Calendar)" : ""}`,
      data: {
        meetingId: meeting._id.toString(), meetingCode: code, joinUrl: yoodleLink,
        calendarEventId, taskId: task._id.toString(), attendees: attendeeEmails,
      },
    };
  }

  // No scheduledAt — return suggestions for the AI to use
  return {
    success: true,
    summary: `Ready to schedule meeting for task "${task.title}" with ${attendeeEmails.length} participant(s). Provide a scheduledAt time to create the meeting.`,
    data: {
      suggestedTitle: task.title, suggestedAttendees: attendeeEmails,
      suggestedDuration: durationMin,
      taskId: task._id.toString(),
    },
  };
}

export async function linkDocToTask(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const docAccess = await verifyTaskAccess(userId, args.taskId as string);
  if (!docAccess) return { success: false, summary: "Task not found or access denied." };
  const task = docAccess.task;
  let docId = args.googleDocId as string | undefined;
  let docName = "";
  let docUrl = "";
  let docType: "doc" | "sheet" | "slide" | "pdf" | "file" = "file";
  if (!docId && args.query) {
    const files = await searchFiles(userId, args.query as string, 1);
    if (files.length === 0) return { success: false, summary: `No Drive files found for "${args.query}"` };
    const file = files[0];
    docId = file.id;
    docName = file.name;
    docUrl = file.webViewLink || "";
    if (file.mimeType?.includes("document")) docType = "doc";
    else if (file.mimeType?.includes("spreadsheet")) docType = "sheet";
    else if (file.mimeType?.includes("presentation")) docType = "slide";
    else if (file.mimeType?.includes("pdf")) docType = "pdf";
  }
  if (!docId) return { success: false, summary: "No document ID or search query provided." };
  const alreadyLinked = task.linkedDocs?.some((d: { googleDocId: string }) => d.googleDocId === docId);
  if (alreadyLinked) return { success: true, summary: `Document already linked to "${task.title}"` };
  task.linkedDocs = [...(task.linkedDocs || []), { googleDocId: docId, title: docName, url: docUrl, type: docType }];
  await task.save();
  return { success: true, summary: `Linked "${docName || docId}" to task "${task.title}"`, data: { taskId: args.taskId, docId } };
}

export async function linkMeetingToTask(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const linkAccess = await verifyTaskAccess(userId, args.taskId as string);
  if (!linkAccess) return { success: false, summary: "Task not found or access denied." };
  const task = linkAccess.task;
  if (!isValidObjectId(args.meetingId)) return { success: false, summary: "Invalid meeting ID." };
  const meeting = await Meeting.findById(args.meetingId as string).select("title").lean();
  if (!meeting) return { success: false, summary: "Meeting not found." };
  task.meetingId = meeting._id;
  await task.save();
  return { success: true, summary: `Linked meeting "${meeting.title}" to task "${task.title}"`, data: { taskId: task._id.toString(), meetingId: meeting._id.toString() } };
}

export async function generateSubtasks(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  if (!isValidObjectId(args.taskId)) return { success: false, summary: "Invalid task ID." };
  // Fetch task and verify board access without re-fetching
  const task = await Task.findById(args.taskId as string).select("title description boardId").lean();
  if (!task) return { success: false, summary: "Task not found." };
  const boardAccess = await Board.findOne({
    _id: task.boardId,
    $or: [{ ownerId: userId }, { "members.userId": userId }],
  }).select("_id").lean();
  if (!boardAccess) return { success: false, summary: "Task not found or access denied." };
  const count = Math.min(Math.max((args.count as number) || 5, 3), 10);
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, summary: "AI not configured." };
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.0-flash" });
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: `Break down this task into ${count} concrete, actionable subtasks. Return ONLY a JSON array of strings, no explanation.\n\nTask: "${task.title}"\n${task.description ? `Description: ${task.description}` : ""}\n\nExample output: ["Subtask 1", "Subtask 2", "Subtask 3"]` }] }],
  });
  const text = result.response.text().trim();
  let subtasks: string[];
  try {
    const match = text.match(/\[[\s\S]*\]/);
    subtasks = match ? JSON.parse(match[0]) : [];
  } catch {
    subtasks = text.split("\n").filter(Boolean).map((s) => s.replace(/^[\d\-.*]+\s*/, "").trim());
  }
  if (subtasks.length === 0) return { success: false, summary: "Could not generate subtasks." };
  const newSubtasks = subtasks.map((s) => ({ id: nanoid(8), title: s, done: false }));
  await Task.findByIdAndUpdate(task._id, { $push: { subtasks: { $each: newSubtasks } } });
  return { success: true, summary: `Generated ${newSubtasks.length} subtasks for "${task.title}": ${subtasks.join(", ")}`, data: { subtasks: newSubtasks } };
}

export async function getTaskContext(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  if (!isValidObjectId(args.taskId)) return { success: false, summary: "Invalid task ID." };
  // Fetch task with populated fields in one query (avoids verifyTaskAccess + re-fetch)
  const task = await Task.findById(args.taskId as string)
    .populate("assigneeId", "displayName name email")
    .populate("collaborators", "displayName name")
    .populate("boardId", "title")
    .lean();
  if (!task) return { success: false, summary: "Task not found." };
  // Verify board access — boardId may be populated (object with _id) or a raw ObjectId
  const rawBoardId = typeof task.boardId === "object" && task.boardId && "_id" in (task.boardId as unknown as Record<string, unknown>)
    ? (task.boardId as unknown as { _id: mongoose.Types.ObjectId })._id
    : (task.boardId as mongoose.Types.ObjectId);
  const hasAccess = await Board.findOne({
    _id: rawBoardId,
    $or: [{ ownerId: userId }, { "members.userId": userId }],
  }).select("_id").lean();
  if (!hasAccess) return { success: false, summary: "Task not found or access denied." };
  let meetingInfo = null;
  if (task.meetingId) {
    const meeting = await Meeting.findById(task.meetingId).lean();
    if (meeting) {
      meetingInfo = { title: meeting.title, status: meeting.status, scheduledAt: meeting.scheduledAt, hasMom: !!meeting.mom?.summary, momSummary: meeting.mom?.summary || null };
    }
  }
  const comments = await TaskComment.find({ taskId: task._id }).sort({ createdAt: -1 }).limit(10).populate("authorId", "displayName name").lean();
  const assignee = task.assigneeId as { displayName?: string; name?: string; email?: string } | null;
  const board = task.boardId as { title?: string } | null;
  return {
    success: true,
    summary: `Task "${task.title}" — ${task.priority} priority, assignee: ${assignee?.displayName || "unassigned"}`,
    data: {
      id: task._id.toString(), title: task.title, description: task.description,
      priority: task.priority, column: task.columnId, board: board?.title,
      assignee: assignee?.displayName || assignee?.name || null, dueDate: task.dueDate,
      subtasks: task.subtasks?.map((s: { title: string; done: boolean }) => ({ title: s.title, done: s.done })),
      linkedDocs: task.linkedDocs, linkedEmails: task.linkedEmails,
      meeting: meetingInfo,
      recentActivity: comments.map((c) => ({
        type: c.type, content: c.content,
        author: (c.authorId as { displayName?: string } | null)?.displayName || "Unknown",
        at: c.createdAt,
      })),
      source: task.source,
    },
  };
}
