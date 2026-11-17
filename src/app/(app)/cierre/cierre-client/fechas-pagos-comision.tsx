'use client'

import { formatCurrency } from '@/lib/utils'
import type { PagoComisionCaja } from '@/lib/comision-pagada'
import type { CierreData } from './types'
import { CorregirDiaCaja } from './corregir-dia-caja'

const dia = (fecha: string) => new Date(`${fecha}T12:00:00-05:00`).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' })
const registro = (fecha: string) => new Date(fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })
const registroFrase = (fecha: string) => registro(fecha).replace(/\.$/, '')

/** Día de trabajo, día del dinero y captura se muestran juntos, sin sumar otra vez los pagos. */
export function FechasPagosComision({ pagos, efectivo, sinFechaVerificada, conciliacion, abierto = false, puedeCorregir = false, onCorregido }: {
  pagos: PagoComisionCaja[]
  efectivo: number
  sinFechaVerificada: number
  conciliacion?: CierreData['conciliacionComisiones']
  /** El reporte imprimible necesita el desglose desplegado, no oculto al imprimir. */
  abierto?: boolean
  /** #834: solo un ADMIN ve «Cambiar el día de caja». */
  puedeCorregir?: boolean
  onCorregido?: () => void
}) {
  const correcciones = conciliacion?.correccionesPosteriores ?? []
  if (!pagos.length && !conciliacion?.diferencia && !correcciones.length) return null
  return (
    <details open={abierto || undefined} className="rounded-xl border border-blue-100 bg-blue-50 p-3" data-testid="comisiones-fechas-caja">
      <summary className="min-h-11 cursor-pointer font-bold text-blue-900">💵 Pagos atribuidos a esta caja · {formatCurrency(efectivo)} en efectivo</summary>
      <div className="mt-2 space-y-3 text-sm">
        {conciliacion && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <p className="font-bold">Cierre histórico conservado</p>
          <p>Comisiones guardadas: {formatCurrency(conciliacion.original)}. Consulta actual de pagos en efectivo: {formatCurrency(conciliacion.actual)}.</p>
          {conciliacion.diferencia !== 0 && <p className="mt-1 font-semibold">Diferencia por conciliar: {formatCurrency(conciliacion.diferencia)}.</p>}
          <p className="mt-1 text-xs">Esta consulta no reemplaza el reporte original ni su conteo de caja.</p>
          {correcciones.length > 0 && <div className="mt-2 space-y-1 border-t border-amber-200 pt-2" data-testid="comisiones-correcciones-posteriores">
            <p className="font-bold">Correcciones de fecha posteriores al cierre</p>
            {correcciones.map((c, i) => <p key={`${c.pagoId}-${i}`} className="text-sm">
              Pago de <b>{formatCurrency(c.monto)}</b> a {c.trabajador}: el día real pasó {c.anterior ? <>del <b>{dia(c.anterior)}</b></> : <>de <b>sin verificar</b></>} al <b>{dia(c.nueva)}</b>.
              {' '}Corregido por {c.por} el {registroFrase(c.at)}. Motivo: {c.motivo}
            </p>)}
            <p className="text-xs font-semibold">Explican la diferencia de este día; no se suman a ninguna cifra.</p>
          </div>}
        </div>}
        {sinFechaVerificada > 0 && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
          {sinFechaVerificada} pago(s) con fecha real sin verificar. Se conserva su día de registro como criterio anterior de caja; no se supone que fue el día trabajado.
        </p>}
        {pagos.map(p => <article key={p.id} className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="font-semibold text-slate-800">{p.nombre} · {formatCurrency(p.monto)} · {p.metodo}</p>
          <p className="mt-1 text-slate-600">Trabajo del {dia(p.fechaTrabajo)}.</p>
          <p className="mt-1 font-medium text-blue-900">Día real del pago: {p.fechaPagoReal ? dia(p.fechaPagoReal) : 'sin verificar'}.</p>
          <p className="mt-1 text-xs text-slate-500">Registrado el {registro(p.registradoAt)}.</p>
          {p.correccion && <p className="mt-1 text-xs font-semibold text-green-800" data-testid={`pago-correccion-${p.id}`}>
            Día real corregido por {p.correccion.por} el {registroFrase(p.correccion.at)}. Motivo: {p.correccion.motivo}
          </p>}
          {p.metodo !== 'EFECTIVO' && <p className="mt-1 text-xs text-green-800">No se descuenta del efectivo.</p>}
          {puedeCorregir && onCorregido && <CorregirDiaCaja pago={p} onCorregido={onCorregido} />}
        </article>)}
      </div>
    </details>
  )
}
