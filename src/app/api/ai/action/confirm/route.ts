import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { executeWorkspaceTool } from "@/lib/ai/tools";
import { successResponse } from "@/lib/infra/api/response";

/** Whitelist of allowed tool names — must match the switch cases in executeWorkspaceTool */
const ALLOWED_ACTION_TYPES = new Set([
  "send_email", "search_emails", "list_emails", "get_unread_count",
  "mark_email_read", "get_email", "reply_to_email",
  "create_calendar_event", "list_calendar_events", "update_calendar_event", "delete_calendar_event",
  "create_task", "complete_task", "update_task", "delete_task", "list_tasks", "list_task_lists",
  "search_drive_files", "list_drive_files", "create_google_doc",
  "read_doc", "append_to_doc", "find_replace_in_doc",
  "read_sheet", "write_sheet", "append_to_sheet", "create_spreadsheet", "clear_sheet_range",
  "search_contacts", "save_memory", "create_yoodle_meeting", "propose_action",
]);

const confirmSchema = z.object({
  actionType: z.string().min(1).refine(
    (val) => ALLOWED_ACTION_TYPES.has(val),
    { message: "Unknown action type." }
  ),
  args: z.record(z.string(), z.unknown()),
});

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const body = confirmSchema.parse(await req.json());
  const result = await executeWorkspaceTool(userId, body.actionType, body.args);

  return successResponse(result);
});
