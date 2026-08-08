import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/modal'

interface RepartidorDisponible {
  id: string
  nombre: string
}

interface GrupoSinAsignar {
  ruta: string
  pedidosCount: number
  unidades: number
}

interface PreviewChunk {
  pedidoIds: string[]
  rutaId: string | null
  rutaNombre: string
  trabajadorIdPropuesto: string
  unidades: number
  pesoKg: number
}

interface FilaEditable extends PreviewChunk {
  trabajadorId: string
  baseDinero: number
  horaSalida: string
  incluir: boolean
}

interface AutoGenerarPreviewModalProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

function horaActual(): string {
  const now = new Date()
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
}

export function AutoGenerarPreviewModal({ open, onClose, onCreated }: AutoGenerarPreviewModalProps) {
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [filas, setFilas] = useState<FilaEditable[]>([])
  const [gruposSinAsignar, setGruposSinAsignar] = useState<GrupoSinAsignar[]>([])
  const [repartidoresDisponibles, setRepartidoresDisponibles] = useState<RepartidorDisponible[]>([])
  const [maxUnidades, setMaxUnidades] = useState(70)
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null)
  const [fetchSeq, setFetchSeq] = useState(0)

  // Render-time synchronization: al abrir el modal, resetea el estado y
  // dispara una nueva carga vía fetchSeq — sin setState síncrono dentro del
  // body del effect (regla React Compiler set-state-in-effect, mismo patrón
  // que src/components/coords-preview.tsx).
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setLoading(true)
      setEmptyMessage(null)
      setFilas([])
      setGruposSinAsignar([])
      setFetchSeq((s) => s + 1)
    }
  }

  useEffect(() => {
    if (fetchSeq === 0) return
    let cancelled = false
    fetch('/api/embarques/auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ dryRun: true }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (!data.success) {
          toast.error(data.error?.message || 'Error calculando embarques automáticos')
          onClose()
          return
        }
        setMaxUnidades(data.maxUnidades || 70)
        setGruposSinAsignar(data.gruposSinAsignar || [])
        setRepartidoresDisponibles(data.repartidoresDisponibles || [])
        const chunks: PreviewChunk[] = data.chunks || []
        if (chunks.length === 0) {
          setEmptyMessage(data.message || 'No hay pedidos pendientes para embarcar')
        }
        setFilas(
          chunks.map((c) => ({
            ...c,
            trabajadorId: c.trabajadorIdPropuesto,
            baseDinero: 0,
            horaSalida: horaActual(),
            incluir: true,
          }))
        )
      })
      .catch(() => {
        if (cancelled) return
        toast.error('Error de conexión calculando embarques automáticos')
        onClose()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchSeq, onClose])

  function updateFila(idx: number, patch: Partial<FilaEditable>) {
    setFilas((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  }

  const filasIncluidas = filas.filter((f) => f.incluir)
  const puedeConfirmar = filasIncluidas.length > 0 && filasIncluidas.every((f) => f.trabajadorId && f.horaSalida)

  async function handleConfirmar() {
    if (!puedeConfirmar || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/embarques/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          dryRun: false,
          asignaciones: filasIncluidas.map((f) => ({
            pedidoIds: f.pedidoIds,
            trabajadorId: f.trabajadorId,
            baseDinero: f.baseDinero,
            horaSalida: f.horaSalida,
            rutaId: f.rutaId || undefined,
          })),
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(data.message)
        if (data.errores && data.errores.length > 0) {
          for (const err of data.errores) {
            toast.warning(`${err.pedidosCount} pedido(s) no se pudieron embarcar: ${err.error}`, { duration: 8000 })
          }
        }
        onCreated()
        onClose()
      } else {
        toast.error(data.error?.message || 'Error creando embarques automáticos')
      }
    } catch {
      toast.error('Error de conexión creando embarques automáticos')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      <h2 className="text-xl font-bold mb-1">Auto-Generar Embarques</h2>
      <p className="text-sm text-gray-500 mb-4">
        Revisá y ajustá cada embarque propuesto antes de crearlo. Nada se guarda hasta que confirmes.
      </p>

      {loading && <p className="text-sm text-gray-500 py-8 text-center">Calculando propuesta...</p>}

      {!loading && emptyMessage && (
        <p className="text-sm text-gray-500 py-8 text-center">{emptyMessage}</p>
      )}

      {!loading && filas.length > 0 && (
        <div className="space-y-3">
          {filas.map((fila, idx) => (
            <div key={idx} className={`border rounded-lg p-3 ${fila.incluir ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={fila.incluir}
                    onChange={(e) => updateFila(idx, { incluir: e.target.checked })}
                  />
                  <span className="font-medium text-sm">{fila.rutaNombre}</span>
                </label>
                <span className="text-xs text-gray-500">
                  {fila.unidades}/{maxUnidades} unidades · {fila.pesoKg.toFixed(0)}kg · {fila.pedidoIds.length} pedido(s)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Repartidor</label>
                  <select
                    value={fila.trabajadorId}
                    onChange={(e) => updateFila(idx, { trabajadorId: e.target.value })}
                    disabled={!fila.incluir}
                    className="w-full p-2 border rounded-lg text-sm"
                  >
                    {repartidoresDisponibles.map((r) => (
                      <option key={r.id} value={r.id}>{r.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hora de salida</label>
                  <input
                    type="time"
                    value={fila.horaSalida}
                    onChange={(e) => updateFila(idx, { horaSalida: e.target.value })}
                    disabled={!fila.incluir}
                    className="w-full p-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Base dinero (cambio)</label>
                  <input
                    type="number"
                    min={0}
                    value={fila.baseDinero}
                    onChange={(e) => updateFila(idx, { baseDinero: Math.max(0, parseInt(e.target.value) || 0) })}
                    onFocus={(e) => e.target.select()}
                    disabled={!fila.incluir}
                    className="w-full p-2 border rounded-lg text-sm"
                    placeholder="$0"
                  />
                  {fila.incluir && fila.baseDinero === 0 && (
                    <p className="text-xs text-amber-600 mt-1">⚠️ Sin base de dinero</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && gruposSinAsignar.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-1">⚠️ Sin repartidor disponible</h3>
          <div className="space-y-1 text-xs text-amber-700">
            {gruposSinAsignar.map((g, i) => (
              <p key={i}>{g.pedidosCount} pedido(s) de &quot;{g.ruta}&quot; ({g.unidades} unidades) quedan pendientes</p>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <button onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button
          onClick={handleConfirmar}
          disabled={!puedeConfirmar || submitting || loading}
          className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creando...' : `Confirmar y crear ${filasIncluidas.length} embarque(s)`}
        </button>
      </div>
    </Modal>
  )
}
