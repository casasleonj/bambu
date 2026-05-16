'use client'

import { ClipboardList, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CierreHeaderProps {
  fecha: string
  totalVentas: number
  status: 'COMPLETO' | 'INCOMPLETO' | null
  embarquesPendientes: number
}

export default function CierreHeader({ fecha, totalVentas, status, embarquesPendientes }: CierreHeaderProps) {
  const fechaLabel = new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList className="w-7 h-7" />
            <h1 className="text-2xl font-bold">Cierre del Día</h1>
          </div>
          <p className="text-blue-100 capitalize text-sm">{fechaLabel}</p>
          <p className="text-blue-200 text-sm mt-2 max-w-lg">
            Revisa los números y cerrá el día. Después no podrás editar pedidos ni embarques.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-blue-200">Total Ventas</div>
          <div className="text-3xl font-bold">${totalVentas.toLocaleString()}</div>
          {status && (
            <div className={cn(
              'mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold',
              status === 'COMPLETO'
                ? 'bg-green-500/20 text-green-200 border border-green-400/30'
                : 'bg-red-500/20 text-red-200 border border-red-400/30'
            )}>
              {status === 'COMPLETO' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Listo para cerrar
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5" />
                  {embarquesPendientes} embarque(s) abierto(s)
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


