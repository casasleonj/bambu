'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/utils'

interface Detalle {
  id: string
  estado: 'PENDIENTE' | 'AUTORIZADA' | 'RECHAZADA'
  motivoSolicitud: string
  notaSolicitud?: string | null
  solicitadoAt: string
  limiteSnapshot: number
  fiadosAbiertosSnapshot: number
  saldoFiadoSnapshot: number
  operacionSaldoSnapshot: number
  saldoDespuesSnapshot: number
  cliente: { id: string; nombre: string }
  solicitadoPor: { id: string; nombre: string }
  autorizadoPor?: { nombre: string } | null
  autorizadoAt?: string | null
  notaAutorizacion?: string | null
  rechazadoPor?: { nombre: string } | null
  rechazadoAt?: string | null
  notaRechazo?: string | null
}

interface Props {
  excepcionId: string
  onClose: () => void
  /** se llamó a Autorizar/Rechazar con éxito: refrescar el aviso. */
  onResuelta: () => void
}

type Carga = { fase: 'cargando' } | { fase: 'error'; mensaje: string } | { fase: 'ok'; detalle: Detalle; puedeResolver: boolean }

const hora = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * Ventana de decisión de una excepción de crédito (P0-3, PR 2).
 *
 * Muestra lo mismo que vio quien la pidió. Autorizar/Rechazar solo aparecen
 * con el permiso por usuario, pero la autoridad es el PATCH del servidor.
 */
export function ExcepcionCreditoModal({ excepcionId, onClose, onResuelta }: Props) {
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' })
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // reset en render al cambiar de solicitud (sin setState dentro de un efecto)
  const [prevId, setPrevId] = useState(excepcionId)
  if (prevId !== excepcionId) {
    setPrevId(excepcionId)
    setCarga({ fase: 'cargando' })
    setNota('')
    setError(null)
  }

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/pedidos/excepciones-credito/${excepcionId}`)
      if (res.status === 404) return setCarga({ fase: 'error', mensaje: 'Esta solicitud ya no existe o el enlace es viejo.' })
      if (!res.ok) return setCarga({ fase: 'error', mensaje: 'No se pudo cargar la solicitud. Intenta de nuevo.' })
      const data = await res.json()
      setCarga({ fase: 'ok', detalle: data.excepcion as Detalle, puedeResolver: data.puedeResolver === true })
    } catch {
      setCarga({ fase: 'error', mensaje: 'Sin conexión. Revisa tu internet e intenta de nuevo.' })
    }
  }, [excepcionId])

  useEffect(() => {
    const t = setTimeout(() => { void cargar() }, 0)
    return () => clearTimeout(t)
  }, [cargar])

  const resolver = async (resolucion: 'AUTORIZAR' | 'RECHAZAR') => {
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(`/api/pedidos/excepciones-credito/${excepcionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolucion, nota: nota.trim() || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error?.message ?? 'No se pudo guardar la decisión.')
        await cargar() // pudo haberla resuelto otra persona: se muestra el estado real
        return
      }
      onResuelta()
      await cargar()
    } catch {
      setError('Sin conexión: la decisión no se guardó. Reintenta al reconectar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Solicitud de excepción de crédito" data-testid="excepcion-modal">
      <div className="max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
        {carga.fase === 'cargando' && <p className="text-sm text-gray-600" role="status">Cargando solicitud…</p>}
        {carga.fase === 'error' && <p className="text-sm text-red-700" role="alert" data-testid="excepcion-error-carga">{carga.mensaje}</p>}
        {carga.fase === 'ok' && (() => {
          const d = carga.detalle
          return (
            <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="min-w-0 truncate text-base font-bold">Excepción de crédito · {d.cliente.nombre}</h2>
                <span data-testid="excepcion-estado" className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${d.estado === 'AUTORIZADA' ? 'bg-green-100 text-green-800' : d.estado === 'RECHAZADA' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                  {d.estado === 'AUTORIZADA' ? 'Autorizada' : d.estado === 'RECHAZADA' ? 'Rechazada' : 'Pendiente'}
                </span>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm" data-testid="excepcion-datos">
                <dt className="text-gray-500">Límite de fiados</dt><dd className="text-right tabular-nums">{d.limiteSnapshot}</dd>
                <dt className="text-gray-500">Fiados abiertos</dt><dd className="text-right tabular-nums">{d.fiadosAbiertosSnapshot} · {formatCurrency(d.saldoFiadoSnapshot)}</dd>
                <dt className="text-gray-500">Esta venta deja</dt><dd className="text-right tabular-nums">{formatCurrency(d.operacionSaldoSnapshot)}</dd>
                <dt className="text-gray-500">Saldo total después</dt><dd className="text-right tabular-nums">{formatCurrency(d.saldoDespuesSnapshot)}</dd>
                <dt className="text-gray-500">Pidió</dt><dd className="text-right">{d.solicitadoPor.nombre} · {hora(d.solicitadoAt)}</dd>
              </dl>
              <div className="rounded-lg bg-gray-50 p-2 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Motivo</span>
                <p data-testid="excepcion-motivo">{d.motivoSolicitud}</p>
                {d.notaSolicitud && <p className="mt-1 text-gray-600">{d.notaSolicitud}</p>}
              </div>

              {d.estado === 'PENDIENTE' && carga.puedeResolver && (
                <>
                  <label htmlFor="excepcion-nota" className="block text-xs text-gray-600">Nota para quien pidió (opcional)</label>
                  <textarea id="excepcion-nota" data-testid="excepcion-nota" value={nota} onChange={(e) => setNota(e.target.value)} className="min-h-[56px] w-full rounded-lg border border-gray-300 p-2 text-sm" placeholder="Ej.: autorizado hasta este saldo, solo hoy" />
                  <p className="text-xs text-gray-600">Al autorizar, vale hasta {formatCurrency(d.operacionSaldoSnapshot)} y vence hoy a las 11:59 p. m. (hora Bogotá).</p>
                  {error && <p role="alert" data-testid="excepcion-error" className="text-xs text-red-700">{error}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={enviando} onClick={() => void resolver('AUTORIZAR')} data-testid="excepcion-autorizar" className="min-h-[44px] rounded-lg bg-sky-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Autorizar</button>
                    <button type="button" disabled={enviando} onClick={() => void resolver('RECHAZAR')} data-testid="excepcion-rechazar" className="min-h-[44px] rounded-lg border border-red-600 px-4 py-2 font-semibold text-red-700 disabled:opacity-50">Rechazar</button>
                  </div>
                </>
              )}
              {d.estado === 'PENDIENTE' && !carga.puedeResolver && (
                <p className="text-sm text-amber-800" data-testid="excepcion-sin-permiso">Solo las personas autorizadas pueden decidir esta solicitud.</p>
              )}
              {d.estado === 'AUTORIZADA' && (
                <p className="text-sm text-green-800" data-testid="excepcion-resuelta">Autorizada por {d.autorizadoPor?.nombre ?? '—'}{d.autorizadoAt ? ` · ${hora(d.autorizadoAt)}` : ''}.{d.notaAutorizacion ? ` ${d.notaAutorizacion}` : ''}</p>
              )}
              {d.estado === 'RECHAZADA' && (
                <p className="text-sm text-red-800" data-testid="excepcion-resuelta">Rechazada por {d.rechazadoPor?.nombre ?? '—'}{d.rechazadoAt ? ` · ${hora(d.rechazadoAt)}` : ''}.{d.notaRechazo ? ` ${d.notaRechazo}` : ''}</p>
              )}
            </>
          )
        })()}
        <button type="button" onClick={onClose} data-testid="excepcion-cerrar" className="min-h-[44px] w-full rounded-lg border border-gray-300 px-4 py-2 font-semibold sm:w-auto">Cerrar</button>
      </div>
    </div>
  )
}
