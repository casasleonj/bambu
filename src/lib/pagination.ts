export interface PaginationParams {
  page?: number
  pageSize?: number
  all?: boolean
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasMore: boolean
}

export function getPaginationParams(searchParams: URLSearchParams): PaginationParams {
  const page = searchParams.get('page')
  const pageSize = searchParams.get('pageSize')
  const all = searchParams.get('all') === 'true'
  return {
    page: page ? Math.max(1, parseInt(page)) : 1,
    pageSize: pageSize ? Math.min(100, Math.max(1, parseInt(pageSize))) : 20,
    all: all || false,
  }
}

export function buildPaginationResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / pageSize)
  return {
    data,
    total,
    page,
    pageSize,
    totalPages,
    hasMore: page < totalPages,
  }
}

export function getPrismaPagination(params: PaginationParams): {
  skip?: number
  take?: number
} {
  if (params.all) return {}
  const skip = ((params.page || 1) - 1) * (params.pageSize || 20)
  return {
    skip,
    take: params.pageSize || 20,
  }
}
