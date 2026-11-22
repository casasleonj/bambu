'use client'

import { Input } from '@/components/ui/input'
import { mostrarDiaColombia } from '@/lib/fecha-local'

interface FechaColombiaProps {
  id: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  min?: string
  max?: string
  required?: boolean
  'aria-label'?: string
}

/**
 * Mantiene la selección nativa de fecha (móvil, teclado y accesibilidad)
 * pero muestra siempre DD/MM/AAAA sin depender de la configuración regional
 * del navegador. El valor emitido a los formularios sigue siendo YYYY-MM-DD.
 */
export function FechaColombia({
  id, value, onChange, disabled, min, max, required, 'aria-label': ariaLabel,
}: FechaColombiaProps) {
  return (
    <div className="relative h-10 min-w-[10.5rem] rounded-md focus-within:ring-2 focus-within:ring-ring">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-between rounded-md border border-input bg-background px-3 text-base text-foreground"
      >
        <span className={value ? '' : 'text-muted-foreground'}>{mostrarDiaColombia(value) || 'DD/MM/AAAA'}</span>
        <span aria-hidden="true" className="ml-2 text-muted-foreground">📅</span>
      </div>
      <Input
        id={id}
        type="date"
        value={value}
        onChange={event => onChange(event.target.value)}
        disabled={disabled}
        required={required}
        min={min}
        max={max}
        aria-label={ariaLabel}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  )
}
