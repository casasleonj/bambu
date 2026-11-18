'use client'

// ADR-CORRECCION-MONETARIA-001 D.5 — sección "Cartera": lista de abonos +
// centro de corrección. Solo ADMIN + CONTADOR (gate del proxy vía view:cartera).

import { useCallback, useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { CorregirModal } from '@/components/cartera/corregir-modal'
import { useRealtimeListener } from '@/hooks/use-realtime-listener'

interface Correccion {
  id: string
  numero: string
  tipo: string
  montoRevertido: number
  motivo: string
  createdAt: string
  autorizadoPor: { nombre: string; apellido: string; username: string } | null
  responsibilityCaseId: string | null
}

interface AbonoRow {
  id: string
  numero: string
  monto: number
  montoRevertido: number
  montoNeto: number
  corregido: boolean
  metodoPago: string
  fecha: string
  cliente: { id: string; nombre: string; apellido: string | null; telefono: string } | null
  factura: { id: string; numero: string } | null
  pedido: { id: string; numero: number; estadoEntrega: string } | null
  correcciones: Correccion[]
  /** #796: null si el cobro no se pudo clasificar. */
  tipoCobro?: TipoCobro | null
  fechaAproximada?: boolean
  /** #796: porción de deuda de jornadas anteriores (lo que Cartera muestra y suma); null si no se pudo clasificar. */
  montoCartera?: number | null
  netoCartera?: number | null
}

type TipoCobro = 'COBRO_DEL_DIA' | 'CARTERA' | 'MIXTO'

/** Importe que Cartera muestra: solo la deuda de jornadas anteriores; el resto del cobro fue venta del día. */
function importeCartera(r: AbonoRow): { monto: number; neto: number; mixto: boolean } {
  const mixto = r.tipoCobro === 'MIXTO' && r.montoCartera != null && r.netoCartera != null
  return mixto ? { monto: r.montoCartera ?? r.monto, neto: r.netoCartera ?? r.montoNeto, mixto } : { monto: r.monto, neto: r.montoNeto, mixto: false }
}

/** #796: esta lista solo trae cobros de cartera (entregas de días anteriores); el cobro del día de la entrega no se lista. */
function Marcas({ r }: { r: AbonoRow }) {
  if (r.tipoCobro !== 'MIXTO' && !r.fechaAproximada) return null
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-1 align-middle">
      {r.tipoCobro === 'MIXTO' && (
        <span title="Este pago cubrió una entrega anterior y una del mismo día. Aquí solo se muestra la parte de la entrega anterior." className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800">Parte de un pago mayor</span>
      )}
      {r.fechaAproximada && (
        <span title="Este pedido figura entregado pero no tiene registro de la entrega; se clasificó por su fecha de creación. Falta conciliar." className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-800">Fecha aproximada ⓘ</span>
      )}
    </span>
  )
}

export default function CarteraClient() {
  const [rows, setRows] = useState<AbonoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalNeto, setTotalNeto] = useState(0)
  const [sinClasificar, setSinClasificar] = useState(false)
  const [estado, setEstado] = useState<'' | 'corregido' | 'sin-corregir'>('')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('') // valor debounced que va al server

  const [corrigiendo, setCorrigiendo] = useState<AbonoRow | null>(null)

  // debounce del texto de búsqueda → param `q` server-side (filtra TODO el set,
  // no solo la página actual).
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      setQ(search.trim())
    }, 350)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' })
      if (estado) params.set('estado', estado)
      if (q) params.set('q', q)
      const res = await fetch(`/api/cartera/abonos?${params}`, {
        credentials: 'include',
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      })
      if (res.status === 403) {
        setError('No tenés permiso para ver la cartera.')
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setRows(json.data ?? [])
      setTotalPages(json.totalPages ?? 1)
      setTotalNeto(json.totales?.totalNeto ?? 0)
      setSinClasificar(json.totales?.clasificacionDisponible === false)
    } catch {
      setError('No se pudo cargar la lista de abonos.')
    } finally {
      setLoading(false)
    }
  }, [page, estado, q])

  useEffect(() => {
    // Fetch de datos al montar / cambiar page-estado-q — side effect de red real,
    // no derivable durante el render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // Otro usuario aplicó una corrección → refrescar (el corregir route emite pago.created).
  useRealtimeListener(['pago.*'], () => {
    load()
  })

  const filtered = rows

  return (
    <div className="p-4 space-y-4" data-testid="cartera-page">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-semibold">Cartera — Abonos</h1>
        <div className="text-sm text-gray-600">
          Total neto (filtro actual): <b>{formatCurrency(totalNeto)}</b>
        </div>
      </div>

      {!loading && !error && sinClasificar && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="cartera-sin-clasificar">
          <span>No se pudo clasificar los cobros. Se muestran todos los abonos, incluidos los que se cobraron el mismo día de la entrega.</span>
          <button className="rounded-lg border border-blue-600 bg-white px-3 py-1 text-xs font-semibold text-blue-700" onClick={() => load()}>Reintentar</button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <input
          className="border rounded px-3 py-1.5 text-sm"
          placeholder="Buscar abono / cliente / factura…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="border rounded px-3 py-1.5 text-sm"
          value={estado}
          onChange={(e) => {
            setPage(1)
            setEstado(e.target.value as typeof estado)
          }}
        >
          <option value="">Todos</option>
          <option value="sin-corregir">Sin corregir</option>
          <option value="corregido">Corregidos</option>
        </select>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {loading && (
        <div className="space-y-2" aria-busy="true" data-testid="cartera-cargando">
          <div className="text-sm text-gray-500">Cargando…</div>
          <div className="h-4 w-3/5 animate-pulse rounded bg-gray-200" />
          <div className="h-4 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-gray-200" />
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-2 md:hidden" data-testid="cartera-tarjetas">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-xl border bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><b>{r.numero}</b><Marcas r={r} /></div>
              <div className="mt-1 flex justify-between gap-2"><span>{r.cliente?.nombre ?? '—'} · {r.factura?.numero ?? '—'}</span><b>{formatCurrency(importeCartera(r).neto)}</b></div>
              {importeCartera(r).mixto && <div className="text-[11px] text-gray-500">de {formatCurrency(r.monto)} cobrados; el resto fue venta del día</div>}
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-gray-500">
                <span>{new Date(r.fecha).toLocaleDateString('es-CO')} · {r.metodoPago}</span>
                <button className="text-sm text-blue-600 hover:underline disabled:text-gray-400" disabled={r.montoNeto <= 0} onClick={() => setCorrigiendo(r)}>Corregir</button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="px-3 py-6 text-center text-gray-500">Sin abonos.</div>}
        </div>
      )}

      {!loading && !error && (
        <div className="hidden overflow-x-auto border rounded md:block">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">Abono</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Factura</th>
                <th className="px-3 py-2">Método</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2 text-right">Neto</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.numero}<Marcas r={r} /></td>
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.fecha).toLocaleDateString('es-CO')}</td>
                  <td className="px-3 py-2">{r.cliente?.nombre ?? '—'}</td>
                  <td className="px-3 py-2">{r.factura?.numero ?? '—'}</td>
                  <td className="px-3 py-2">{r.metodoPago}</td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrency(importeCartera(r).monto)}
                    {importeCartera(r).mixto && <div className="text-[11px] font-normal text-gray-500">de {formatCurrency(r.monto)} cobrados</div>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.corregido ? (
                      <span className="text-amber-700" title={`Revertido ${formatCurrency(r.montoRevertido)}`}>
                        {formatCurrency(importeCartera(r).neto)}
                      </span>
                    ) : (
                      formatCurrency(importeCartera(r).neto)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="text-blue-600 hover:underline disabled:text-gray-400"
                      disabled={r.montoNeto <= 0}
                      onClick={() => setCorrigiendo(r)}
                    >
                      Corregir
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                    Sin abonos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <button className="border rounded px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ←
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            className="border rounded px-2 py-1 disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </button>
        </div>
      )}

      {corrigiendo && (
        <CorregirModal
          titulo={`Corregir abono ${corrigiendo.numero}`}
          contexto={<>Cliente <b>{corrigiendo.cliente?.nombre}</b> · Monto {formatCurrency(corrigiendo.monto)} · Neto sin revertir {formatCurrency(corrigiendo.montoNeto)}</>}
          endpoint={`/api/cartera/abonos/${corrigiendo.id}/corregir`}
          montoMaximo={corrigiendo.montoNeto}
          queNoSeBorra="el abono original"
          testid="corregir-abono-modal"
          onClose={() => setCorrigiendo(null)}
          onDone={() => {
            setCorrigiendo(null)
            load()
          }}
        />
      )}
    </div>
  )
}
