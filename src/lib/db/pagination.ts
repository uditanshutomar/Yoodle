import { z } from "zod";

/**
 * Default and max pagination values.
 */
export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 50,
  maxLimit: 100,
} as const;

/**
 * Zod schema for pagination query params.
 * Use in API routes: `paginationSchema.parse({ page, limit })`
 */
export const paginationSchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(PAGINATION_DEFAULTS.page),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION_DEFAULTS.maxLimit)
    .default(PAGINATION_DEFAULTS.limit),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

/**
 * Pagination metadata returned with list responses.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Calculate skip value and build pagination metadata.
 *
 * Usage:
 *   const { skip, meta } = paginate({ page: 2, limit: 20 }, totalCount);
 *   const items = await Model.find().skip(skip).limit(meta.limit);
 */
export function paginate(
  params: PaginationParams,
  total: number,
): { skip: number; meta: PaginationMeta } {
  const { page, limit } = params;
  const totalPages = Math.ceil(total / limit) || 1;
  const safePage = Math.min(page, totalPages);
  const skip = (safePage - 1) * limit;

  return {
    skip,
    meta: {
      page: safePage,
      limit,
      total,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1,
    },
  };
}
