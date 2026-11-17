'use client'

// #646 (PR B) — «Pagos al personal»: comisiones de repartidores y selladores y «Sueldos que tocan» en una sola sección,
// con el resumen del día (del día / pagado / pendiente). Es solo presentación: la cifra la calcula el servidor y cada
// pago usa el mismo endpoint, la misma confirmación y la misma clave anti-duplicado de siempre.

import { AyudaTermino } from '@/components/ui/ayuda-termino'
import { formatCurrency } from '@/lib/utils'
import { ComisionesRepartidores, avisoPendiente, visiblesDeComision } from './comisiones-repartidores'
import { SueldosQueTocan } from './sueldos-que-tocan'
import type { CierreData } from './types'
import { FechasPagosComision } from './fechas-pagos-comision'

export function resumenPagosPersonal(data: CierreData | null) {
  const repartidores = visiblesDeComision(data?.comisionesAuto?.repartidores ?? [])
  const selladores = visiblesDeComision(data?.comisionesAuto?.selladores ?? [])
  const sueldos = data?.sueldosQueTocan ?? []
  const comisiones = [...repartidores, ...selladores]
  const sueldosPendientes = sueldos.reduce((t, s) => t + s.monto, 0)
  return {
    repartidores, selladores, sueldos,
    hayAlgo: comisiones.length > 0 || sueldos.length > 0,
    delDia: comisiones.reduce((t, r) => t + r.total, 0) + sueldosPendientes,
    pagado: comisiones.reduce((t, r) => t + r.pagado, 0),
    pendiente: comisiones.reduce((t, r) => t + r.pendiente, 0) + sueldosPendientes,
    hayComisionPendiente: comisiones.some((r) => r.pendiente > 0 && !r.revisiones?.length),
  }
}

export function PagosPersonal({ data, fecha, puedePagar, diaCerrado, onPagado }: {
  data: CierreData | null
  fecha: string
  puedePagar: boolean
  diaCerrado: boolean
  onPagado: () => void
}) {
  const r = resumenPagosPersonal(data)
  const conciliacion = data?.conciliacionComisiones
  const pagosCaja = conciliacion?.pagosCaja ?? data?.comisionesAuto?.pagosCaja ?? []
  if (!r.hayAlgo && !pagosCaja.length && !conciliacion?.diferencia) {
    return <p className="text-sm text-muted-foreground" data-testid="pagos-personal-vacio">Sin comisiones ni sueldos este día.</p>
  }
  return (
    <div id="cierre-comisiones" className="space-y-3" data-testid="pagos-personal">
      {r.hayAlgo && <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Resumen de pagos al personal">
        <div className="rounded-xl bg-blue-50 p-3" data-testid="pagos-personal-del-dia">
          <p className="text-xs text-blue-900">Comisiones del día y sueldos que tocan</p>
          <p className="text-xl font-extrabold tabular-nums text-blue-950">{formatCurrency(r.delDia)}</p>
        </div>
        <div className="rounded-xl bg-green-50 p-3" data-testid="pagos-personal-pagado">
          <p className="flex items-center text-xs text-green-900">✅ Comisiones pagadas por este trabajo
            <AyudaTermino texto="Lo registrado como pagado por el trabajo seleccionado. Puede haberse entregado otro día; el efectivo se resta de la caja del día real del pago, no automáticamente de esta fecha de trabajo." />
          </p>
          <p className="text-xl font-extrabold tabular-nums text-green-950">{formatCurrency(r.pagado)}</p>
        </div>
        <div className="rounded-xl bg-amber-50 p-3" data-testid="pagos-personal-pendiente">
          <p className="flex items-center text-xs text-amber-900">⏳ Pendiente
            <AyudaTermino texto="Lo que todavía no se le ha pagado. No resta de la caja hasta que se pague; si cierras así, se paga con la nómina." />
          </p>
          <p className="text-xl font-extrabold tabular-nums text-amber-950">{formatCurrency(r.pendiente)}</p>
        </div>
      </div>}

      <FechasPagosComision pagos={pagosCaja} efectivo={conciliacion?.actual ?? data?.comisionesAuto?.pagadoRepartidores ?? 0}
        sinFechaVerificada={conciliacion?.sinFechaVerificada ?? data?.comisionesAuto?.pagosSinFechaVerificada ?? 0} conciliacion={conciliacion} />

      {r.repartidores.length > 0 && (
        <ComisionesRepartidores fecha={fecha} repartidores={r.repartidores} puedePagar={puedePagar} diaCerrado={diaCerrado} onPagado={onPagado} mostrarAviso={false} />
      )}
      {r.selladores.length > 0 && (
        <ComisionesRepartidores tipo="sellador" fecha={fecha} repartidores={r.selladores} puedePagar={puedePagar} diaCerrado={diaCerrado} onPagado={onPagado} mostrarAviso={false} />
      )}
      {r.sueldos.length > 0 && (
        <SueldosQueTocan sueldos={r.sueldos} puedePagar={puedePagar} diaCerrado={diaCerrado} onPagado={onPagado} />
      )}

      {r.hayComisionPendiente && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="comisiones-aviso-pendiente">
          {avisoPendiente(diaCerrado, puedePagar)}
        </p>
      )}
    </div>
  )
}
