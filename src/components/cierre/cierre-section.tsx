'use client'

import { Check, X, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CierreSectionProps {
  number: number
  title: string
  description: string
  status?: 'completo' | 'actual' | 'bloqueado' | 'pendiente'
  children: React.ReactNode
  className?: string
}

const STATUS_STYLES: Record<string, { badge: string; icon: React.ReactNode; label: string }> = {
  completo: { badge: 'bg-green-100 text-green-700 border-green-200', icon: <Check className="w-3 h-3" />, label: 'Completado' },
  actual: { badge: 'bg-blue-100 text-blue-700 border-blue-200', icon: <Circle className="w-3 h-3 fill-current" />, label: 'En progreso' },
  bloqueado: { badge: 'bg-red-100 text-red-700 border-red-200', icon: <X className="w-3 h-3" />, label: 'Bloqueado' },
  pendiente: { badge: 'bg-gray-100 text-gray-500 border-gray-200', icon: <Circle className="w-3 h-3" />, label: 'Pendiente' },
}

export default function CierreSection({ number, title, description, status, children, className }: CierreSectionProps) {
  const s = status ? STATUS_STYLES[status] : null

  return (
    <section className={cn('bg-white rounded-xl border p-6', className)}>
      <div className="flex items-start gap-4 mb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm shrink-0">
          {number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold">{title}</h2>
            {s && (
              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', s.badge)}>
                <span>{s.icon}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}
