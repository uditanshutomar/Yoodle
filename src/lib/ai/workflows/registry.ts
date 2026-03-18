import type { WorkflowTemplate } from "./types";

const workflows: WorkflowTemplate[] = [
  {
    id: "meeting-prep",
    name: "Meeting Prep",
    description: "Fetch meeting details, related tasks and messages, generate talking points",
    triggerPhrases: ["prep for", "prepare for meeting", "meeting prep", "get ready for meeting"],
    steps: [
      {
        id: "fetch-meeting",
        label: "Fetch meeting details",
        toolName: "list_calendar_events",
        buildArgs: (ctx) => ({
          maxResults: 1,
          timeMin: ctx.params.meetingTime ?? new Date().toISOString(),
        }),
      },
      {
        id: "related-tasks",
        label: "Find related tasks",
        toolName: "search_board_tasks",
        buildArgs: (ctx) => {
          const meetingTitle =
            (ctx.stepResults["fetch-meeting"]?.data as Record<string, unknown[]>)?.events?.[0] as
              | Record<string, unknown>
              | undefined;
          const summary = (meetingTitle?.summary as string) ?? "";
          return { query: summary, limit: 5 };
        },
      },
      {
        id: "related-messages",
        label: "Search related conversations",
        toolName: "search_messages",
        buildArgs: (ctx) => {
          const meetingTitle =
            (ctx.stepResults["fetch-meeting"]?.data as Record<string, unknown[]>)?.events?.[0] as
              | Record<string, unknown>
              | undefined;
          const summary = (meetingTitle?.summary as string) ?? "";
          return { query: summary, limit: 5 };
        },
      },
      {
        id: "create-prep-task",
        label: "Create prep checklist task",
        toolName: "create_board_task",
        buildArgs: (ctx) => {
          const meetingTitle =
            (ctx.stepResults["fetch-meeting"]?.data as Record<string, unknown[]>)?.events?.[0] as
              | Record<string, unknown>
              | undefined;
          const summary = (meetingTitle?.summary as string) ?? "Meeting";
          return { title: `Prep: ${summary}`, priority: "high" };
        },
        skippable: true,
      },
    ],
  },
  {
    id: "meeting-followup",
    name: "Meeting Follow-up",
    description: "Summarize meeting, extract action items, create tasks, draft follow-up message",
    triggerPhrases: ["follow up on meeting", "meeting follow-up", "after the meeting", "meeting action items"],
    steps: [
      {
        id: "summarize",
        label: "Summarize meeting",
        toolName: "summarize_conversation",
        buildArgs: (ctx) => ({ conversationId: ctx.params.conversationId ?? ctx.entityId }),
      },
      {
        id: "create-tasks",
        label: "Create action items as tasks",
        toolName: "create_tasks_from_meeting",
        buildArgs: (ctx) => ({ meetingId: ctx.entityId }),
        skippable: true,
      },
      {
        id: "draft-followup",
        label: "Draft follow-up message",
        toolName: "send_email",
        buildArgs: (ctx) => {
          const summary = ctx.stepResults["summarize"]?.summary ?? "";
          return { subject: "Meeting follow-up", body: summary, draft: true };
        },
        skippable: true,
      },
    ],
  },
  {
    id: "sprint-wrapup",
    name: "Sprint Wrap-up",
    description: "Gather completed and open tasks, compute stats, generate sprint summary",
    triggerPhrases: ["sprint wrap-up", "summarize this sprint", "sprint summary", "end of sprint"],
    steps: [
      {
        id: "completed-tasks",
        label: "Gather completed tasks",
        toolName: "list_board_tasks",
        buildArgs: () => ({ status: "done", limit: 50 }),
      },
      {
        id: "open-tasks",
        label: "Gather open tasks",
        toolName: "list_board_tasks",
        buildArgs: () => ({ status: "open", limit: 50 }),
      },
      {
        id: "generate-summary",
        label: "Generate sprint report",
        toolName: "generate_standup",
        buildArgs: (ctx) => ({
          completedTasks: ctx.stepResults["completed-tasks"]?.data,
          openTasks: ctx.stepResults["open-tasks"]?.data,
          type: "sprint_summary",
        }),
      },
    ],
  },
  {
    id: "daily-closeout",
    name: "Daily Close-out",
    description: "Log completed work, flag stale tasks, prep for tomorrow, update standup draft",
    triggerPhrases: ["wrap up my day", "daily close-out", "end of day", "close out today"],
    steps: [
      {
        id: "completed-today",
        label: "Log today's completed work",
        toolName: "list_board_tasks",
        buildArgs: () => ({ status: "done", updatedToday: true, limit: 20 }),
      },
      {
        id: "stale-check",
        label: "Flag stale tasks",
        toolName: "search_board_tasks",
        buildArgs: () => ({ query: "stale:true", limit: 10 }),
        skippable: true,
      },
      {
        id: "tomorrow-prep",
        label: "Prep tomorrow's priorities",
        toolName: "generate_standup",
        buildArgs: (ctx) => ({
          completedTasks: ctx.stepResults["completed-today"]?.data,
          type: "next_day_prep",
        }),
      },
    ],
  },
  {
    id: "handoff-package",
    name: "Handoff Package",
    description: "Gather project context, tasks, decisions, and generate a handoff document",
    triggerPhrases: ["create handoff", "handoff package", "project handoff", "transition document"],
    steps: [
      {
        id: "recall-project",
        label: "Recall project context",
        toolName: "recall_memory",
        buildArgs: (ctx) => ({
          query: ctx.params.projectName ?? "project",
          category: "project",
        }),
      },
      {
        id: "gather-tasks",
        label: "Gather all project tasks",
        toolName: "list_board_tasks",
        buildArgs: () => ({ limit: 100 }),
      },
      {
        id: "gather-decisions",
        label: "Search for key decisions",
        toolName: "search_messages",
        buildArgs: (ctx) => ({
          query: `decision ${ctx.params.projectName ?? ""}`.trim(),
          limit: 10,
        }),
      },
      {
        id: "generate-doc",
        label: "Generate handoff document",
        toolName: "create_google_doc",
        buildArgs: (ctx) => ({
          title: `Handoff: ${ctx.params.projectName ?? "Project"}`,
          content: [
            "# Project Handoff",
            `## Context\n${ctx.stepResults["recall-project"]?.summary ?? "N/A"}`,
            `## Tasks\n${ctx.stepResults["gather-tasks"]?.summary ?? "N/A"}`,
            `## Key Decisions\n${ctx.stepResults["gather-decisions"]?.summary ?? "N/A"}`,
          ].join("\n\n"),
        }),
        skippable: true,
      },
    ],
  },
];

export function listWorkflows(): WorkflowTemplate[] {
  return workflows;
}

export function getWorkflow(id: string): WorkflowTemplate | undefined {
  return workflows.find((w) => w.id === id);
}

export function matchWorkflow(text: string): WorkflowTemplate | undefined {
  const lower = text.toLowerCase();
  return workflows.find((w) =>
    w.triggerPhrases.some((phrase) => lower.includes(phrase)),
  );
}
