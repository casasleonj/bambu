'use client'

// ADR-CORRECCION-MONETARIA-001 / -002 — Cuadro de corrección de un cobro. Lo usan Cartera (abonos) y el detalle de la
// factura (abonos y pagos). Un solo cuadro, no dos. Solo ADMIN y CONTADOR llegan aquí (lo decide el servidor).
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { Modal } from '@/components/modal'
import { generateUUID } from '@/lib/uuid'

export const TIPOS_CORRECCION: { value: string; label: string; hint: string }[] = [
  { value: 'MONTO', label: 'Monto equivocado', hint: 'Se capturó de más. Podés revertir un monto parcial.' },
  { value: 'CLIENTE', label: 'Cliente equivocado', hint: 'El cobro se aplicó al cliente que no era.' },
  { value: 'FACTURA', label: 'Factura equivocada', hint: 'El cobro se aplicó a la factura que no era.' },
  { value: 'NO_RECIBIDO', label: 'Pago no recibido', hint: 'El dinero nunca entró. Abre un caso de responsabilidad.' },
]

export interface CorregirModalProps {
  titulo: string
  /** Línea de contexto bajo el título (cliente, monto, lo que queda por revertir). */
  contexto: React.ReactNode
  /** URL del POST: `/api/cartera/abonos/:id/corregir` o `/api/pagos/:id/corregir`. */
  endpoint: string
  /** Lo máximo que se puede revertir (lo no revertido todavía). */
  montoMaximo: number
  /** Qué NO se borra: «el abono original» o «el pago». */
  queNoSeBorra: string
  /** Totales actuales de la factura, para mostrar el «antes → después». */
  factura?: { total: number; montoPagado: number; saldo: number } | null
  testid: string
  onClose: () => void
  onDone: () => void
}

export function CorregirModal({ titulo, contexto, endpoint, montoMaximo, queNoSeBorra, factura, testid, onClose, onDone }: CorregirModalProps) {
  const [tipo, setTipo] = useState('MONTO')
  const [montoRevertido, setMontoRevertido] = useState('')
  const [motivo, setMotivo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // Un id por apertura del cuadro: si el reintento llega después de un error de red con el servidor ya guardado, se deduplica.
  const correccionOfflineId = useRef(generateUUID())
  const hint = TIPOS_CORRECCION.find((t) => t.value === tipo)?.hint

  const aRevertir = tipo === 'MONTO' && montoRevertido ? Math.min(Number(montoRevertido) || 0, montoMaximo) : montoMaximo
  const despues = factura
    ? (() => {
        const pagado = Math.max(0, factura.montoPagado - aRevertir)
        return { pagado, saldo: Math.max(0, factura.total - pagado) }
      })()
    : null

  async function submit() {
    if (submitting) return
    if (motivo.trim().length === 0) {
      setErrorMsg('El motivo es obligatorio.')
      return
    }
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const body: Record<string, unknown> = { tipo, motivo: motivo.trim(), correccionOfflineId: correccionOfflineId.current }
      if (tipo === 'MONTO' && montoRevertido) body.montoRevertido = Number(montoRevertido)
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
        signal: AbortSignal.timeout(10_000),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMsg(`${json?.error?.message ?? json?.error ?? 'No se pudo aplicar la corrección.'} No se cambió nada. Puedes reintentar.`)
        return
      }
      toast.success(`Corrección ${json.correccion?.numero ?? ''} aplicada`)
      onDone()
    } catch {
      setErrorMsg('Error de red al aplicar la corrección. Si ya se registró, al reintentar no se duplica.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={titulo} data-testid={testid}>
      <div className="space-y-3 p-1 text-sm">
        <div className="text-gray-600">{contexto}</div>

        <label className="block">
          <span className="text-gray-700">Tipo de corrección</span>
          <select className="mt-1 w-full border rounded px-2 py-1.5" value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={submitting}>
            {TIPOS_CORRECCION.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}

        {tipo === 'MONTO' && (
          <label className="block">
            <span className="text-gray-700">Monto a revertir (vacío = todo lo no revertido: {formatCurrency(montoMaximo)})</span>
            <input
              type="number" min={0} max={montoMaximo} className="mt-1 w-full border rounded px-2 py-1.5"
              value={montoRevertido} onChange={(e) => setMontoRevertido(e.target.value)} disabled={submitting}
            />
          </label>
        )}

        <label className="block">
          <span className="text-gray-700">Motivo (obligatorio)</span>
          <textarea className="mt-1 w-full border rounded px-2 py-1.5" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={submitting} />
        </label>

        {despues && factura && (
          <div className="rounded bg-slate-50 p-2 text-xs" data-testid="corregir-antes-despues">
            <b>Antes → después</b>
            <div className="mt-1 flex justify-between"><span>Pagado de la factura</span><span>{formatCurrency(factura.montoPagado)} → <b>{formatCurrency(despues.pagado)}</b></span></div>
            <div className="flex justify-between"><span>Saldo de la factura</span><span>{formatCurrency(factura.saldo)} → <b>{formatCurrency(despues.saldo)}</b></span></div>
          </div>
        )}

        <div className="rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
          Esto <b>NO borra</b> {queNoSeBorra}. Registra una reversión trazable (COR-…) y recalcula el saldo del pedido y la factura.
        </div>

        {errorMsg && <div role="alert" data-testid="corregir-error" className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">{errorMsg}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button className="px-3 py-1.5 rounded border" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50" onClick={submit} disabled={submitting} data-testid="corregir-confirmar">
            {submitting ? 'Registrando…' : 'Aplicar corrección'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
