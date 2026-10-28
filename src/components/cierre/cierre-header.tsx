'use client'

import { cn } from '@/lib/utils'

interface CierreHeaderProps {
  fecha: string
  totalVentas: number
  status: 'COMPLETO' | 'INCOMPLETO' | null
  embarquesPendientes: number
  paso?: 1 | 2 | 3
}

export default function CierreHeader({ fecha, status, embarquesPendientes, paso = 1 }: CierreHeaderProps) {
  const fechaLabel = new Date(`${fecha}T12:00:00-05:00`).toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Bogota',
  })
  return <header className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold tracking-tight text-slate-800">Cierre del día</h1>
        <p className="mt-1 text-sm text-slate-500">Revisa las ventas y los cobros antes de confirmar.</p></div>
      <p className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-600">{fechaLabel}</p>
    </div>
    <ol aria-label="Etapas del cierre" className="flex gap-5 text-xs">
      {['Revisar', 'Confirmar', 'Registrado'].map((label, index) => <li key={label} aria-current={index + 1 === paso ? 'step' : undefined} className={cn('flex items-center gap-2', index + 1 === paso ? 'font-semibold text-blue-700' : 'text-slate-400')}>
        <span className={cn('grid h-5 w-5 place-items-center rounded-full', index + 1 === paso ? 'bg-blue-600 text-white' : 'bg-slate-100')}>{index + 1}</span>{label}
      </li>)}
    </ol>
    {status === 'INCOMPLETO' && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Hay {embarquesPendientes} embarque(s) pendiente(s). Deben cerrarse antes de confirmar el día.</p>}
  </header>
}
