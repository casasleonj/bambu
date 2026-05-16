'use client'

import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ValidationItem {
  label: string
  ok: boolean
  optional?: boolean
  detail?: string
}

export default function CierreValidationList({ items }: { items: ValidationItem[] }) {
  const blocking = items.filter(i => !i.ok && !i.optional)
  const warnings = items.filter(i => !i.ok && i.optional)
  const passed = items.filter(i => i.ok)

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div
          key={i}
          className={cn(
            'flex items-start gap-3 p-3 rounded-lg border',
            item.ok
              ? 'bg-green-50 border-green-200'
              : item.optional
                ? 'bg-amber-50 border-amber-200'
                : 'bg-red-50 border-red-200'
          )}
        >
          {item.ok ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          ) : item.optional ? (
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <div className={cn(
              'text-sm font-medium',
              item.ok ? 'text-green-800' : item.optional ? 'text-amber-800' : 'text-red-800'
            )}>
              {item.label}
            </div>
            {item.detail && (
              <div className="text-xs text-muted-foreground mt-0.5">{item.detail}</div>
            )}
          </div>
        </div>
      ))}

      {/* Summary */}
      {blocking.length > 0 && (
        <div className="mt-3 p-3 bg-red-100 border border-red-300 rounded-lg text-center">
          <p className="text-sm font-semibold text-red-800">
            {blocking.length} requisito(s) pendiente(s) — no puedes cerrar aún
          </p>
        </div>
      )}
      {blocking.length === 0 && warnings.length > 0 && (
        <div className="mt-3 p-3 bg-amber-100 border border-amber-300 rounded-lg text-center">
          <p className="text-sm font-semibold text-amber-800">
            {warnings.length} advertencia(s) — puedes cerrar pero revisa primero
          </p>
        </div>
      )}
      {blocking.length === 0 && warnings.length === 0 && passed.length > 0 && (
        <div className="mt-3 p-3 bg-green-100 border border-green-300 rounded-lg text-center">
          <p className="text-sm font-semibold text-green-800">
            Todo listo — puedes cerrar el día
          </p>
        </div>
      )}
    </div>
  )
}
