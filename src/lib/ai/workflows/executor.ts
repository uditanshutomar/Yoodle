import { executeWorkspaceTool } from "@/lib/ai/tools";
import { createLogger } from "@/lib/infra/logger";
import type {
  WorkflowTemplate,
  WorkflowContext,
  WorkflowState,
  StepStatus,
} from "./types";

const log = createLogger("workflow-executor");

export async function executeWorkflow(
  template: WorkflowTemplate,
  userId: string,
  params: Record<string, unknown>,
  onProgress?: (state: WorkflowState) => void,
  skipStepIds?: Set<string>,
): Promise<WorkflowState> {
  const context: WorkflowContext = {
    userId,
    entityId: params.entityId as string | undefined,
    entityType: params.entityType as string | undefined,
    stepResults: {},
    params,
  };

  const state: WorkflowState = {
    workflowId: `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    templateId: template.id,
    title: template.name,
    currentStepIndex: 0,
    steps: template.steps.map((s) => ({
      id: s.id,
      label: s.label,
      status: "pending" as StepStatus,
    })),
    context,
    status: "running",
  };

  log.info(
    { workflowId: state.workflowId, templateId: template.id, userId },
    "Workflow started",
  );

  for (let i = 0; i < template.steps.length; i++) {
    const step = template.steps[i];
    state.currentStepIndex = i;

    if (skipStepIds?.has(step.id) && step.skippable) {
      state.steps[i].status = "skipped";
      onProgress?.(structuredClone(state));
      continue;
    }

    state.steps[i].status = "in_progress";
    onProgress?.(structuredClone(state));

    let stepFailed = false;
    try {
      const args = step.buildArgs(context);
      const result = await executeWorkspaceTool(userId, step.toolName, args);

      context.stepResults[step.id] = result;

      if (result.success) {
        state.steps[i].status = "done";
      } else {
        state.steps[i].status = "error";
        state.steps[i].error = result.summary;
        stepFailed = true;
        log.warn(
          { workflowId: state.workflowId, stepId: step.id, error: result.summary },
          "Step failed",
        );
      }
    } catch (err) {
      state.steps[i].status = "error";
      state.steps[i].error =
        err instanceof Error ? err.message : "Unknown error";
      stepFailed = true;
      log.error(
        { err, workflowId: state.workflowId, stepId: step.id },
        "Step threw exception",
      );
    }

    onProgress?.(structuredClone(state));

    // Stop workflow if a non-skippable step failed
    if (stepFailed && !step.skippable) {
      log.warn(
        { workflowId: state.workflowId, stepId: step.id },
        "Non-skippable step failed — aborting workflow",
      );
      break;
    }
  }

  const hasAnyError = state.steps.some((s) => s.status === "error");
  const hasPendingSteps = state.steps.some((s) => s.status === "pending");
  // If we aborted early (non-skippable failure left pending steps), mark as cancelled.
  // Otherwise mark completed — skippable-step errors are tolerated.
  state.status = hasAnyError && hasPendingSteps ? "cancelled" : "completed";
  onProgress?.(structuredClone(state));

  log.info(
    {
      workflowId: state.workflowId,
      steps: state.steps.map((s) => `${s.id}:${s.status}`),
    },
    "Workflow completed",
  );
  return state;
}
