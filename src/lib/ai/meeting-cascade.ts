import { createLogger } from "@/lib/infra/logger";

const log = createLogger("meeting-cascade");

/* ─── Types ─── */

export interface CascadeStepResult {
  step: string;
  status: "done" | "skipped" | "error";
  summary: string;
  undoToken?: string;
}

export interface CascadeResult {
  meetingId: string;
  steps: CascadeStepResult[];
  undoTokens: string[];
}

/* ─── Helpers ─── */

function formatMomAsMarkdown(mom: {
  summary?: string;
  keyPoints?: string[];
  actionItems?: { task: string; owner?: string; due?: string }[];
  decisions?: string[];
}): string {
  const lines: string[] = [];

  if (mom.summary) {
    lines.push("## Summary", "", mom.summary, "");
  }

  if (mom.keyPoints?.length) {
    lines.push("## Key Points", "");
    for (const kp of mom.keyPoints) lines.push(`- ${kp}`);
    lines.push("");
  }

  if (mom.decisions?.length) {
    lines.push("## Decisions", "");
    for (const d of mom.decisions) lines.push(`- ${d}`);
    lines.push("");
  }

  if (mom.actionItems?.length) {
    lines.push("## Action Items", "");
    for (const ai of mom.actionItems) {
      const owner = ai.owner ? ` (${ai.owner})` : "";
      const due = ai.due ? ` — due ${ai.due}` : "";
      lines.push(`- ${ai.task}${owner}${due}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/* ─── Pipeline Steps ─── */

async function stepCreateMomDoc(
  userId: string,
  meeting: { _id: unknown; title: string; mom: Record<string, unknown>; scheduledAt?: Date; createdAt?: Date },
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
    type: "delete_file",
    fileId: doc.id,
    meetingId: String(meeting._id),
  });

  return {
    step: "create_mom_doc",
    status: "done",
    summary: `Created MoM document "${doc.name}" in folder "${folder.name}"`,
    undoToken: token,
  };
}

async function stepCreateTasks(
  userId: string,
  meeting: { _id: unknown },
): Promise<CascadeStepResult> {
  const { createTaskFromMeeting } = await import("@/lib/board/cross-domain");
  const { storeUndoToken } = await import("@/lib/ai/meeting-undo");

  const result = await createTaskFromMeeting(userId, { meetingId: String(meeting._id) });

  if (!result.success) {
    return { step: "create_tasks", status: "error", summary: result.summary };
  }

  const token = await storeUndoToken(userId, {
    type: "delete_tasks",
    meetingId: String(meeting._id),
    taskCount: (result.data as { count: number })?.count ?? 0,
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
  meeting: { _id: unknown; title: string; mom: Record<string, unknown>; participants?: { userId: unknown }[] },
): Promise<CascadeStepResult> {
  const User = (await import("@/lib/infra/db/models/user")).default;
  const { sendEmail } = await import("@/lib/google/gmail");
  const { storeUndoToken } = await import("@/lib/ai/meeting-undo");

  const participantIds = (meeting.participants || []).map((p) => p.userId);
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
    type: "noop",
    note: "Email already sent — cannot unsend",
    meetingId: String(meeting._id),
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
  meeting: { _id: unknown; title: string; mom: Record<string, unknown>; participants?: unknown[]; scheduledAt?: Date; createdAt?: Date },
  analyticsSheetId: string,
): Promise<CascadeStepResult> {
  const { appendToSheet } = await import("@/lib/google/sheets");

  const momData = meeting.mom as { actionItems?: unknown[]; keyPoints?: unknown[]; decisions?: unknown[] };
  const meetingDate = meeting.scheduledAt || meeting.createdAt || new Date();

  const row = [
    String(meeting._id),
    meeting.title,
    new Date(meetingDate as string | number | Date).toISOString(),
    String(meeting.participants?.length ?? 0),
    String(momData.actionItems?.length ?? 0),
    String(momData.keyPoints?.length ?? 0),
    String(momData.decisions?.length ?? 0),
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
    .populate("participants.userId", "email displayName")
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

  log.info({ meetingId, title: meeting.title }, "Starting meeting cascade");

  // Step 1: create_mom_doc
  if (!skipSet.has("create_mom_doc")) {
    if (meeting.mom) {
      try {
        pushStep(await stepCreateMomDoc(userId, meeting));
      } catch (err) {
        pushStep({
          step: "create_mom_doc",
          status: "error",
          summary: err instanceof Error ? err.message : "Unknown error creating MoM doc",
        });
      }
    } else {
      pushStep({ step: "create_mom_doc", status: "skipped", summary: "No MoM data on meeting" });
    }
  } else {
    pushStep({ step: "create_mom_doc", status: "skipped", summary: "Skipped by user" });
  }

  // Step 2: create_tasks
  if (!skipSet.has("create_tasks")) {
    if (meeting.mom?.actionItems?.length) {
      try {
        pushStep(await stepCreateTasks(userId, meeting));
      } catch (err) {
        pushStep({
          step: "create_tasks",
          status: "error",
          summary: err instanceof Error ? err.message : "Unknown error creating tasks",
        });
      }
    } else {
      pushStep({ step: "create_tasks", status: "skipped", summary: "No action items in MoM" });
    }
  } else {
    pushStep({ step: "create_tasks", status: "skipped", summary: "Skipped by user" });
  }

  // Step 3: send_followup
  if (!skipSet.has("send_followup")) {
    try {
      pushStep(await stepSendFollowup(userId, meeting));
    } catch (err) {
      pushStep({
        step: "send_followup",
        status: "error",
        summary: err instanceof Error ? err.message : "Unknown error sending follow-up",
      });
    }
  } else {
    pushStep({ step: "send_followup", status: "skipped", summary: "Skipped by user" });
  }

  // Step 4: append_sheet
  if (!skipSet.has("append_sheet")) {
    if (options?.analyticsSheetId) {
      try {
        pushStep(await stepAppendSheet(userId, meeting, options.analyticsSheetId));
      } catch (err) {
        pushStep({
          step: "append_sheet",
          status: "error",
          summary: err instanceof Error ? err.message : "Unknown error appending to sheet",
        });
      }
    } else {
      pushStep({ step: "append_sheet", status: "skipped", summary: "No analytics sheet ID provided" });
    }
  } else {
    pushStep({ step: "append_sheet", status: "skipped", summary: "Skipped by user" });
  }

  // Step 5: notify (always last)
  pushStep(buildNotifyStep(steps));

  log.info(
    { meetingId, steps: steps.map((s) => `${s.step}:${s.status}`) },
    "Meeting cascade completed",
  );

  return { meetingId, steps, undoTokens };
}
