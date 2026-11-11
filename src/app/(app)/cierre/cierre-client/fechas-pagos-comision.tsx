'use client'

import { formatCurrency } from '@/lib/utils'
import type { PagoComisionCaja } from '@/lib/comision-pagada'
import type { CierreData } from './types'

const dia = (fecha: string) => new Date(`${fecha}T12:00:00-05:00`).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' })
const registro = (fecha: string) => new Date(fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })

/** Día de trabajo, día del dinero y captura se muestran juntos, sin sumar otra vez los pagos. */
export function FechasPagosComision({ pagos, efectivo, sinFechaVerificada, conciliacion, abierto = false }: {
  pagos: PagoComisionCaja[]
  efectivo: number
  sinFechaVerificada: number
  conciliacion?: CierreData['conciliacionComisiones']
  /** El reporte imprimible necesita el desglose desplegado, no oculto al imprimir. */
  abierto?: boolean
}) {
  if (!pagos.length && !conciliacion?.diferencia) return null
  return (
    <details open={abierto || undefined} className="rounded-xl border border-blue-100 bg-blue-50 p-3" data-testid="comisiones-fechas-caja">
      <summary className="min-h-11 cursor-pointer font-bold text-blue-900">💵 Pagos atribuidos a esta caja · {formatCurrency(efectivo)} en efectivo</summary>
      <div className="mt-2 space-y-3 text-sm">
        {conciliacion && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <p className="font-bold">Cierre histórico conservado</p>
          <p>Comisiones guardadas: {formatCurrency(conciliacion.original)}. Consulta actual de pagos en efectivo: {formatCurrency(conciliacion.actual)}.</p>
          {conciliacion.diferencia !== 0 && <p className="mt-1 font-semibold">Diferencia por conciliar: {formatCurrency(conciliacion.diferencia)}.</p>}
          <p className="mt-1 text-xs">Esta consulta no reemplaza el reporte original ni su conteo de caja.</p>
        </div>}
        {sinFechaVerificada > 0 && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
          {sinFechaVerificada} pago(s) con fecha real sin verificar. Se conserva su día de registro como criterio anterior de caja; no se supone que fue el día trabajado.
        </p>}
        {pagos.map(p => <article key={p.id} className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="font-semibold text-slate-800">{p.nombre} · {formatCurrency(p.monto)} · {p.metodo}</p>
          <p className="mt-1 text-slate-600">Trabajo del {dia(p.fechaTrabajo)}.</p>
          <p className="mt-1 font-medium text-blue-900">Día real del pago: {p.fechaPagoReal ? dia(p.fechaPagoReal) : 'sin verificar'}.</p>
          <p className="mt-1 text-xs text-slate-500">Registrado el {registro(p.registradoAt)}.</p>
          {p.metodo !== 'EFECTIVO' && <p className="mt-1 text-xs text-green-800">No se descuenta del efectivo.</p>}
        </article>)}
      </div>
    </details>
  )
}
