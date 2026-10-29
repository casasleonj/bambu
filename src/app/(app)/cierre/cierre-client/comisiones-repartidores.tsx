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
}: {
  fecha: string
  repartidores: Repartidor[]
  puedePagar: boolean
  diaCerrado: boolean
  onPagado: () => void
}) {
  const { confirm, modal } = useConfirm()
  const [pagando, setPagando] = useState<string | null>(null)
  // Un mismo toque reintentado (por una falla de red) reusa la clave y no paga dos veces.
  const claves = useRef(new Map<string, string>())

  const visibles = repartidores.filter((r) => r.total > 0 || r.pagado > 0 || (r.revisiones?.length ?? 0) > 0)
  if (visibles.length === 0) {
    return <p className="text-sm text-muted-foreground" data-testid="comisiones-vacio">Sin comisión de repartidores este día.</p>
  }

  const pagar = async (r: Repartidor) => {
    if (r.revisiones?.length) return
    const ok = await confirm({
      message: `¿Le pagaste ${formatCurrency(r.pendiente)} a ${r.nombre}?`,
      description: 'Es su comisión por las entregas del día. Este dinero sale de la caja. Confírmalo solo si ya se lo diste: queda anotado con tu nombre y la hora.',
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
        body: JSON.stringify({ trabajadorId: r.trabajadorId, fecha, offlineId, montoEsperado: r.pendiente }),
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

  return (
    <div className="space-y-2" data-testid="comisiones-repartidores">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Resumen de comisiones">
        <div className="rounded-md bg-blue-50 p-3"><p className="text-xs text-blue-900">🚚 {visibles.some(r => r.revisiones?.length) ? 'Subtotal identificado' : 'Comisión por entregas'}</p><p className="font-bold text-blue-950">{formatCurrency(visibles.reduce((s, r) => s + r.total, 0))}</p></div>
        <div className="rounded-md bg-green-50 p-3"><p className="text-xs text-green-900">✅ Pagado</p><p className="font-bold text-green-950">{formatCurrency(visibles.reduce((s, r) => s + r.pagado, 0))}</p></div>
        <div className="rounded-md bg-amber-50 p-3"><p className="text-xs text-amber-900">⏳ Pendiente {visibles.some(r => r.revisiones?.length) ? 'identificado' : ''}</p><p className="font-bold text-amber-950">{formatCurrency(visibles.reduce((s, r) => s + r.pendiente, 0))}</p></div>
      </div>
      {visibles.map((r) => (
        <div key={r.trabajadorId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3" data-testid={`comision-${r.trabajadorId}`}>
          <div>
            <p className="font-medium">{r.nombre}</p>
            <p className="text-xs text-muted-foreground">{r.revisiones?.length ? 'Subtotal identificado' : 'Comisión del día'} {formatCurrency(r.total)}</p>
            {!!r.revisiones?.length && <p className="text-sm font-semibold text-amber-900">⚠️ Por conciliar</p>}
            {r.tarifas && r.fuentes && r.revisiones && <ComisionRepartidorDetalle calculo={r as ComisionRepartidor} />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {r.pagado > 0 && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800" data-testid="comision-pagado">
                Pagado {formatCurrency(r.pagado)}
              </span>
            )}
            {r.pendiente > 0 && (
              <>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900" data-testid="comision-pendiente">
                  Pendiente {formatCurrency(r.pendiente)}
                </span>
                {puedePagar && !diaCerrado && !r.revisiones?.length && (
                  <Button size="sm" disabled={pagando === r.trabajadorId} onClick={() => pagar(r)} data-testid={`pagar-comision-${r.trabajadorId}`}>
                    {pagando === r.trabajadorId ? 'Pagando…' : `Pagar ${formatCurrency(r.pendiente)}`}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      ))}
      {visibles.some((r) => r.pendiente > 0 && !r.revisiones?.length) && (
        <p className="text-xs text-amber-800" data-testid="comisiones-aviso-pendiente">
          {diaCerrado
            ? 'Lo pendiente no salió de la caja de este día: se paga con la nómina.'
            : puedePagar
              ? 'Si cierras con comisión pendiente, ese dinero no sale de la caja de hoy: se paga con la nómina.'
              : 'Un administrador debe pagar lo pendiente. Si cierras así, se paga con la nómina.'}
        </p>
      )}
      {modal}
    </div>
  )
}
