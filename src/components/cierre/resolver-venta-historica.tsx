'use client'

import { useEffect, useRef, useState } from 'react'
import type { CierreData } from '@/app/(app)/cierre/cierre-client/types'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type Pendiente = NonNullable<CierreData['ventasPorConciliar']>[number]
type Aplicada = NonNullable<CierreData['conciliacionesVentasAplicadas']>[number]
type Linea = { dia: string; centavos: number; referencia: string }

export function ResolverVentaHistorica({ fecha, pendiente, aplicada, onCambio }: {
  fecha: string; pendiente?: Pendiente; aplicada?: Aplicada; onCambio: () => void
}) {
  const caso = pendiente?.conciliacion
  const pedidoId = pendiente?.pedidoId ?? aplicada?.pedidoId
  const [montos, setMontos] = useState<Record<string, string>>({})
  const [refs, setRefs] = useState<Record<string, string>>({})
  const [confirmado, setConfirmado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const vivo = useRef(true)
  const enCurso = useRef(false)
  useEffect(() => { vivo.current = true; return () => { vivo.current = false } }, [])
  if (!pedidoId || (!caso && !aplicada)) return null
  const dias = caso?.dias ?? []
  const lineas: Linea[] = dias.map(dia => {
    const monto = (montos[dia] ?? '').trim()
    return { dia, centavos: /^\d{1,9}([.,]\d{1,2})?$/.test(monto) ? Math.round(Number(monto.replace(',', '.')) * 100) : -1,
      referencia: (refs[dia] ?? '').trim() }
  })
  const valido = !!caso && confirmado && lineas.length > 0 &&
    lineas.every(l => l.centavos >= 0 && l.referencia.length >= 15 && l.referencia.length <= 500)
  async function enviar(operacion: 'RESOLVER' | 'REVOCAR') {
    if (enCurso.current || !confirmado || (operacion === 'RESOLVER' && !valido)) return
    enCurso.current = true
    setOcupado(true); setError('')
    try {
      const r = await fetch('/api/cierre/conciliacion-ventas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, pedidoId, huella: caso?.huella ?? aplicada?.huella,
          revisionEsperada: caso ? caso.revision : aplicada?.revision ?? null,
          operacion, lineas: operacion === 'RESOLVER' ? lineas : [], confirmoEvidencia: true }),
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error?.message ?? 'No se pudo registrar la conciliación.')
      if (vivo.current) { setConfirmado(false); onCambio() }
    } catch (e) {
      if (vivo.current) setError(e instanceof Error ? e.message : 'No se pudo registrar la conciliación.')
    } finally { enCurso.current = false; if (vivo.current) setOcupado(false) }
  }
  return <details className="mt-2 rounded-lg border bg-white p-3 text-sm text-slate-800">
    <summary className="cursor-pointer font-semibold">{aplicada ? 'Retirar conciliación' : 'Conciliar venta anterior'}</summary>
    <div className="mt-3 space-y-3">
      {caso && <>
        <p>Registra únicamente el valor de esta venta que realmente quedó reconocido en cada día anterior. Consulta el reporte original. Cero solo si verificaste que no se reconoció. No copies el importe de la nota crédito ni de los pagos.</p>
        {dias.map(dia => <fieldset key={dia} className="space-y-2 rounded border p-2">
          <legend className="font-semibold">{dia}</legend>
          <label className="block">Valor reconocido ({dia})<input className="mt-1 block min-h-11 w-full rounded border px-2" inputMode="decimal" placeholder="COP" value={montos[dia] ?? ''} onChange={e => setMontos(m => ({ ...m, [dia]: e.target.value }))} /></label>
          <label className="block">Referencia documental ({dia})<textarea className="mt-1 block w-full rounded border p-2" rows={2} maxLength={500} placeholder="Identificador del reporte, fila y motivo de la atribución" value={refs[dia] ?? ''} onChange={e => setRefs(m => ({ ...m, [dia]: e.target.value }))} /></label>
        </fieldset>)}
      </>}
      {aplicada && <p>Retirar esta conciliación no cambia el pedido ni el reporte anterior; vuelve a dejar pendiente el cierre de esta fecha.</p>}
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} />{aplicada ? 'Confirmo que quiero volver a dejar pendiente esta revisión.' : 'Verifiqué los importes y sus referencias documentales.'}</label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <Button type="button" disabled={ocupado || (aplicada ? !confirmado : !valido)} onClick={() => void enviar(aplicada ? 'REVOCAR' : 'RESOLVER')}>{ocupado ? 'Guardando…' : aplicada ? 'Retirar y dejar pendiente' : 'Registrar conciliación'}</Button>
    </div>
  </details>
}

export function ConciliacionesVentasAplicadas({ data, onCambio }: { data: CierreData; onCambio?: () => void }) {
  if (!data.conciliacionesVentasAplicadas?.length) return null
  return <div className="rounded-lg border p-3 text-sm" data-testid="cierre-conciliaciones-aplicadas">
    <p className="font-semibold">Conciliaciones de ventas anteriores</p>
    {data.conciliacionesVentasAplicadas.map(a => <div key={a.revision} className="mt-2 border-t pt-2">
      <p className="text-slate-600">Revisión {a.revision.slice(0, 12)}</p>
      {a.lineas.map(l => <p key={l.dia}>{l.dia}: <b>{formatCurrency(l.centavos / 100)}</b> · {l.referencia}</p>)}
      {onCambio && <ResolverVentaHistorica fecha={data.fecha} aplicada={a} onCambio={onCambio} />}
    </div>)}
  </div>
}
