'use client'

import { useRef, useState } from 'react'
import { clasificarCompromiso } from '@/lib/pedidos-compromiso'
import { DIAS_SEMANA, diaSemanaDeFecha, estadoDia } from '@/lib/negocio-horario'
import type { Pedido } from '../pedidos-client/types'

const ESTADOS_ABIERTOS = ['PENDIENTE', 'EN_RUTA', 'NO_ENTREGADO']

function diaLargo(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))
}

/**
 * #836 F1 — «Cambiar fecha prometida». Solo cambia el compromiso de entrega: no toca la
 * fecha de creación, la entrega real, los importes ni los pagos. Queda historial
 * (quién, cuándo, anterior, nueva y motivo). Aviso, nunca bloqueo, si ya estaba vencido.
 * Maqueta aprobada: docs/agentes/maquetas/836-programacion-entregas/ (pantalla 3).
 */
export function PedidoReprogramar({
  pedido, hoyBogota, onMutado,
}: {
  pedido: Pick<Pedido, 'id' | 'numero' | 'estadoEntrega' | 'fechaEntrega' | 'negocioHorarios'>
  hoyBogota: string
  onMutado: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [fecha, setFecha] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflicto, setConflicto] = useState(false)
  // Un mismo intento reintentado no duplica el cambio (offlineId estable por apertura).
  const intento = useRef<string>('')

  if (!ESTADOS_ABIERTOS.includes(pedido.estadoEntrega)) return null
  const actual = pedido.fechaEntrega ?? null
  // #836 F2: aviso (no bloqueo) si el negocio no atiende el día elegido.
  const diaElegido = fecha ? diaSemanaDeFecha(fecha) : null
  const negocioCierra = diaElegido !== null && estadoDia(pedido.negocioHorarios, diaElegido) === 'cerrado'
  const vencido = clasificarCompromiso({ fechaEntrega: actual, estadoEntrega: pedido.estadoEntrega }, hoyBogota) === 'arrastrado'

  function abrir() {
    intento.current = crypto.randomUUID()
    setFecha(''); setMotivo(''); setError(null); setConflicto(false)
    setAbierto(true)
  }

  async function confirmar() {
    if (!fecha) { setError('Elige la nueva fecha.'); return }
    setGuardando(true); setError(null); setConflicto(false)
    try {
      const res = await fetch(`/api/pedidos/${pedido.id}/reprogramar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          // Mediodía de Bogotá: el día calendario no deriva por zona horaria.
          fechaNueva: new Date(`${fecha}T12:00:00-05:00`).toISOString(),
          motivo: motivo.trim() || undefined,
          offlineId: intento.current,
          fechaAnteriorEsperada: actual,
        }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok || j?.success === false) {
        setConflicto(res.status === 409)
        setError(j?.error?.message ?? 'No se pudo cambiar la fecha. Intenta de nuevo.')
        return
      }
      setAbierto(false)
      onMutado()
    } catch {
      setError('Sin conexión. Puedes reintentar: no se duplicará el cambio.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm" data-testid="pedido-reprogramar">
      {!abierto ? (
        <button type="button" onClick={abrir} data-testid="reprogramar-abrir" className="text-xs font-medium text-blue-600 hover:underline">
          📅 Cambiar fecha prometida…
        </button>
      ) : (
        <div className="space-y-2" data-testid="reprogramar-form">
          <p className="font-semibold">Cambiar fecha de #{pedido.numero}</p>
          <p className="text-xs text-gray-600">
            Fecha actual: {actual ? diaLargo(actual) : 'sin fecha prometida'}. Solo cambia el compromiso de entrega; la creación, los importes y los pagos no se tocan.
          </p>
          <label className="block text-xs font-medium text-gray-700">
            Nueva fecha
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={guardando}
              data-testid="reprogramar-fecha" className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="block text-xs font-medium text-gray-700">
            Motivo (opcional)
            <input type="text" value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} disabled={guardando}
              data-testid="reprogramar-motivo" className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          {negocioCierra && diaElegido !== null && (
            <p className="rounded-md bg-amber-100 px-2 py-1.5 text-xs text-amber-900" data-testid="reprogramar-negocio-cierra">
              Según su horario, el negocio no atiende los {DIAS_SEMANA[diaElegido].toLowerCase()}s. Se puede preparar; confirma para continuar.
            </p>
          )}
          {vencido && (
            <p className="rounded-md bg-amber-100 px-2 py-1.5 text-xs text-amber-900" data-testid="reprogramar-vencido">
              Estaba vencido desde {actual ? diaLargo(actual) : ''}. El incumplimiento queda en el historial.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800" data-testid="reprogramar-error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={confirmar} disabled={guardando} data-testid="reprogramar-confirmar"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
              {guardando ? 'Guardando…' : 'Confirmar cambio'}
            </button>
            {conflicto && (
              <button type="button" onClick={() => { setAbierto(false); onMutado() }} data-testid="reprogramar-ver-actual"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium">
                Ver fecha actual
              </button>
            )}
            <button type="button" onClick={() => setAbierto(false)} disabled={guardando}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
