'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ComisionRepartidorDetalle } from '@/components/comision-repartidor-detalle'
import type { ComisionRepartidor } from '@/lib/comision-repartidor-calculo'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/confirm-modal'
import { formatCurrency } from '@/lib/utils'
import type { CierreData } from './types'

type Repartidor = NonNullable<CierreData['comisionesAuto']>['repartidores'][number]

/** Quiénes se muestran: los que tienen comisión, algo pagado o algo por conciliar ese día. */
export const visiblesDeComision = (lista: Repartidor[]): Repartidor[] =>
  lista.filter((r) => r.total > 0 || r.pagado > 0 || (r.revisiones?.length ?? 0) > 0)

/**
 * Comisión de cada repartidor en el día (#499). La cifra la calcula el servidor; aquí solo se
 * ve y, con un toque, se marca pagada (sale de la caja de hoy). El cierre resta lo pagado.
 * Lo pendiente al cerrar no bloquea: se paga con la nómina.
 */
export function ComisionesRepartidores({
  fecha,
  repartidores,
  puedePagar,
  diaCerrado,
  onPagado,
  tipo = 'repartidor',
  mostrarAviso = true,
}: {
  fecha: string
  repartidores: Repartidor[]
  puedePagar: boolean
  diaCerrado: boolean
  onPagado: () => void
  /** #645: el sellador se paga con el mismo bloque; cambia solo el texto de la confirmación. */
  tipo?: 'repartidor' | 'sellador'
  /** #646: «Pagos al personal» muestra un solo aviso para todos los bloques; suelto cada bloque muestra el suyo. */
  mostrarAviso?: boolean
}) {
  const { confirm, modal } = useConfirm()
  const [pagando, setPagando] = useState<string | null>(null)
  // Un mismo toque reintentado (por una falla de red) reusa la clave y no paga dos veces.
  const claves = useRef(new Map<string, string>())

  const visibles = visiblesDeComision(repartidores)
  if (visibles.length === 0) {
    return <p className="text-sm text-muted-foreground" data-testid="comisiones-vacio">Sin comisión de repartidores este día.</p>
  }

  const pagar = async (r: Repartidor) => {
    if (r.revisiones?.length) return
    const ok = await confirm({
      message: `¿Le pagaste ${formatCurrency(r.pendiente)} a ${r.nombre}?`,
      description: `${tipo === 'sellador' ? 'Es su comisión por lo producido hoy (pacas de agua, pacas de hielo y botellones llenados).' : 'Es su comisión por las entregas del día.'} Este dinero sale de la caja. Confírmalo solo si ya se lo diste: queda anotado con tu nombre y la hora.`,
      confirmLabel: 'Sí, ya le pagué',
    })
    if (!ok) return
    const llave = `${r.trabajadorId}|${fecha}|${r.pendiente}`
    const offlineId = claves.current.get(llave) ?? `cp-${crypto.randomUUID()}`
    claves.current.set(llave, offlineId)
    setPagando(r.trabajadorId)
    try {
      const res = await fetch('/api/nomina/dia/pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trabajadorId: r.trabajadorId, fecha, offlineId, montoEsperado: r.pendiente, concepto: tipo === 'sellador' ? 'PRODUCCION' : 'REPARTO' }),
      })
      if (res.ok) {
        claves.current.delete(llave)
        toast.success(`Pagado ${formatCurrency(r.pendiente)} a ${r.nombre}`)
      } else {
        const cuerpo = await res.json().catch(() => null)
        toast.error(cuerpo?.error?.message ?? 'No se pudo registrar el pago')
        if (res.status !== 500) claves.current.delete(llave)
      }
      onPagado()
    } catch {
      toast.error('Sin conexión: el pago no se registró. Vuelve a intentarlo.')
    } finally {
      setPagando(null)
    }
  }

  const esSellador = tipo === 'sellador'
  return (
    <div className="space-y-2" data-testid={esSellador ? 'comisiones-selladores' : 'comisiones-repartidores'}>
      {visibles.map((r) => {
        const porConciliar = !!r.revisiones?.length
        return (
          <div key={r.trabajadorId} className="rounded-xl border border-slate-200 bg-white p-3" data-testid={`comision-${r.trabajadorId}`}>
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${esSellador ? 'bg-violet-100' : 'bg-blue-100'}`}>{esSellador ? '🧴' : '🚚'}</span>
              <div className="min-w-[10rem] flex-1">
                <p className="font-bold text-slate-800">{r.nombre}</p>
                <p className="text-xs text-slate-500">
                  {esSellador ? 'Sellador · comisión por lo producido' : 'Repartidor · comisión por entregas'}
                  {' · '}{porConciliar ? 'subtotal identificado' : 'del día'} {formatCurrency(r.total)}
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-1 pl-12 sm:w-auto sm:flex-col sm:items-end sm:pl-0">
                {r.pagado > 0 && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-800" data-testid="comision-pagado">
                    Pagado {formatCurrency(r.pagado)}
                  </span>
                )}
                {r.pendiente > 0 && !porConciliar && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900" data-testid="comision-pendiente">
                    Pendiente {formatCurrency(r.pendiente)}
                  </span>
                )}
                {porConciliar && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">⚠️ Por conciliar</span>}
              </div>
            </div>
            {r.tarifas && r.fuentes && r.revisiones && <ComisionRepartidorDetalle calculo={r as ComisionRepartidor} />}
            {porConciliar && r.pendiente > 0 && (
              <p className="mt-2 text-xs text-red-800" data-testid="comision-pendiente">Pendiente identificado {formatCurrency(r.pendiente)}. Un administrador debe revisar las entregas antes de pagar.</p>
            )}
            {r.pendiente > 0 && puedePagar && !diaCerrado && !porConciliar && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={pagando === r.trabajadorId} onClick={() => pagar(r)} data-testid={`pagar-comision-${r.trabajadorId}`}>
                  {pagando === r.trabajadorId ? 'Pagando…' : `Pagar ${formatCurrency(r.pendiente)}`}
                </Button>
                <span className="text-[11px] text-slate-500">Sale de la caja de hoy (efectivo)</span>
              </div>
            )}
          </div>
        )
      })}
      {mostrarAviso && visibles.some((r) => r.pendiente > 0 && !r.revisiones?.length) && (
        <p className="text-xs text-amber-800" data-testid="comisiones-aviso-pendiente">
          {avisoPendiente(diaCerrado, puedePagar)}
        </p>
      )}
      {modal}
    </div>
  )
}

/** Texto único del aviso de lo pendiente (también lo usa «Pagos al personal»). */
export function avisoPendiente(diaCerrado: boolean, puedePagar: boolean): string {
  return diaCerrado
    ? 'Lo pendiente no salió de la caja de este día: se paga con la nómina.'
    : puedePagar
      ? 'Si cierras con comisión pendiente, ese dinero no sale de la caja de hoy: se paga con la nómina.'
      : 'Un administrador debe pagar lo pendiente. Si cierras así, se paga con la nómina.'
}
