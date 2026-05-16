'use client'

import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Step {
  label: string
  status: 'completo' | 'actual' | 'bloqueado' | 'pendiente'
}

const STATUS_CONFIG: Record<Step['status'], { dot: string; line: string; text: string }> = {
  completo: { dot: 'bg-green-500', line: 'bg-green-500', text: 'text-green-700' },
  actual: { dot: 'bg-blue-500 ring-4 ring-blue-100', line: 'bg-blue-500', text: 'text-blue-700 font-semibold' },
  bloqueado: { dot: 'bg-red-500', line: 'bg-red-300', text: 'text-red-700' },
  pendiente: { dot: 'bg-gray-300', line: 'bg-gray-200', text: 'text-gray-400' },
}

export default function CierreStepIndicator({ steps }: { steps: Step[] }) {
  return (
    <div className="flex items-center justify-between w-full px-2">
      {steps.map((step, i) => {
        const cfg = STATUS_CONFIG[step.status]
        const isLast = i === steps.length - 1
        return (
          <div key={i} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1.5 z-10">
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold transition-colors', cfg.dot)}>
                {step.status === 'completo' ? <Check className="w-4 h-4" /> : step.status === 'bloqueado' ? <X className="w-4 h-4" /> : i + 1}
              </div>
              <span className={cn('text-xs text-center leading-tight max-w-[80px]', cfg.text)}>{step.label}</span>
            </div>
            {!isLast && (
              <div className={cn('flex-1 h-0.5 mx-1 rounded transition-colors', cfg.line)} />
            )}
          </div>
        )
      })}
    </div>
  )
}
