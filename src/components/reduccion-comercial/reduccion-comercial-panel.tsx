'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { generateUUID } from '@/lib/uuid'
import { getProductoIconConfig } from '@/lib/producto-iconos'

interface LineaReducible {
  producto: string
  cantPedido: number
  cantEntrega: number
  precio: number
}

interface Reduccion {
  id: string
  producto: string
  cantidadReducida: number
  cantPedidoAntes: number
  cantPedidoDespues: number
  monto: number
  motivo: string
  aceptadoPor: string
  medio: string
  estado: 'PENDIENTE' | 'APLICADA' | 'RECHAZADA'
  solicitadoPor: { nombre: string }
  resueltoPor: { nombre: string } | null
  notaCredito: { numero: string } | null
  totalAntes: number | null
  totalDespues: number | null
}

interface Props {
  pedidoId: string
  lineas: LineaReducible[]
  userRole?: string | null
  /** Pedido cancelado/anulado: solo se muestra el historial. */
  reducible: boolean
  /** Lo que el cliente ya pagó: si bajar el total lo deja por debajo, se avisa antes de enviar. */
  totalPagado: number
  total: number
}

const BADGE: Record<Reduccion['estado'], string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  APLICADA: 'bg-green-100 text-green-800',
  RECHAZADA: 'bg-gray-100 text-gray-700',
}
const TEXTO: Record<Reduccion['estado'], string> = { PENDIENTE: 'Pendiente', APLICADA: 'Aplicada', RECHAZADA: 'Rechazada' }
const MEDIOS = [
  { valor: 'TELEFONO', etiqueta: 'Por teléfono' },
  { valor: 'PRESENCIAL', etiqueta: 'En persona' },
  { valor: 'MENSAJE', etiqueta: 'Por mensaje' },
] as const

const centavos = (n: number) => Math.round(n * 100)

/**
 * Reducción comercial aceptada (#451): «el cliente ya no quiere el resto».
 * Baja lo pedido de una línea (nunca lo entregado), el total, la factura y emite una nota
 * de crédito. La aplica quien tiene el permiso de autorizar reducciones; los demás dejan
 * una solicitud. Detrás de `NEXT_PUBLIC_CIERRE_V2`: quien la monta decide si la muestra.
 */
export function ReduccionComercialPanel({ pedidoId, lineas, userRole, reducible, totalPagado, total }: Props) {
  const puedePedir = reducible && (userRole === 'ADMIN' || userRole === 'ASISTENTE')
  const reducibles = useMemo(() => lineas.filter((l) => l.cantPedido - l.cantEntrega > 0), [lineas])
  const [filas, setFilas] = useState<Reduccion[]>([])
  const [puedeAutorizar, setPuedeAutorizar] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)
  const [version, setVersion] = useState(0)
  const [abierto, setAbierto] = useState(false)
  const [producto, setProducto] = useState(reducibles[0]?.producto ?? '')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [aceptadoPor, setAceptadoPor] = useState('')
  const [medio, setMedio] = useState<(typeof MEDIOS)[number]['valor']>('TELEFONO')
  const [enviando, setEnviando] = useState(false)
  // Una clave por borrador: un reintento no duplica la solicitud.
  const [offlineId, setOfflineId] = useState(() => generateUUID())

  useEffect(() => {
    let cancelado = false
    fetch(`/api/pedidos/${pedidoId}/reducciones-comerciales`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { reducciones?: Reduccion[]; puedeAutorizar?: boolean }) => {
        if (cancelado) return
        setFilas(d.reducciones ?? [])
        setPuedeAutorizar(Boolean(d.puedeAutorizar))
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

  const linea = useMemo(() => reducibles.find((l) => l.producto === producto), [reducibles, producto])
  const maximo = linea ? linea.cantPedido - linea.cantEntrega : 0
  const cantNum = Number(cantidad)
  const cantValida = Number.isInteger(cantNum) && cantNum > 0 && cantNum <= maximo
  const montoC = linea && cantValida ? centavos(linea.precio) * cantNum : 0
  const totalNuevoC = centavos(total) - montoC
  const sobrepago = cantValida && totalNuevoC < centavos(totalPagado)
  const valido = Boolean(linea) && cantValida && !sobrepago && motivo.trim().length >= 3 && aceptadoPor.trim().length >= 2

  const recargar = useCallback(() => {
    setCargando(true)
    setVersion((v) => v + 1)
  }, [])

  async function enviar() {
    if (!valido || enviando) return
    setEnviando(true)
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/reducir-pedido`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producto, cantidadReducida: cantNum, motivo: motivo.trim(), aceptadoPor: aceptadoPor.trim(), medio, offlineId }),
      })
      const data = (await res.json()) as { estado?: string; error?: { message?: string } }
      if (!res.ok) {
        toast.error(data.error?.message ?? 'No se pudo registrar la reducción')
        return
      }
      toast.success(data.estado === 'APLICADA' ? 'Reducción aplicada: el total y la factura se recalcularon' : 'Solicitud enviada: quien autoriza reducciones debe aplicarla')
      setCantidad('')
      setMotivo('')
      setAceptadoPor('')
      setAbierto(false)
      setOfflineId(generateUUID())
      recargar()
    } catch {
      toast.error('Sin conexión: la reducción necesita red. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  async function resolver(id: string, resolucion: 'AUTORIZAR' | 'RECHAZAR') {
    try {
      const res = await fetch(`/api/pedidos/reducciones-comerciales/${id}`, {
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
      toast.success(resolucion === 'AUTORIZAR' ? 'Reducción autorizada y aplicada' : 'Solicitud rechazada')
      recargar()
    } catch {
      toast.error('Sin conexión. Intenta de nuevo.')
    }
  }

  if (!cargando && filas.length === 0 && (!puedePedir || reducibles.length === 0)) return null

  return (
    <div className="rounded-lg border bg-white p-3" data-testid="reduccion-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Reducir el pedido</h3>
        {puedePedir && reducibles.length > 0 && !abierto && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="min-h-11 rounded-lg border px-3 text-sm font-medium text-blue-700"
            data-testid="reduccion-abrir"
          >
            El cliente ya no quiere el resto
          </button>
        )}
      </div>

      {abierto && (
        <div className="mt-3 space-y-3" data-testid="reduccion-form">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-600">
              Producto
              <select
                value={producto}
                onChange={(e) => { setProducto(e.target.value); setCantidad('') }}
                className="mt-1 h-11 w-full rounded-lg border px-2 text-sm"
                data-testid="reduccion-producto"
              >
                {reducibles.map((l) => (
                  <option key={l.producto} value={l.producto}>
                    {getProductoIconConfig(l.producto).label} (faltan {l.cantPedido - l.cantEntrega})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-600">
              Cantidad que deja de pedir
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={maximo}
                step={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="mt-1 h-11 w-full rounded-lg border px-2 text-sm"
                data-testid="reduccion-cantidad"
              />
            </label>
          </div>
          {cantidad !== '' && !cantValida && (
            <p className="text-sm text-red-700" role="alert" data-testid="reduccion-cantidad-error">
              Indica un número entero entre 1 y {maximo}. Lo ya entregado no se puede quitar.
            </p>
          )}
          {linea && cantValida && (
            <p className="text-sm text-gray-700" data-testid="reduccion-efecto">
              El total baja {formatCurrency(montoC / 100)} ({cantNum} × {formatCurrency(linea.precio)}) y queda en {formatCurrency(totalNuevoC / 100)}. Se emite una nota de crédito por ese valor.
            </p>
          )}
          {sobrepago && (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800" role="alert" data-testid="reduccion-sobrepago">
              El cliente ya pagó {formatCurrency(totalPagado)}, más de lo que costaría el pedido. Primero hay que reversar el pago que sobra.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-600">
              ¿Quién lo aceptó? (cliente)
              <input
                type="text"
                value={aceptadoPor}
                onChange={(e) => setAceptadoPor(e.target.value)}
                maxLength={120}
                className="mt-1 h-11 w-full rounded-lg border px-2 text-sm"
                data-testid="reduccion-aceptado-por"
              />
            </label>
            <label className="text-xs text-gray-600">
              ¿Cómo lo dijo?
              <select
                value={medio}
                onChange={(e) => setMedio(e.target.value as (typeof MEDIOS)[number]['valor'])}
                className="mt-1 h-11 w-full rounded-lg border px-2 text-sm"
                data-testid="reduccion-medio"
              >
                {MEDIOS.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-xs text-gray-600">
            Motivo (obligatorio)
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              data-testid="reduccion-motivo"
            />
          </label>
          {!puedeAutorizar && <p className="text-xs text-gray-500">Quien tiene el permiso de autorizar reducciones debe aplicarla antes de que cambie el total.</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setAbierto(false)} className="min-h-11 flex-1 rounded-lg border text-sm">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={!valido || enviando}
              className="min-h-11 flex-1 rounded-lg bg-blue-600 text-sm font-medium text-white disabled:opacity-50"
              data-testid="reduccion-enviar"
            >
              {enviando ? 'Enviando…' : puedeAutorizar ? 'Aplicar' : 'Pedir autorización'}
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
        <ul className="mt-3 space-y-2" data-testid="reduccion-lista">
          {filas.map((c) => (
            <li key={c.id} className="rounded-lg border p-2 text-sm" data-testid="reduccion-item">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {getProductoIconConfig(c.producto).label}: {c.cantPedidoAntes} → {c.cantPedidoDespues} ({formatCurrency(c.monto)})
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[c.estado]}`}>{TEXTO[c.estado]}</span>
              </div>
              <p className="text-xs text-gray-600">
                {c.motivo} · aceptó {c.aceptadoPor} · pidió {c.solicitadoPor.nombre}
                {c.resueltoPor ? ` · resolvió ${c.resueltoPor.nombre}` : ''}
              </p>
              {c.estado === 'APLICADA' && c.totalAntes !== null && c.totalDespues !== null && (
                <p className="text-xs text-gray-600">
                  Total: {formatCurrency(c.totalAntes)} → {formatCurrency(c.totalDespues)}
                  {c.notaCredito ? ` · ${c.notaCredito.numero}` : ''}
                </p>
              )}
              {c.estado === 'PENDIENTE' && puedeAutorizar && (
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => void resolver(c.id, 'AUTORIZAR')} className="min-h-11 flex-1 rounded-lg bg-green-600 text-sm font-medium text-white" data-testid="reduccion-autorizar">
                    Autorizar
                  </button>
                  <button type="button" onClick={() => void resolver(c.id, 'RECHAZAR')} className="min-h-11 flex-1 rounded-lg border text-sm" data-testid="reduccion-rechazar">
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
