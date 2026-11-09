'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { generateUUID } from '@/lib/uuid'
import { dayInBogota } from '@/lib/date-helpers'

interface Props {
  pagoId: string
  /** Fecha efectiva actual (`ocurridoAt ?? registro`), ISO. */
  fechaEfectiva: string
  /** Fecha de REGISTRO del pago, ISO: el cobro no puede ser posterior a ese día. */
  fechaRegistro: string
  /** Se llama tras guardar para que el detalle vuelva a leer los pagos. */
  onCorregida: () => void
}

const fmtDia = (dia: string) => new Date(`${dia}T12:00:00-05:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * #617 — Corregir la fecha EFECTIVA de un cobro (solo ADMIN; quien lo monta decide si lo muestra).
 * Motivo obligatorio y una confirmación antes de guardar. No cambia la fecha de registro ni el cierre de caja.
 * Un día ya cerrado no se edita aquí: el servidor responde `DIA_CERRADO` y se remite a la regularización formal (#402).
 */
export function CorregirFechaPago({ pagoId, fechaEfectiva, fechaRegistro, onCorregida }: Props) {
  const diaActual = dayInBogota(new Date(fechaEfectiva))
  const diaRegistro = dayInBogota(new Date(fechaRegistro))
  const [abierto, setAbierto] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [fecha, setFecha] = useState(diaActual)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Una clave por borrador: un reintento no duplica la corrección.
  const [offlineId, setOfflineId] = useState(() => generateUUID())

  const valido = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha !== diaActual && fecha <= diaRegistro && motivo.trim().length >= 3
  const motivoFalta = motivo.trim().length < 3

  function cerrar() {
    setAbierto(false)
    setConfirmando(false)
    setError(null)
    setMotivo('')
    setFecha(diaActual)
  }

  async function guardar() {
    if (!valido || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(`/api/pagos/${pagoId}/corregir-fecha`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, motivo: motivo.trim(), offlineId }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } }
      if (!res.ok) {
        setError(data.error?.message ?? 'No se pudo corregir la fecha del cobro.')
        setConfirmando(false) // el motivo y la fecha se conservan para corregirlos
        return
      }
      toast.success('Fecha del cobro corregida')
      setOfflineId(generateUUID())
      cerrar()
      onCorregida()
    } catch {
      setError('Sin conexión: la corrección de fecha necesita red. Intenta de nuevo.')
      setConfirmando(false)
    } finally {
      setEnviando(false)
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-1 min-h-11 rounded-lg border px-3 text-xs font-medium text-blue-700"
        data-testid="pago-corregir-fecha-abrir"
      >
        Corregir fecha
      </button>
    )
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border bg-gray-50 p-3" data-testid="pago-corregir-fecha-form">
      <p className="text-sm font-semibold text-gray-800">Corregir fecha del cobro</p>
      <p className="text-xs text-gray-600">Fecha actual: {fmtDia(diaActual)}</p>
      <label className="block text-xs text-gray-600">
        Fecha en que realmente se cobró
        <input
          type="date"
          value={fecha}
          max={diaRegistro}
          onChange={(e) => { setFecha(e.target.value); setError(null) }}
          disabled={confirmando || enviando}
          className="mt-1 h-11 w-full rounded-lg border px-2 text-sm"
          data-testid="pago-corregir-fecha-dia"
        />
      </label>
      <label className="block text-xs text-gray-600">
        Motivo (obligatorio)
        <textarea
          value={motivo}
          onChange={(e) => { setMotivo(e.target.value); setError(null) }}
          rows={2}
          maxLength={500}
          disabled={confirmando || enviando}
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          data-testid="pago-corregir-fecha-motivo"
        />
      </label>
      <p className="rounded-lg bg-blue-50 p-2 text-xs text-blue-900">
        <b>Qué cambia y qué no.</b> Cambia la fecha mostrada del cobro. No cambia la fecha de registro ni el cierre de caja.
      </p>
      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-800" role="alert" data-testid="pago-corregir-fecha-error">{error}</p>
      )}
      {confirmando ? (
        <div className="space-y-2 rounded-lg border-[1.5px] border-amber-400 bg-amber-50 p-3" role="alertdialog" aria-label="Confirmar cambio de fecha" data-testid="pago-corregir-fecha-confirmar-bloque">
          <p className="text-sm font-semibold text-amber-900">¿Cambiar la fecha del cobro?</p>
          <p className="text-sm text-amber-900">
            {fmtDia(diaActual)} → {fmtDia(fecha)}. Motivo: «{motivo.trim()}». Queda en el historial con tu nombre y la hora.
            La fecha de registro ({fmtDia(diaRegistro)}) no cambia.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmando(false)} disabled={enviando} className="min-h-11 flex-1 rounded-lg border bg-white text-sm disabled:opacity-50" data-testid="pago-corregir-fecha-volver">
              Volver
            </button>
            <button type="button" onClick={() => void guardar()} disabled={!valido || enviando} className="min-h-11 flex-1 rounded-lg bg-blue-600 text-sm font-medium text-white disabled:opacity-50" data-testid="pago-corregir-fecha-confirmar">
              {enviando ? 'Guardando…' : 'Confirmar cambio'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className="min-h-11 flex-1 rounded-lg border bg-white text-sm" data-testid="pago-corregir-fecha-cancelar">
              Cancelar
            </button>
            <button type="button" onClick={() => setConfirmando(true)} disabled={!valido} className="min-h-11 flex-1 rounded-lg bg-blue-600 text-sm font-medium text-white disabled:opacity-50" data-testid="pago-corregir-fecha-revisar">
              Revisar
            </button>
          </div>
          {motivoFalta && <p className="text-xs text-gray-500" data-testid="pago-corregir-fecha-falta">Falta el motivo.</p>}
        </div>
      )}
    </div>
  )
}
