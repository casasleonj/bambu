'use client'

// ADR-CORRECCION-MONETARIA-001 D.5 — sección "Cartera": lista de abonos +
// centro de corrección. Solo ADMIN + CONTADOR (gate del proxy vía view:cartera).

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { Modal } from '@/components/modal'
import { generateUUID } from '@/lib/uuid'
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
}

type TipoCobro = 'COBRO_DEL_DIA' | 'CARTERA' | 'MIXTO'

/** #796: cómo se presenta cada tipo de cobro (el pago de la jornada de la entrega no es «cartera»). */
const ETIQUETA_TIPO: Record<TipoCobro, { texto: string; clase: string; ayuda: string }> = {
  COBRO_DEL_DIA: { texto: 'Cobro del día', clase: 'bg-green-100 text-green-800', ayuda: 'Se cobró el mismo día de la entrega. Ya está en las ventas de ese día.' },
  CARTERA: { texto: 'Cartera anterior', clase: 'bg-amber-100 text-amber-800', ayuda: 'Recupera una entrega de un día anterior.' },
  MIXTO: { texto: 'Cartera y día', clase: 'bg-sky-100 text-sky-800', ayuda: 'Cubre una entrega anterior y una del mismo día.' },
}

function EtiquetaTipo({ r }: { r: AbonoRow }) {
  if (!r.tipoCobro) return <span className="text-gray-400">—</span>
  const e = ETIQUETA_TIPO[r.tipoCobro]
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span title={e.ayuda} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${e.clase}`}>{e.texto}</span>
      {r.fechaAproximada && (
        <span
          title="Este pedido figura entregado pero no tiene registro de la entrega; se clasificó por su fecha de creación. Falta conciliar."
          className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-800"
        >
          Fecha aproximada ⓘ
        </span>
      )}
    </span>
  )
}

const TIPOS: { value: string; label: string; hint: string }[] = [
  { value: 'MONTO', label: 'Monto equivocado', hint: 'Se capturó de más. Podés revertir un monto parcial.' },
  { value: 'CLIENTE', label: 'Cliente equivocado', hint: 'El abono se aplicó al cliente que no era.' },
  { value: 'FACTURA', label: 'Factura equivocada', hint: 'El abono se aplicó a la factura que no era.' },
  { value: 'NO_RECIBIDO', label: 'Pago no recibido', hint: 'El dinero nunca entró. Abre un caso de responsabilidad.' },
]

export default function CarteraClient() {
  const [rows, setRows] = useState<AbonoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalNeto, setTotalNeto] = useState(0)
  const [carteraRecuperada, setCarteraRecuperada] = useState<number | null>(null)
  const [cobrosDelDia, setCobrosDelDia] = useState<number | null>(null)
  const [sinClasificar, setSinClasificar] = useState(false)
  const [tipo, setTipo] = useState<'' | 'COBRO_DEL_DIA' | 'CARTERA'>('')
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
      if (tipo) params.set('tipo', tipo)
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
      setCarteraRecuperada(json.totales?.carteraRecuperada ?? null)
      setCobrosDelDia(json.totales?.cobrosDelDia ?? null)
      setSinClasificar(json.totales?.clasificacionDisponible === false)
    } catch {
      setError('No se pudo cargar la lista de abonos.')
    } finally {
      setLoading(false)
    }
  }, [page, estado, tipo, q])

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

      {!loading && !error && !sinClasificar && carteraRecuperada !== null && cobrosDelDia !== null && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="cartera-totales-tipo">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="text-xs text-slate-600">Cartera recuperada (deuda de días anteriores)</div>
            <div className="text-xl font-bold" data-testid="cartera-total-cartera">{formatCurrency(carteraRecuperada)}</div>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2">
            <div className="text-xs text-slate-600">Cobros del día de la venta (ya están en las ventas de ese día)</div>
            <div className="text-xl font-bold" data-testid="cartera-total-dia">{formatCurrency(cobrosDelDia)}</div>
          </div>
        </div>
      )}

      {!loading && !error && sinClasificar && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="cartera-sin-clasificar">
          <span>No se pudo clasificar los cobros. Los abonos se muestran sin tipo; los totales por tipo no están disponibles.</span>
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
        <select
          className="border rounded px-3 py-1.5 text-sm"
          aria-label="Tipo de cobro"
          data-testid="cartera-filtro-tipo"
          value={tipo}
          onChange={(e) => {
            setPage(1)
            setTipo(e.target.value as typeof tipo)
          }}
        >
          <option value="">Tipo: Todos</option>
          <option value="CARTERA">Cartera anterior</option>
          <option value="COBRO_DEL_DIA">Cobro del día</option>
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
              <div className="flex items-center justify-between gap-2"><b>{r.numero}</b><EtiquetaTipo r={r} /></div>
              <div className="mt-1 flex justify-between gap-2"><span>{r.cliente?.nombre ?? '—'} · {r.factura?.numero ?? '—'}</span><b>{formatCurrency(r.montoNeto)}</b></div>
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
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Método</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2 text-right">Neto</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.numero}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.fecha).toLocaleDateString('es-CO')}</td>
                  <td className="px-3 py-2">{r.cliente?.nombre ?? '—'}</td>
                  <td className="px-3 py-2">{r.factura?.numero ?? '—'}</td>
                  <td className="px-3 py-2"><EtiquetaTipo r={r} /></td>
                  <td className="px-3 py-2">{r.metodoPago}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(r.monto)}</td>
                  <td className="px-3 py-2 text-right">
                    {r.corregido ? (
                      <span className="text-amber-700" title={`Revertido ${formatCurrency(r.montoRevertido)}`}>
                        {formatCurrency(r.montoNeto)}
                      </span>
                    ) : (
                      formatCurrency(r.montoNeto)
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
                  <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
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
          abono={corrigiendo}
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

function CorregirModal({
  abono,
  onClose,
  onDone,
}: {
  abono: AbonoRow
  onClose: () => void
  onDone: () => void
}) {
  const [tipo, setTipo] = useState('MONTO')
  const [montoRevertido, setMontoRevertido] = useState('')
  const [motivo, setMotivo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const hint = TIPOS.find((t) => t.value === tipo)?.hint

  async function submit() {
    if (motivo.trim().length === 0) {
      toast.error('El motivo es obligatorio')
      return
    }
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = { tipo, motivo: motivo.trim(), correccionOfflineId: generateUUID() }
      if (tipo === 'MONTO' && montoRevertido) body.montoRevertido = Number(montoRevertido)
      const res = await fetch(`/api/cartera/abonos/${abono.id}/corregir`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
        signal: AbortSignal.timeout(10_000),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error?.message ?? json?.error ?? 'No se pudo aplicar la corrección')
        return
      }
      toast.success(`Corrección ${json.correccion?.numero ?? ''} aplicada`)
      onDone()
    } catch {
      toast.error('Error de red al aplicar la corrección')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Corregir abono ${abono.numero}`} data-testid="corregir-abono-modal">
      <div className="space-y-3 p-1 text-sm">
        <div className="text-gray-600">
          Cliente <b>{abono.cliente?.nombre}</b> · Monto {formatCurrency(abono.monto)} · Neto sin revertir{' '}
          {formatCurrency(abono.montoNeto)}
        </div>

        <label className="block">
          <span className="text-gray-700">Tipo de corrección</span>
          <select className="mt-1 w-full border rounded px-2 py-1.5" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}

        {tipo === 'MONTO' && (
          <label className="block">
            <span className="text-gray-700">Monto a revertir (vacío = todo el neto: {formatCurrency(abono.montoNeto)})</span>
            <input
              type="number"
              min={0}
              max={abono.montoNeto}
              className="mt-1 w-full border rounded px-2 py-1.5"
              value={montoRevertido}
              onChange={(e) => setMontoRevertido(e.target.value)}
            />
          </label>
        )}

        <label className="block">
          <span className="text-gray-700">Motivo (obligatorio)</span>
          <textarea
            className="mt-1 w-full border rounded px-2 py-1.5"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </label>

        <div className="rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
          Esto NO borra el abono original. Registra una reversión trazable (COR-…) y recalcula el saldo del
          pedido y la factura.
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="px-3 py-1.5 rounded border" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button
            className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? 'Aplicando…' : 'Aplicar corrección'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
