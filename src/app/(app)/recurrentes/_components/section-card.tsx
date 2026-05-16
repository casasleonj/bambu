'use client'

import { cn } from '@/lib/utils'

interface SectionCardProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  className?: string
}

export default function SectionCard({ title, icon, children, className }: SectionCardProps) {
  return (
    <div className={cn('bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50/80 border-b border-gray-100">
        <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-white border border-gray-200 text-gray-500">
          {icon}
        </span>
        <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  )
}
