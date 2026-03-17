import connectDB from "@/lib/infra/db/client";
import Board from "@/lib/infra/db/models/board";
import Task from "@/lib/infra/db/models/task";
import TaskComment from "@/lib/infra/db/models/task-comment";
import Meeting from "@/lib/infra/db/models/meeting";
import { getEmail } from "@/lib/google/gmail";
import { searchFiles } from "@/lib/google/drive";
import { nanoid } from "nanoid";
import { getPersonalBoard } from "./tools";
import type { ToolResult } from "@/lib/ai/tools";

export async function createTaskFromMeeting(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const meeting = await Meeting.findById(args.meetingId as string)
    .populate("participants.userId", "displayName name _id")
    .lean();
  if (!meeting) return { success: false, summary: "Meeting not found." };
  if (!meeting.mom?.actionItems?.length) return { success: false, summary: "No MoM action items found for this meeting." };

  const board = args.boardId ? await Board.findById(args.boardId as string) : await getPersonalBoard(userId);
  if (!board) return { success: false, summary: "Board not found." };
  const firstColumnId = board.columns[0]?.id;
  if (!firstColumnId) return { success: false, summary: "Board has no columns." };

  const actionItemIndex = args.actionItemIndex as number | undefined;
  const items = actionItemIndex !== undefined
    ? [meeting.mom.actionItems[actionItemIndex]].filter(Boolean)
    : meeting.mom.actionItems;
  if (items.length === 0) return { success: false, summary: "Action item not found at that index." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const participantUsers = (meeting.participants?.map((p: any) => p.userId).filter(Boolean) || []) as { _id: string; displayName?: string; name?: string }[];

  const createdTasks: string[] = [];
  for (const item of items) {
    const ownerUser = participantUsers.find(
      (u) => u.displayName?.toLowerCase().includes(item.owner?.toLowerCase() || "") ||
             u.name?.toLowerCase().includes(item.owner?.toLowerCase() || "")
    );
    let dueDate: Date | undefined;
    if (item.due && item.due !== "TBD") {
      const parsed = new Date(item.due);
      if (!isNaN(parsed.getTime())) dueDate = parsed;
    }
    const lastTask = await Task.findOne({ boardId: board._id, columnId: firstColumnId }).sort({ position: -1 }).lean();
    const task = await Task.create({
      boardId: board._id, columnId: firstColumnId, position: (lastTask?.position ?? 0) + 1,
      title: item.task, priority: "medium", creatorId: userId,
      assigneeId: ownerUser?._id || undefined, dueDate,
      meetingId: meeting._id,
      collaborators: participantUsers.map((u) => u._id),
      source: { type: "meeting-mom", sourceId: meeting._id.toString() },
      subtasks: [], linkedDocs: [], linkedEmails: [], labels: [],
    });
    createdTasks.push(task.title);
  }

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
  const board = args.boardId ? await Board.findById(args.boardId as string) : await getPersonalBoard(userId);
  if (!board) return { success: false, summary: "Board not found." };
  const firstColumnId = board.columns[0]?.id;
  const lastTask = await Task.findOne({ boardId: board._id, columnId: firstColumnId }).sort({ position: -1 }).lean();
  const title = (args.title as string) || email.subject || "Task from email";
  const task = await Task.create({
    boardId: board._id, columnId: firstColumnId, position: (lastTask?.position ?? 0) + 1,
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
  let boardId = args.boardId as string | undefined;
  if (!boardId) {
    const linkedBoard = await Board.findOne({ conversationId });
    boardId = linkedBoard?._id?.toString();
  }
  const board = boardId ? await Board.findById(boardId) : await getPersonalBoard(userId);
  if (!board) return { success: false, summary: "Board not found." };
  const firstColumnId = board.columns[0]?.id;
  const lastTask = await Task.findOne({ boardId: board._id, columnId: firstColumnId }).sort({ position: -1 }).lean();
  const task = await Task.create({
    boardId: board._id, columnId: firstColumnId, position: (lastTask?.position ?? 0) + 1,
    title: args.title as string, priority: "medium", creatorId: userId,
    source: { type: "chat", sourceId: conversationId },
    subtasks: [], linkedDocs: [], linkedEmails: [], collaborators: [], labels: [],
  });
  return { success: true, summary: `Created task "${task.title}" from chat`, data: { taskId: task._id.toString(), title: task.title } };
}

export async function scheduleMeetingForTask(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const task = await Task.findById(args.taskId as string)
    .populate("assigneeId", "email displayName")
    .populate("collaborators", "email displayName")
    .lean();
  if (!task) return { success: false, summary: "Task not found." };
  const attendeeEmails: string[] = [];
  const assignee = task.assigneeId as { email?: string } | null;
  if (assignee?.email) attendeeEmails.push(assignee.email);
  const collabs = (task.collaborators || []) as { email?: string }[];
  for (const c of collabs) {
    if (c.email && !attendeeEmails.includes(c.email)) attendeeEmails.push(c.email);
  }
  return {
    success: true,
    summary: `Ready to schedule meeting for task "${task.title}" with ${attendeeEmails.length} participant(s)`,
    data: {
      suggestedTitle: task.title, suggestedAttendees: attendeeEmails,
      suggestedDuration: (args.duration as number) || 30,
      scheduledAt: args.scheduledAt || null, taskId: task._id.toString(),
    },
  };
}

export async function linkDocToTask(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const task = await Task.findById(args.taskId as string);
  if (!task) return { success: false, summary: "Task not found." };
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
  const task = await Task.findById(args.taskId as string);
  if (!task) return { success: false, summary: "Task not found." };
  const meeting = await Meeting.findById(args.meetingId as string);
  if (!meeting) return { success: false, summary: "Meeting not found." };
  task.meetingId = meeting._id;
  await task.save();
  return { success: true, summary: `Linked meeting "${meeting.title}" to task "${task.title}"`, data: { taskId: task._id.toString(), meetingId: meeting._id.toString() } };
}

export async function generateSubtasks(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const task = await Task.findById(args.taskId as string).lean();
  if (!task) return { success: false, summary: "Task not found." };
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
  const task = await Task.findById(args.taskId as string)
    .populate("assigneeId", "displayName name email")
    .populate("collaborators", "displayName name")
    .populate("boardId", "title")
    .lean();
  if (!task) return { success: false, summary: "Task not found." };
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
