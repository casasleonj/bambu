'use client'

import { useState } from 'react'
import { fetchResilient } from '@/lib/fetch-resilient'
import type { PeekLayer2 } from './peek-cache'

const PRODUCTOS: Array<{ codigo: string; camel: string; label: string }> = [
  { codigo: 'PACA_AGUA', camel: 'pacaAgua', label: 'Paca agua' },
  { codigo: 'PACA_HIELO', camel: 'pacaHielo', label: 'Paca hielo' },
  { codigo: 'BOTELLON', camel: 'botellon', label: 'Botellón' },
  { codigo: 'BOLSA_AGUA', camel: 'bolsaAgua', label: 'Bolsa agua' },
  { codigo: 'BOLSA_HIELO', camel: 'bolsaHielo', label: 'Bolsa hielo' },
]

type Recurrencia = NonNullable<PeekLayer2['recurrencia']>

/**
 * Editor compacto de la recurrencia (Fase 8 F8-iii, blueprint §6.1). Se abre
 * desde el peek ("Ajustar"). La recurrencia no tiene pagos/entrega/cliente,
 * así que es un panel chico, no el `PedidosWorkspace` completo. `PUT
 * /api/recurrentes` con el diff. El usuario nunca ve "plantilla".
 */
export function RecurrenciaEditor({
  recurrencia,
  onCancel,
  onGuardado,
}: {
  recurrencia: Recurrencia
  onCancel: () => void
  onGuardado: () => void
}) {
  const [cada, setCada] = useState(recurrencia.cadaNDias)
  const [cantidades, setCantidades] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const p of recurrencia.productos) m[p.producto] = p.cantidad
    return m
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalProd = Object.values(cantidades).reduce((s, n) => s + (n || 0), 0)
  const puedeGuardar = !guardando && cada >= 1 && totalProd >= 3

  async function put(body: Record<string, unknown>) {
    setGuardando(true)
    setError(null)
    const r = await fetchResilient(`/api/recurrentes?id=${recurrencia.id}`, { method: 'PUT', body, localEndpoint: 'editar-recurrente' })
    setGuardando(false)
    if (r.status === 'ok' || r.status === 'offline') { onGuardado(); return }
    setError(r.statusCode === 409
      ? 'El pedido habitual cambió en otra sesión. Cerrá y volvé a abrirlo.'
      : (r.error || 'No se pudo guardar el cambio.'))
  }

  const guardar = () => {
    const productos = Object.fromEntries(
      PRODUCTOS.map((p) => [p.camel, cantidades[p.codigo] ?? 0]),
    )
    void put({ cadaNDias: cada, productos })
  }

  const togglePausa = () => void put({ activo: !recurrencia.activo })

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" data-testid="recurrencia-editor">
      <div className="text-xs font-semibold text-gray-700">Ajustar el pedido habitual</div>

      <label className="mt-2 flex items-center gap-2 text-[11px] text-gray-600">
        Cada
        <input
          type="number"
          min={1}
          value={cada || ''}
          onChange={(e) => setCada(Math.max(0, parseInt(e.target.value, 10) || 0))}
          data-testid="recurrencia-editor-cada"
          className="w-14 rounded border border-gray-300 px-1.5 py-0.5 text-right"
        />
        días
      </label>

      <div className="mt-2 space-y-1">
        {PRODUCTOS.map((p) => (
          <label key={p.codigo} className="flex items-center justify-between text-[11px] text-gray-600">
            {p.label}
            <input
              type="number"
              min={0}
              value={cantidades[p.codigo] ?? 0}
              onChange={(e) => setCantidades((c) => ({ ...c, [p.codigo]: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
              data-testid={`recurrencia-editor-${p.camel}`}
              className="w-14 rounded border border-gray-300 px-1.5 py-0.5 text-right"
            />
          </label>
        ))}
      </div>
      {totalProd < 3 && (
        <p className="mt-1 text-[10px] text-amber-700" data-testid="recurrencia-editor-min">Mínimo 3 productos por entrega.</p>
      )}

      {error && <p className="mt-1 text-[11px] text-amber-700" data-testid="recurrencia-editor-error">{error}</p>}

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={togglePausa}
          disabled={guardando}
          data-testid="recurrencia-editor-pausa"
          className="text-[11px] text-gray-600 hover:underline disabled:opacity-40"
        >
          {recurrencia.activo ? 'Pausar' : 'Reactivar'}
        </button>
        <span className="flex gap-2">
          <button type="button" onClick={onCancel} className="text-[11px] text-gray-500">Cancelar</button>
          <button
            type="button"
            onClick={guardar}
            disabled={!puedeGuardar}
            data-testid="recurrencia-editor-guardar"
            className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </span>
      </div>
    </div>
  )
}
