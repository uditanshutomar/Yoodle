import { z } from "zod";

// ── Primitive schemas ───────────────────────────────────────────────

export const emailSchema = z
  .string()
  .email("Please enter a valid email address.")
  .transform((v) => v.toLowerCase().trim());

export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid ObjectId format.");

export const meetingCodeSchema = z
  .string()
  .regex(
    /^yoo-[a-z0-9]{3}-[a-z0-9]{3}$/,
    'Meeting code must follow the format "yoo-xxx-xxx".'
  );

// ── Pagination ──────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Parse pagination query params from URLSearchParams.
 * Returns validated { page, limit } with safe defaults.
 */
export function parsePagination(searchParams: URLSearchParams): PaginationInput {
  return paginationSchema.parse({
    page: searchParams.get("page") ?? 1,
    limit: searchParams.get("limit") ?? 20,
  });
}

/**
 * Compute skip value for Mongoose `.skip()` from pagination input.
 */
export function paginationToSkip(pagination: PaginationInput): number {
  return (pagination.page - 1) * pagination.limit;
}
