'use client'

// ADR-PAGO-REPORTADO-CONFIRMADO-001 §3 — cola de confirmación de pagos digitales.
// La ve solo el usuario de `Config.USUARIO_CONFIRMA_PAGOS` (el endpoint 403ea al
// resto). Gated por NEXT_PUBLIC_PAGO_CONFIRMACION en el nav; la página en sí
// también muestra un aviso si el flag está OFF.

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { Modal } from '@/components/modal'
import { useRealtimeListener } from '@/hooks/use-realtime-listener'

const FLAG_ON = process.env.NEXT_PUBLIC_PAGO_CONFIRMACION === 'true'

interface PagoRow {
  id: string
  monto: number
  metodo: string
  createdAt: string
  pedido: {
    id: string
    numero: number
    total: number
    cliente: { id: string; nombre: string; apellido: string | null; telefono: string } | null
  }
}

export default function PagosConfirmarClient() {
  const [rows, setRows] = useState<PagoRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [montoPendiente, setMontoPendiente] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [confirmando, setConfirmando] = useState<PagoRow | null>(null)

  const seqRef = useRef(0)

  const load = useCallback(async () => {
    const seq = ++seqRef.current
    try {
      const res = await fetch(`/api/pagos/por-confirmar?page=${page}&pageSize=50`, {
        credentials: 'include',
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      })
      if (seq !== seqRef.current) return // respuesta stale — descartar
      if (res.status === 403) {
        setError('Solo el usuario designado para confirmar pagos puede ver esta cola.')
        setRows([])
        setLoaded(true)
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (seq !== seqRef.current) return
      setRows(json.data ?? [])
      setMontoPendiente(json.totales?.montoPendiente ?? 0)
      setTotalCount(json.totales?.count ?? json.total ?? 0)
      setTotalPages(json.totalPages ?? 1)
      setError(null)
      setLoaded(true)
    } catch {
      if (seq !== seqRef.current) return
      // Refetch en background: si ya había datos, NO los borramos — solo un toast.
      if (loaded && rows.length > 0) {
        toast.error('No se pudo refrescar la cola (se muestran los últimos datos)')
      } else {
        setError('No se pudo cargar la cola de pagos.')
        setLoaded(true)
      }
    }
  }, [page, loaded, rows.length])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // `pago.*` se emite por cada pago de fiado del sistema → debounce alto para no
  // recargar la tabla constantemente.
  useRealtimeListener(['pago.*'], () => {
    load()
  }, { debounceMs: 4000 })

  if (!FLAG_ON) {
    return (
      <div className="p-4">
        <div className="rounded bg-gray-50 border p-4 text-sm text-gray-600">
          La confirmación de pagos no está habilitada. Configurá{' '}
          <code>NEXT_PUBLIC_PAGO_CONFIRMACION=true</code> para activarla.
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4" data-testid="pagos-confirmar-page">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-semibold">Pagos por confirmar</h1>
        <div className="text-sm text-gray-600">
          {totalCount} pendiente{totalCount === 1 ? '' : 's'} · a verificar: <b>{formatCurrency(montoPendiente)}</b>
        </div>
      </div>

      <p className="text-xs text-gray-500 max-w-2xl">
        Estos pagos digitales (Nequi / transferencia / Daviplata) fueron <b>reportados</b> pero nadie
        verificó todavía que el dinero entró. Confirmá los que ya viste en la cuenta; marcá como
        discrepancia los que no aparecen (se abre un caso de responsabilidad, no se borra el pago).
      </p>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {!loaded && !error && <div className="text-sm text-gray-500">Cargando…</div>}

      {loaded && !error && (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Pedido</th>
                <th className="px-3 py-2">Método</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-3 py-2">{r.pedido.cliente?.nombre ?? '—'}</td>
                  <td className="px-3 py-2">
                    <a href={`/pedidos?openPedido=${r.pedido.id}`} className="text-blue-600 hover:underline">
                      #{r.pedido.numero}
                    </a>
                  </td>
                  <td className="px-3 py-2">{r.metodo}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatCurrency(r.monto)}</td>
                  <td className="px-3 py-2 text-right">
                    <button className="text-blue-600 hover:underline" onClick={() => setConfirmando(r)}>
                      Revisar
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                    Nada pendiente. 🎉
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {loaded && !error && totalPages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <button className="border rounded px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ←
          </button>
          <span>{page} / {totalPages}</span>
          <button
            className="border rounded px-2 py-1 disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </button>
        </div>
      )}

      {confirmando && (
        <ConfirmarModal
          pago={confirmando}
          onClose={() => setConfirmando(null)}
          onDone={() => {
            setConfirmando(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function ConfirmarModal({
  pago,
  onClose,
  onDone,
}: {
  pago: PagoRow
  onClose: () => void
  onDone: () => void
}) {
  const [nota, setNota] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function enviar(resultado: 'CONFIRMADO' | 'DISCREPANTE') {
    if (resultado === 'DISCREPANTE' && nota.trim().length === 0) {
      toast.error('La nota es obligatoria para marcar una discrepancia')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/pagos/${pago.id}/confirmar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ resultado, ...(nota.trim() ? { nota: nota.trim() } : {}) }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error?.message ?? json?.error ?? 'No se pudo registrar')
        return
      }
      toast.success(resultado === 'CONFIRMADO' ? 'Pago confirmado' : 'Discrepancia registrada (caso abierto)')
      onDone()
    } catch {
      toast.error('Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Revisar pago — pedido #${pago.pedido.numero}`} data-testid="confirmar-pago-modal">
      <div className="space-y-3 p-1 text-sm">
        <div className="text-gray-600">
          {pago.pedido.cliente?.nombre} · {pago.metodo} · <b>{formatCurrency(pago.monto)}</b>
        </div>

        <label className="block">
          <span className="text-gray-700">Nota (obligatoria si hay discrepancia)</span>
          <textarea
            className="mt-1 w-full border rounded px-2 py-1.5"
            rows={3}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej.: 'aparece en Nequi a las 14:32' / 'no llegó nada a la cuenta'"
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button className="px-3 py-1.5 rounded border" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button
            className="px-3 py-1.5 rounded bg-amber-600 text-white disabled:opacity-50"
            onClick={() => enviar('DISCREPANTE')}
            disabled={submitting}
          >
            No llegó (discrepancia)
          </button>
          <button
            className="px-3 py-1.5 rounded bg-green-600 text-white disabled:opacity-50"
            onClick={() => enviar('CONFIRMADO')}
            disabled={submitting}
          >
            Confirmar
          </button>
        </div>
      </div>
    </Modal>
  )
}
