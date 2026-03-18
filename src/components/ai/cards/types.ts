export type CardType =
  | "task"
  | "task_list"
  | "meeting"
  | "person"
  | "data_summary"
  | "draft"
  | "workflow_progress"
  | "diff_preview"
  | "batch_action"
  | "meeting_brief"
  | "meeting_analytics"
  | "meeting_cascade";

export interface BaseCard {
  type: CardType;
}

export interface TaskCardData extends BaseCard {
  type: "task";
  id: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: string;
  assignee?: { id: string; name: string; avatar?: string };
  boardId?: string;
}

export interface TaskListCardData extends BaseCard {
  type: "task_list";
  title?: string;
  tasks: TaskCardData[];
}

export interface MeetingCardData extends BaseCard {
  type: "meeting";
  id: string;
  title: string;
  scheduledAt?: string;
  status: "scheduled" | "live" | "ended" | "cancelled";
  participants?: Array<{ id: string; name: string; avatar?: string }>;
  joinUrl?: string;
}

export interface PersonCardData extends BaseCard {
  type: "person";
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  role?: string;
  status?: string;
}

export interface DataSummaryCardData extends BaseCard {
  type: "data_summary";
  title: string;
  stats: Array<{ label: string; value: number | string; color?: string }>;
}

export interface DraftCardData extends BaseCard {
  type: "draft";
  draftId: string;
  content: string;
  recipient?: string;
  recipientType?: "conversation" | "email";
  actionType: string;
  actionArgs: Record<string, unknown>;
}

export interface WorkflowProgressCardData extends BaseCard {
  type: "workflow_progress";
  workflowId: string;
  title: string;
  steps: Array<{
    label: string;
    status: "pending" | "in_progress" | "done" | "skipped" | "error";
  }>;
}

export interface DiffPreviewCardData extends BaseCard {
  type: "diff_preview";
  actionType: string;
  actionArgs: Record<string, unknown>;
  actionSummary: string;
  fields: Array<{ label: string; value: string }>;
}

export interface BatchActionCardData extends BaseCard {
  type: "batch_action";
  actionType: string;
  actionLabel: string;
  items: Array<{
    id: string;
    title: string;
    subtitle?: string;
    args: Record<string, unknown>;
  }>;
}

export interface MeetingBriefCardData extends BaseCard {
  type: "meeting_brief";
  meetingId: string;
  meetingTitle: string;
  sources: Array<{ type: string; title: string; summary: string }>;
  carryoverItems: Array<{ task: string; fromMeetingTitle: string }>;
  agendaSuggestions: string[];
  docUrl?: string;
}

export interface MeetingAnalyticsCardData extends BaseCard {
  type: "meeting_analytics";
  meetingTitle: string;
  score: number;
  scoreBreakdown: { agendaCoverage: number; decisionDensity: number; actionItemClarity: number; participationBalance: number };
  speakerStats: Array<{ name: string; talkTimePercent: number; sentimentAvg: number }>;
  highlights: Array<{ type: string; text: string }>;
}

export interface MeetingCascadeCardData extends BaseCard {
  type: "meeting_cascade";
  meetingTitle: string;
  steps: Array<{ step: string; status: "done" | "skipped" | "error"; summary: string; undoToken?: string }>;
}

export type CardData =
  | TaskCardData
  | TaskListCardData
  | MeetingCardData
  | PersonCardData
  | DataSummaryCardData
  | DraftCardData
  | WorkflowProgressCardData
  | DiffPreviewCardData
  | BatchActionCardData
  | MeetingBriefCardData
  | MeetingAnalyticsCardData
  | MeetingCascadeCardData;
