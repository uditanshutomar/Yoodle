export interface ToolResult {
  success: boolean;
  summary: string;
  data?: unknown;
}

export interface WorkflowStep {
  id: string;
  label: string;
  toolName: string;
  buildArgs: (context: WorkflowContext) => Record<string, unknown>;
  skippable?: boolean;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  triggerPhrases: string[];
  steps: WorkflowStep[];
}

export interface WorkflowContext {
  userId: string;
  entityId?: string;
  entityType?: string;
  stepResults: Record<string, ToolResult>;
  params: Record<string, unknown>;
}

export type StepStatus = "pending" | "in_progress" | "done" | "skipped" | "error";

export interface WorkflowState {
  workflowId: string;
  templateId: string;
  title: string;
  currentStepIndex: number;
  steps: Array<{ id: string; label: string; status: StepStatus; error?: string }>;
  context: WorkflowContext;
  status: "running" | "paused" | "completed" | "cancelled";
}
