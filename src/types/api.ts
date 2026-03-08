export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export type PaginatedApiResponse<T> = ApiSuccessResponse<PaginatedData<T>>;

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface SortQuery {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface SearchQuery {
  q?: string;
}

export type ListQuery = PaginationQuery & SortQuery & SearchQuery;
