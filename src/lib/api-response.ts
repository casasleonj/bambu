import { NextResponse } from 'next/server'

interface ApiListResponse<T = unknown> {
  success: true
  data: T[]
  total?: number
  page?: number
  pageSize?: number
  totalPages?: number
}

interface ApiErrorResponse {
  success: false
  error: {
    message: string
    code?: string
    formErrors?: string[]
    fieldErrors?: Record<string, string[]>
  }
}

/**
 * Success response that spreads data keys for backward compatibility.
 * `apiSuccess({ trabajadores })` → `{ success: true, trabajadores: [...] }`
 */
export function apiSuccess<T extends object>(data: T, status = 200): NextResponse<{ success: true } & T> {
  return NextResponse.json({ success: true, ...data }, { status })
}

/**
 * List response with optional pagination metadata.
 * `apiList(items)` → `{ success: true, data: [...] }`
 */
export function apiList<T>(
  items: T[],
  options?: { total?: number; page?: number; pageSize?: number }
): NextResponse<ApiListResponse<T>> {
  const { total, page, pageSize } = options ?? {}
  const body: ApiListResponse<T> = { success: true, data: items }
  if (total !== undefined) {
    body.total = total
    if (page !== undefined && pageSize !== undefined && pageSize > 0) {
      body.page = page
      body.pageSize = pageSize
      body.totalPages = Math.ceil(total / pageSize)
    }
  }
  return NextResponse.json(body)
}

/**
 * Error response with optional validation details.
 * `apiError('Not found', 404)` → `{ success: false, error: { message: 'Not found' } }`
 */
export function apiError(
  message: string,
  status = 500,
  details?: { code?: string; formErrors?: string[]; fieldErrors?: Record<string, string[]> }
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    { success: false, error: { message, ...details } },
    { status }
  )
}
