'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { generateUUID } from '@/lib/uuid'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { esPrecioRaro } from '@/modules/pedidos/domain/services/correccion-precio.service'

interface LineaCorregible {
  producto: string
  cantPedido: number
  precio: number
}

interface Correccion {
  id: string
  producto: string
  precioAnterior: number
  precioNuevo: number
  delta: number
  precioRaro: boolean
  motivo: string
  estado: 'PENDIENTE' | 'APLICADA' | 'RECHAZADA'
  solicitadoAt: string
  solicitadoPor: { nombre: string }
  resueltoPor: { nombre: string } | null
  notaResolucion: string | null
  totalAntes: number | null
  totalDespues: number | null
}

interface Props {
  pedidoId: string
  lineas: LineaCorregible[]
  userRole?: string | null
  /** Pedido cancelado/anulado: solo se muestra el historial. */
  corregible: boolean
}

const BADGE: Record<Correccion['estado'], string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  APLICADA: 'bg-green-100 text-green-800',
  RECHAZADA: 'bg-gray-100 text-gray-700',
}
const TEXTO: Record<Correccion['estado'], string> = { PENDIENTE: 'Pendiente', APLICADA: 'Aplicada', RECHAZADA: 'Rechazada' }

/**
 * Corrección de precio de una línea (ADR-MONETARIO-002 §1, ADR-CIERRE-004).
 * ADMIN y ASISTENTE la piden; la aplica un ADMIN (en el acto si la pide él).
 * Detrás de `NEXT_PUBLIC_CIERRE_V2`: quien la monta decide si la muestra.
 */
export function CorreccionPrecioPanel({ pedidoId, lineas, userRole, corregible }: Props) {
  const esAdmin = userRole === 'ADMIN'
  const puedePedir = corregible && (esAdmin || userRole === 'ASISTENTE')
  const [filas, setFilas] = useState<Correccion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)
  const [version, setVersion] = useState(0)
  const [abierto, setAbierto] = useState(false)
  const [producto, setProducto] = useState(lineas[0]?.producto ?? '')
  const [precio, setPrecio] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  // Una clave por borrador: un reintento no duplica la solicitud.
  const [offlineId, setOfflineId] = useState(() => generateUUID())

  useEffect(() => {
    let cancelado = false
    fetch(`/api/pedidos/${pedidoId}/correcciones-precio`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { data?: { correcciones?: Correccion[] }; correcciones?: Correccion[] }) => {
        if (cancelado) return
        setFilas(d.data?.correcciones ?? d.correcciones ?? [])
        setError(false)
        setCargando(false)
      })
      .catch(() => {
        if (cancelado) return
        setError(true)
        setCargando(false)
      })
    return () => {
      cancelado = true
    }
  }, [pedidoId, version])

  const linea = useMemo(() => lineas.find((l) => l.producto === producto), [lineas, producto])
  const precioNum = Number(precio)
  const raro = precioNum > 0 && esPrecioRaro(producto, precioNum)
  const nuevoTotalDelta = linea && precioNum > 0 ? (precioNum - linea.precio) * linea.cantPedido : 0
  const valido = Boolean(linea) && precioNum > 0 && precioNum !== linea?.precio && motivo.trim().length >= 3

  const recargar = useCallback(() => {
    setCargando(true)
    setVersion((v) => v + 1)
  }, [])

  async function enviar() {
    if (!valido || enviando) return
    setEnviando(true)
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/corregir-precio`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producto, precioNuevo: precioNum, motivo: motivo.trim(), offlineId }),
      })
      const data = (await res.json()) as { data?: { estado?: string }; estado?: string; error?: { message?: string } }
      if (!res.ok) {
        toast.error(data.error?.message ?? 'No se pudo corregir el precio')
        return
      }
      const estado = data.data?.estado ?? data.estado
      toast.success(estado === 'APLICADA' ? 'Precio corregido: el total se recalculó' : 'Solicitud enviada: un administrador debe autorizarla')
      setPrecio('')
      setMotivo('')
      setAbierto(false)
      setOfflineId(generateUUID())
      recargar()
    } catch {
      toast.error('Sin conexión: la corrección de precio necesita red. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  async function resolver(id: string, resolucion: 'AUTORIZAR' | 'RECHAZAR') {
    try {
      const res = await fetch(`/api/pedidos/correcciones-precio/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolucion }),
      })
      const data = (await res.json()) as { error?: { message?: string } }
      if (!res.ok) {
        toast.error(data.error?.message ?? 'No se pudo resolver la solicitud')
        return
      }
      toast.success(resolucion === 'AUTORIZAR' ? 'Corrección autorizada y aplicada' : 'Solicitud rechazada')
      recargar()
    } catch {
      toast.error('Sin conexión. Intenta de nuevo.')
    }
  }

  if (!puedePedir && !cargando && filas.length === 0) return null

  return (
    <div className="rounded-lg border bg-white p-3" data-testid="correccion-precio-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Corrección de precio</h3>
        {puedePedir && !abierto && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="min-h-11 rounded-lg border px-3 text-sm font-medium text-blue-700"
            data-testid="correccion-abrir"
          >
            Corregir precio
          </button>
        )}
      </div>

      {abierto && (
        <div className="mt-3 space-y-3" data-testid="correccion-form">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-600">
              Producto
              <select
                value={producto}
                onChange={(e) => setProducto(e.target.value)}
                className="mt-1 h-11 w-full rounded-lg border px-2 text-sm"
                data-testid="correccion-producto"
              >
                {lineas.map((l) => (
                  <option key={l.producto} value={l.producto}>
                    {getProductoIconConfig(l.producto).label} ({formatCurrency(l.precio)} c/u)
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-600">
              Precio nuevo (c/u)
              <input
                type="number"
                inputMode="decimal"
                min={1}
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                className="mt-1 h-11 w-full rounded-lg border px-2 text-sm"
                data-testid="correccion-precio"
              />
            </label>
          </div>
          {linea && precioNum > 0 && precioNum !== linea.precio && (
            <p className="text-sm text-gray-700" data-testid="correccion-efecto">
              El total {nuevoTotalDelta < 0 ? 'baja' : 'sube'} {formatCurrency(Math.abs(nuevoTotalDelta))} ({linea.cantPedido} und).
            </p>
          )}
          {raro && (
            <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900" data-testid="correccion-raro">
              Precio muy bajo: solo un administrador puede aplicarlo.
            </p>
          )}
          <label className="block text-xs text-gray-600">
            Motivo (obligatorio)
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              data-testid="correccion-motivo"
            />
          </label>
          {!esAdmin && <p className="text-xs text-gray-500">Un administrador debe autorizarla antes de que cambie el total.</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setAbierto(false)} className="min-h-11 flex-1 rounded-lg border text-sm">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={!valido || enviando}
              className="min-h-11 flex-1 rounded-lg bg-blue-600 text-sm font-medium text-white disabled:opacity-50"
              data-testid="correccion-enviar"
            >
              {enviando ? 'Enviando…' : esAdmin ? 'Aplicar' : 'Pedir autorización'}
            </button>
          </div>
        </div>
      )}

      {cargando && <p className="mt-2 text-sm text-gray-400">Cargando…</p>}
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          No se pudo cargar el historial.{' '}
          <button type="button" onClick={recargar} className="underline">Reintentar</button>
        </p>
      )}
      {filas.length > 0 && (
        <ul className="mt-3 space-y-2" data-testid="correccion-lista">
          {filas.map((c) => (
            <li key={c.id} className="rounded-lg border p-2 text-sm" data-testid="correccion-item">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {getProductoIconConfig(c.producto).label}: {formatCurrency(c.precioAnterior)} → {formatCurrency(c.precioNuevo)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[c.estado]}`}>{TEXTO[c.estado]}</span>
              </div>
              <p className="text-xs text-gray-600">
                {c.motivo} · pidió {c.solicitadoPor.nombre}
                {c.resueltoPor ? ` · resolvió ${c.resueltoPor.nombre}` : ''}
              </p>
              {c.precioRaro && <p className="text-xs font-medium text-amber-800">Precio muy bajo</p>}
              {c.estado === 'APLICADA' && c.totalAntes !== null && c.totalDespues !== null && (
                <p className="text-xs text-gray-600">Total: {formatCurrency(c.totalAntes)} → {formatCurrency(c.totalDespues)}</p>
              )}
              {c.estado === 'PENDIENTE' && esAdmin && (
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => void resolver(c.id, 'AUTORIZAR')} className="min-h-11 flex-1 rounded-lg bg-green-600 text-sm font-medium text-white" data-testid="correccion-autorizar">
                    Autorizar
                  </button>
                  <button type="button" onClick={() => void resolver(c.id, 'RECHAZAR')} className="min-h-11 flex-1 rounded-lg border text-sm" data-testid="correccion-rechazar">
                    Rechazar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
