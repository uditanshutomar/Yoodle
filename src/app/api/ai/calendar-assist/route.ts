import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:ai:calendar-assist");

const baseSchema = z.object({
  field: z.enum(["titles", "attendees", "agenda", "references"]),
});

const titlesSchema = z.object({
  field: z.literal("titles"),
  partial: z.string().min(3).max(200),
});

const attendeesSchema = z.object({
  field: z.literal("attendees"),
  title: z.string().min(1).max(200),
  existingAttendees: z.array(z.string()).default([]),
});

const agendaSchema = z.object({
  field: z.literal("agenda"),
  title: z.string().min(1).max(200),
  attendees: z.array(z.string()).default([]),
});

const referencesSchema = z.object({
  field: z.literal("references"),
  title: z.string().min(1).max(200),
  attendees: z.array(z.string()).default([]),
  agenda: z.string().default(""),
});

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);
  await connectDB();

  const body = await req.json();
  const { field } = baseSchema.parse(body);

  switch (field) {
    case "titles": {
      const input = titlesSchema.parse(body);
      return successResponse(await suggestTitles(userId, input));
    }
    case "attendees": {
      const input = attendeesSchema.parse(body);
      return successResponse(await suggestAttendees(userId, input));
    }
    case "agenda": {
      const input = agendaSchema.parse(body);
      return successResponse(await suggestAgenda(userId, input));
    }
    case "references": {
      const input = referencesSchema.parse(body);
      return successResponse(await suggestReferences(userId, input));
    }
    default:
      throw new BadRequestError("Unknown field type.");
  }
});

async function suggestTitles(_userId: string, _input: z.infer<typeof titlesSchema>) {
  return { suggestions: [], suggestYoodleRoom: false, yoodleRoomReason: "" };
}

async function suggestAttendees(_userId: string, _input: z.infer<typeof attendeesSchema>) {
  return { suggestions: [] };
}

async function suggestAgenda(_userId: string, _input: z.infer<typeof agendaSchema>) {
  return { suggestions: [] };
}

async function suggestReferences(_userId: string, _input: z.infer<typeof referencesSchema>) {
  return { suggestions: [] };
}
