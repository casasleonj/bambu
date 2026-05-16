'use client'

import { cn } from '@/lib/utils'

interface TotalBadgeProps {
  total: number
  error?: string
}

export default function TotalBadge({ total, error }: TotalBadgeProps) {
  return (
    <div className={cn(
      'flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-200',
      error
        ? 'bg-red-50 border-red-200'
        : total > 0
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-gray-50 border-gray-200'
    )}>
      <div className="flex items-center gap-2">
        <svg className={cn('w-4 h-4', error ? 'text-red-500' : total > 0 ? 'text-emerald-600' : 'text-gray-400')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <span className={cn('text-sm font-semibold', error ? 'text-red-700' : total > 0 ? 'text-emerald-800' : 'text-gray-500')}>
          Total: {total} {total === 1 ? 'paca' : 'pacas'}
        </span>
      </div>
      {error && (
        <span className="text-xs font-medium text-red-600 animate-shake">{error}</span>
      )}
    </div>
  )
}
