'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/confirm-modal'
import { formatCurrency } from '@/lib/utils'
import type { CierreData } from './types'

type Sueldo = NonNullable<CierreData['sueldosQueTocan']>[number]
type Medio = 'EFECTIVO' | 'NEQUI' | 'TRANSFERENCIA' | 'DAVIPLATA' | 'FUERA_DE_CAJA'

const ETIQUETAS: Record<Medio, string> = {
  EFECTIVO: 'Efectivo de la caja',
  NEQUI: 'Nequi',
  TRANSFERENCIA: 'Transferencia',
  DAVIPLATA: 'Daviplata',
  FUERA_DE_CAJA: 'Por fuera de la caja',
}

const fechaLegible = (f: string) => new Date(`${f}T12:00:00-05:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })

/**
 * «Sueldos que tocan» (#644): sueldos fijos cuya fecha de pago ya llegó y no se han pagado. El monto sale del servidor.
 * Se paga con el medio elegido; solo el efectivo de la caja baja el efectivo del cierre (#641). El sueldo del
 * administrador viene marcado «por fuera de la caja».
 */
export function SueldosQueTocan({
  sueldos, puedePagar, diaCerrado, onPagado,
}: {
  sueldos: Sueldo[]
  puedePagar: boolean
  diaCerrado: boolean
  onPagado: () => void
}) {
  const { confirm, modal } = useConfirm()
  const [pagando, setPagando] = useState<string | null>(null)
  const [medios, setMedios] = useState<Record<string, Medio>>({})

  if (sueldos.length === 0) {
    return <p className="text-sm text-muted-foreground" data-testid="sueldos-vacio">No hay sueldos por pagar hoy.</p>
  }

  const llave = (s: Sueldo) => `${s.trabajadorId}|${s.fecha}`
  const medioDe = (s: Sueldo): Medio => medios[llave(s)] ?? (s.fueraDeCaja ? 'FUERA_DE_CAJA' : 'EFECTIVO')

  const pagar = async (s: Sueldo) => {
    const medio = medioDe(s)
    const ok = await confirm({
      message: `¿Pagar ${formatCurrency(s.monto)} del sueldo de ${s.nombre}?`,
      description: medio === 'EFECTIVO'
        ? `Corresponde al pago del ${fechaLegible(s.fecha)}. Este dinero sale de la caja. Confírmalo solo si ya se lo diste.`
        : `Corresponde al pago del ${fechaLegible(s.fecha)}. Se paga con ${ETIQUETAS[medio].toLowerCase()}: queda anotado en la nómina y no baja el efectivo de la caja.`,
      confirmLabel: 'Sí, pagar',
    })
    if (!ok) return
    setPagando(llave(s))
    try {
      const res = await fetch('/api/nomina/sueldo/pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trabajadorId: s.trabajadorId, fecha: s.fecha,
          metodo: medio === 'FUERA_DE_CAJA' ? 'EFECTIVO' : medio,
          fueraDeCaja: medio === 'FUERA_DE_CAJA',
        }),
      })
      if (res.ok) {
        toast.success(`Sueldo pagado a ${s.nombre}`)
      } else {
        const cuerpo = await res.json().catch(() => null)
        toast.error(cuerpo?.error?.message ?? 'No se pudo pagar el sueldo')
      }
      onPagado()
    } catch {
      toast.error('Sin conexión: el pago no se registró. Vuelve a intentarlo.')
    } finally {
      setPagando(null)
    }
  }

  return (
    <div className="space-y-2" data-testid="sueldos-que-tocan">
      {sueldos.map((s) => (
        <div key={llave(s)} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3" data-testid={`sueldo-${s.trabajadorId}-${s.fecha}`}>
          <div>
            <p className="font-medium">{s.nombre}</p>
            <p className="text-xs text-muted-foreground">Sueldo del {fechaLegible(s.fecha)} · {formatCurrency(s.monto)}</p>
          </div>
          {puedePagar && !diaCerrado ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={`Con qué se paga a ${s.nombre}`}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={medioDe(s)}
                onChange={(e) => setMedios({ ...medios, [llave(s)]: e.target.value as Medio })}
                data-testid={`sueldo-medio-${s.trabajadorId}`}
              >
                {(Object.keys(ETIQUETAS) as Medio[]).map((m) => <option key={m} value={m}>{ETIQUETAS[m]}</option>)}
              </select>
              <Button size="sm" disabled={pagando === llave(s)} onClick={() => pagar(s)} data-testid={`pagar-sueldo-${s.trabajadorId}`}>
                {pagando === llave(s) ? 'Pagando…' : `Pagar ${formatCurrency(s.monto)}`}
              </Button>
            </div>
          ) : (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Pendiente</span>
          )}
        </div>
      ))}
      {modal}
    </div>
  )
}
