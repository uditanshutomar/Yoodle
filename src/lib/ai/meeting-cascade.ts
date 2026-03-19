import { createLogger } from "@/lib/infra/logger";

const log = createLogger("meeting-cascade");

/* ─── Types ─── */

export interface CascadeStepResult {
  step: string;
  status: "done" | "skipped" | "error";
  summary: string;
  undoToken?: string;
  artifacts?: Record<string, string>;
}

export interface CascadeResult {
  meetingId: string;
  steps: CascadeStepResult[];
  undoTokens: string[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface CascadeMeeting {
  _id: unknown;
  title: string;
  hostId?: unknown;
  mom?: Record<string, unknown>;
  scheduledAt?: Date;
  createdAt?: Date;
  participants?: { userId: unknown }[];
}

/* ─── Helpers ─── */

function formatMomAsMarkdown(mom: {
  summary?: string;
  keyDecisions?: string[];
  discussionPoints?: string[];
  actionItems?: { task: string; assignee?: string; dueDate?: string }[];
  nextSteps?: string[];
}): string {
  const lines: string[] = [];

  if (mom.summary) {
    lines.push("## Summary", "", mom.summary, "");
  }

  if (mom.keyDecisions?.length) {
    lines.push("## Key Decisions", "");
    for (const kd of mom.keyDecisions) lines.push(`- ${kd}`);
    lines.push("");
  }

  if (mom.discussionPoints?.length) {
    lines.push("## Discussion Points", "");
    for (const dp of mom.discussionPoints) lines.push(`- ${dp}`);
    lines.push("");
  }

  if (mom.actionItems?.length) {
    lines.push("## Action Items", "");
    for (const ai of mom.actionItems) {
      const owner = ai.assignee ? ` (${ai.assignee})` : "";
      const due = ai.dueDate ? ` — due ${ai.dueDate}` : "";
      lines.push(`- ${ai.task}${owner}${due}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/* ─── Pipeline Steps ─── */

async function stepCreateMomDoc(
  userId: string,
  meeting: CascadeMeeting,
): Promise<CascadeStepResult> {
  const { createGoogleDoc, getOrCreateMeetingFolder } = await import("@/lib/google/drive");
  const { appendToDoc } = await import("@/lib/google/docs");
  const { storeUndoToken } = await import("@/lib/ai/meeting-undo");

  const meetingDate = meeting.scheduledAt || meeting.createdAt || new Date();
  const folder = await getOrCreateMeetingFolder(userId, meeting.title, new Date(meetingDate as string | number | Date));
  const doc = await createGoogleDoc(userId, `MoM — ${meeting.title}`, folder.id);
  const markdown = formatMomAsMarkdown(meeting.mom as Parameters<typeof formatMomAsMarkdown>[0]);
  await appendToDoc(userId, doc.id, markdown);

  const token = await storeUndoToken(userId, {
    action: "create_mom_doc",
    resourceId: doc.id,
    reverseAction: "delete_file",
    reverseArgs: { fileId: doc.id, meetingId: String(meeting._id) },
    description: `Delete MoM document "${doc.name}"`,
  });

  return {
    step: "create_mom_doc",
    status: "done",
    summary: `Created MoM document "${doc.name}" in folder "${folder.name}"`,
    undoToken: token,
    artifacts: {
      momDocId: doc.id,
      momDocUrl: doc.webViewLink || `https://docs.google.com/document/d/${doc.id}/edit`,
      folderId: folder.id,
      folderUrl: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
    },
  };
}

async function stepCreateTasks(
  userId: string,
  meeting: CascadeMeeting,
): Promise<CascadeStepResult> {
  const { createTaskFromMeeting } = await import("@/lib/board/cross-domain");
  const { storeUndoToken } = await import("@/lib/ai/meeting-undo");

  const result = await createTaskFromMeeting(userId, { meetingId: String(meeting._id) });

  if (!result.success) {
    return { step: "create_tasks", status: "error", summary: result.summary };
  }

  const token = await storeUndoToken(userId, {
    action: "create_tasks",
    resourceId: String(meeting._id),
    reverseAction: "delete_tasks",
    reverseArgs: { meetingId: String(meeting._id), taskCount: (result.data as { count: number })?.count ?? 0 },
    description: `Delete tasks created from meeting`,
  });

  return {
    step: "create_tasks",
    status: "done",
    summary: result.summary,
    undoToken: token,
  };
}

async function stepSendFollowup(
  userId: string,
  meeting: CascadeMeeting,
): Promise<CascadeStepResult> {
  const User = (await import("@/lib/infra/db/models/user")).default;
  const { sendEmail } = await import("@/lib/google/gmail");
  const { storeUndoToken } = await import("@/lib/ai/meeting-undo");

  const participantIds = (meeting.participants || []).map((p) => String(p.userId));
  if (participantIds.length === 0) {
    return { step: "send_followup", status: "skipped", summary: "No participants to email" };
  }

  const users = await User.find({ _id: { $in: participantIds } }, { email: 1 }).lean();
  const emails = users.map((u: { email?: string }) => u.email).filter(Boolean) as string[];

  if (emails.length === 0) {
    return { step: "send_followup", status: "skipped", summary: "No participant emails found" };
  }

  const momData = meeting.mom as { summary?: string };
  const body = `Hi,\n\nHere is the follow-up from "${meeting.title}":\n\n${momData.summary || "No summary available."}\n\nBest,\nYoodle`;

  await sendEmail(userId, {
    to: emails,
    subject: `Follow-up: ${meeting.title}`,
    body,
  });

  const token = await storeUndoToken(userId, {
    action: "send_followup",
    resourceId: String(meeting._id),
    reverseAction: "noop",
    reverseArgs: { note: "Email already sent — cannot unsend", meetingId: String(meeting._id) },
    description: `Follow-up email sent — cannot unsend`,
  });

  return {
    step: "send_followup",
    status: "done",
    summary: `Sent follow-up email to ${emails.length} participant(s)`,
    undoToken: token,
  };
}

async function stepAppendSheet(
  userId: string,
  meeting: CascadeMeeting,
  analyticsSheetId: string,
): Promise<CascadeStepResult> {
  const { appendToSheet } = await import("@/lib/google/sheets");

  const momData = meeting.mom as { actionItems?: unknown[]; keyDecisions?: unknown[]; discussionPoints?: unknown[]; nextSteps?: unknown[] };
  const meetingDate = meeting.scheduledAt || meeting.createdAt || new Date();

  const row = [
    String(meeting._id),
    meeting.title,
    new Date(meetingDate as string | number | Date).toISOString(),
    String(meeting.participants?.length ?? 0),
    String(momData.actionItems?.length ?? 0),
    String(momData.keyDecisions?.length ?? 0),
    String(momData.discussionPoints?.length ?? 0),
  ];

  await appendToSheet(userId, analyticsSheetId, "Sheet1!A:G", [row]);

  return {
    step: "append_sheet",
    status: "done",
    summary: `Appended meeting stats row to analytics sheet`,
  };
}

function buildNotifyStep(steps: CascadeStepResult[]): CascadeStepResult {
  const done = steps.filter((s) => s.status === "done").length;
  const skipped = steps.filter((s) => s.status === "skipped").length;
  const errored = steps.filter((s) => s.status === "error").length;

  return {
    step: "notify",
    status: "done",
    summary: `Cascade complete: ${done} done, ${skipped} skipped, ${errored} error(s)`,
  };
}

/* ─── Main Pipeline ─── */

export async function executeMeetingCascade(
  userId: string,
  meetingId: string,
  options?: {
    analyticsSheetId?: string;
    onProgress?: (step: CascadeStepResult) => void;
    skipSteps?: string[];
  },
): Promise<CascadeResult> {
  const connectDB = (await import("@/lib/infra/db/client")).default;
  await connectDB();

  const Meeting = (await import("@/lib/infra/db/models/meeting")).default;

  const skipSet = new Set(options?.skipSteps ?? []);
  const steps: CascadeStepResult[] = [];
  const undoTokens: string[] = [];

  function pushStep(result: CascadeStepResult) {
    steps.push(result);
    if (result.undoToken) undoTokens.push(result.undoToken);
    options?.onProgress?.(result);
  }

  // Load meeting
  const meeting = await Meeting.findById(meetingId)
    .select("-ghostMessages -ghostNotes")
    .populate("participants.userId", "email displayName") // email needed for follow-up email delivery
    .lean();

  if (!meeting) {
    const errorStep: CascadeStepResult = {
      step: "load_meeting",
      status: "error",
      summary: `Meeting not found: ${meetingId}`,
    };
    pushStep(errorStep);
    pushStep(buildNotifyStep(steps));
    return { meetingId, steps, undoTokens };
  }

  const mtg = meeting as CascadeMeeting;

  // Verify the user is the host or a participant of the meeting
  const meetingRaw = meeting as CascadeMeeting;
  const isHost = String(meetingRaw.hostId) === userId;
  const isParticipant = mtg.participants?.some((p) => {
    // userId may be populated (object with _id) or a raw ObjectId
    const pid = typeof p.userId === "object" && p.userId && "_id" in (p.userId as Record<string, unknown>)
      ? String((p.userId as unknown as { _id: unknown })._id)
      : String(p.userId);
    return pid === userId;
  });
  if (!isHost && !isParticipant) {
    const errorStep: CascadeStepResult = {
      step: "authorize",
      status: "error",
      summary: "Access denied — you are not a host or participant of this meeting",
    };
    pushStep(errorStep);
    pushStep(buildNotifyStep(steps));
    return { meetingId, steps, undoTokens };
  }

  log.info({ meetingId, title: mtg.title }, "Starting meeting cascade");

  // Run independent steps in parallel — each step has its own .catch() so
  // the array always resolves (no rejections). Using Promise.all is correct
  // here because individual error handling is already done per-step.
  const parallelSteps = await Promise.all([
    // Step 1: Create MoM doc
    !skipSet.has("create_mom_doc") && mtg.mom
      ? stepCreateMomDoc(userId, mtg).catch((err) => ({ step: "create_mom_doc", status: "error" as const, summary: err instanceof Error ? err.message : "Unknown error" }))
      : { step: "create_mom_doc", status: "skipped" as const, summary: skipSet.has("create_mom_doc") ? "Skipped by user" : "No MoM data on meeting" },
    // Step 2: Create tasks
    !skipSet.has("create_tasks") && (mtg.mom as any)?.actionItems?.length
      ? stepCreateTasks(userId, mtg).catch((err) => ({ step: "create_tasks", status: "error" as const, summary: err instanceof Error ? err.message : "Unknown error" }))
      : { step: "create_tasks", status: "skipped" as const, summary: skipSet.has("create_tasks") ? "Skipped by user" : "No action items in MoM" },
    // Step 3: Send follow-up
    !skipSet.has("send_followup")
      ? stepSendFollowup(userId, mtg).catch((err) => ({ step: "send_followup", status: "error" as const, summary: err instanceof Error ? err.message : "Unknown error" }))
      : { step: "send_followup", status: "skipped" as const, summary: "Skipped by user" },
    // Step 4: Append sheet
    !skipSet.has("append_sheet") && options?.analyticsSheetId
      ? stepAppendSheet(userId, mtg, options.analyticsSheetId).catch((err) => ({ step: "append_sheet", status: "error" as const, summary: err instanceof Error ? err.message : "Unknown error" }))
      : { step: "append_sheet", status: "skipped" as const, summary: skipSet.has("append_sheet") ? "Skipped by user" : "No analytics sheet ID provided" },
  ]);

  for (const stepResult of parallelSteps) {
    pushStep(stepResult);
  }

  // Step 5: notify (always last)
  pushStep(buildNotifyStep(steps));

  // Persist artifacts on the meeting document
  const allArtifacts: Record<string, string> = {};
  for (const step of steps) {
    if (step.artifacts) {
      Object.assign(allArtifacts, step.artifacts);
    }
  }

  if (Object.keys(allArtifacts).length > 0) {
    try {
      await Meeting.updateOne(
        { _id: meetingId },
        { $set: { artifacts: allArtifacts } },
      );
    } catch (err) {
      log.warn({ err, meetingId }, "Failed to persist artifacts on meeting");
    }
  }

  log.info(
    { meetingId, steps: steps.map((s) => `${s.step}:${s.status}`) },
    "Meeting cascade completed",
  );

  return { meetingId, steps, undoTokens };
}
