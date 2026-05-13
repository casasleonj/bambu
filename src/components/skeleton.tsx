'use client'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
  )
}

interface SkeletonCardProps {
  lines?: number
  hasImage?: boolean
  className?: string
}

export function SkeletonCard({ lines = 3, hasImage = false, className = '' }: SkeletonCardProps) {
  return (
    <div className={`bg-white rounded-xl border border-gray-100 p-4 space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        {hasImage && <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />}
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  )
}

interface SkeletonTableProps {
  rows?: number
  cols?: number
  className?: string
}

export function SkeletonTable({ rows = 5, cols = 4, className = '' }: SkeletonTableProps) {
  return (
    <div className={`bg-white rounded-xl border border-gray-100 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gray-50 px-4 py-3 grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-4 w-20" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="px-4 py-3 grid gap-4 border-t border-gray-50" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((_, colIdx) => (
            <Skeleton key={`${rowIdx}-${colIdx}`} className={`h-3 ${colIdx === 0 ? 'w-full' : colIdx === cols - 1 ? 'w-16 ml-auto' : 'w-24'}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

interface SkeletonStatsProps {
  count?: number
  className?: string
}

export function SkeletonStats({ count = 3, className = '' }: SkeletonStatsProps) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-${count} gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white p-4 rounded-xl border border-gray-100 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
      ))}
    </div>
  )
}

interface SkeletonPageProps {
  hasStats?: boolean
  hasFilters?: boolean
  cardCount?: number
  className?: string
}

export function SkeletonPage({ hasStats = true, hasFilters = true, cardCount = 3, className = '' }: SkeletonPageProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Stats */}
      {hasStats && <SkeletonStats count={3} />}

      {/* Filters */}
      {hasFilters && (
        <div className="bg-white p-4 rounded-xl border border-gray-100 space-y-3">
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      )}

      {/* Cards */}
      <div className="space-y-3">
        {Array.from({ length: cardCount }).map((_, i) => (
          <SkeletonCard key={i} lines={3} />
        ))}
      </div>
    </div>
  )
}
