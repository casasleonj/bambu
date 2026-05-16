'use client'

import { cn } from '@/lib/utils'

interface ChipOption {
  value: string
  label: string
  icon?: React.ReactNode
}

interface ChipGroupProps {
  options: ChipOption[]
  value: string
  onChange: (value: string) => void
  label?: string
}

export default function ChipGroup({ options, value, onChange, label }: ChipGroupProps) {
  return (
    <div>
      {label && <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-150 border select-none',
                active
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm scale-[1.02]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              {opt.icon && <span className={active ? 'text-white' : 'text-gray-400'}>{opt.icon}</span>}
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
