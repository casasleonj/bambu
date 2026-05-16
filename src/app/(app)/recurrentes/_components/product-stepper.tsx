'use client'

import { useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface ProductStepperProps {
  label: string
  icon: React.ReactNode
  value: number
  onChange: (value: number) => void
  highlight?: boolean
  unit?: string
}

export default function ProductStepper({ label, icon, value, onChange, highlight = false, unit = 'und' }: ProductStepperProps) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const valueRef = useRef(value)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  const clearTimers = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    intervalRef.current = null
    timeoutRef.current = null
  }, [])

  const decrement = useCallback(() => {
    onChange(Math.max(0, valueRef.current - 1))
  }, [onChange])

  const increment = useCallback(() => {
    onChange(valueRef.current + 1)
  }, [onChange])

  const startDecrement = useCallback(() => {
    clearTimers()
    decrement()
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        decrement()
      }, 80)
    }, 400)
  }, [clearTimers, decrement])

  const startIncrement = useCallback(() => {
    clearTimers()
    increment()
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        increment()
      }, 80)
    }, 400)
  }, [clearTimers, increment])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value)
    onChange(isNaN(val) ? 0 : Math.max(0, val))
  }

  return (
    <div className={cn(
      'rounded-xl border p-3 transition-all duration-200',
      highlight
        ? 'border-blue-200 bg-blue-50/50 ring-1 ring-blue-100'
        : 'border-gray-200 bg-white hover:border-gray-300'
    )}>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('flex items-center justify-center w-7 h-7 rounded-lg text-sm', highlight ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500')}>
          {icon}
        </span>
        <span className={cn('text-sm font-medium', highlight ? 'text-blue-900' : 'text-gray-700')}>{label}</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onMouseDown={startDecrement}
          onMouseUp={clearTimers}
          onMouseLeave={clearTimers}
          onTouchStart={startDecrement}
          onTouchEnd={clearTimers}
          disabled={value <= 0}
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition text-lg font-medium select-none"
          aria-label={`Disminuir ${label}`}
        >
          −
        </button>

        <input
          type="number"
          min={0}
          value={value}
          onChange={handleInput}
          className="flex-1 min-w-0 h-9 text-center text-base font-semibold bg-transparent border-0 focus:ring-0 focus:outline-none text-gray-900"
          aria-label={`Cantidad de ${label}`}
        />

        <button
          type="button"
          onMouseDown={startIncrement}
          onMouseUp={clearTimers}
          onMouseLeave={clearTimers}
          onTouchStart={startIncrement}
          onTouchEnd={clearTimers}
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition text-lg font-medium select-none"
          aria-label={`Aumentar ${label}`}
        >
          +
        </button>
      </div>

      <p className="text-[10px] text-gray-400 mt-1 text-center">{unit}</p>
    </div>
  )
}
