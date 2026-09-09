'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchResilient } from '@/lib/fetch-resilient'

const A_CAMEL: Record<string, string> = {
  PACA_AGUA: 'pacaAgua',
  PACA_HIELO: 'pacaHielo',
  BOTELLON: 'botellon',
  BOLSA_AGUA: 'bolsaAgua',
  BOLSA_HIELO: 'bolsaHielo',
}

export interface EstoSeRepiteContexto {
  /** Q4: negocio si el pedido tiene negocioId, si no cliente. */
  tipo: 'cliente' | 'negocio'
  id: string
  /** nombre para el copy; si falta, se usa "este {tipo}". */
  nombre?: string
}

/**
 * "Esto se repite" (Fase 8 F8-ii, blueprint §6.1) — propuesta **posterior**
 * al commit del Pedido (transacción separada, Q5). Nunca aparece en el mismo
 * botón que "Crear pedido". El usuario nunca ve la palabra "plantilla".
 *
 * - Fallo al guardar la recurrencia ≠ fallo del pedido: el pedido ya está
 *   creado; se informa y se permite reintentar. No se revierte ni recrea.
 * - 409 (ya existe): NO se convierte en PUT automático — se muestra la
 *   situación y un acceso explícito a revisar/ajustar el habitual.
 */
export function EstoSeRepite({
  contexto,
  canal,
  items,
  onClose,
}: {
  contexto: EstoSeRepiteContexto
  canal: 'PUNTO' | 'DOMICILIO'
  items: Array<{ producto: string; cantidad: number }>
  onClose: () => void
}) {
  const router = useRouter()
  const [cadaNDias, setCadaNDias] = useState(7)
  const [guardando, setGuardando] = useState(false)
  const [estado, setEstado] = useState<'form' | 'ok' | 'ya-existe' | 'error'>('form')

  const nombre = contexto.nombre || (contexto.tipo === 'negocio' ? 'este negocio' : 'este cliente')
  const productos = Object.fromEntries(
    items.filter((i) => i.cantidad > 0 && A_CAMEL[i.producto]).map((i) => [A_CAMEL[i.producto], i.cantidad]),
  )

  async function guardar() {
    setGuardando(true)
    const body: Record<string, unknown> = { canal, cadaNDias, productos }
    if (contexto.tipo === 'negocio') body.negocioId = contexto.id
    else body.clienteId = contexto.id

    const r = await fetchResilient(`/api/recurrentes`, { method: 'POST', body, localEndpoint: 'crear-recurrente' })
    setGuardando(false)
    if (r.status === 'ok' || r.status === 'offline') { setEstado('ok'); return }
    if (r.statusCode === 409) { setEstado('ya-existe'); return }
    setEstado('error')
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm" data-testid="esto-se-repite">
      {estado === 'form' && (
        <>
          <div className="font-medium text-blue-900">¿Guardar como pedido habitual de {nombre}?</div>
          <p className="mt-1 text-[11px] text-blue-700">
            El pedido ya está creado. Esto solo prepara que se repita automáticamente.
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-700">
            Cada
            <input
              type="number"
              min={1}
              value={cadaNDias || ''}
              onChange={(e) => setCadaNDias(Math.max(1, parseInt(e.target.value, 10) || 0))}
              data-testid="esto-se-repite-cada"
              className="w-14 rounded border border-gray-300 px-1.5 py-0.5 text-right"
            />
            días
          </label>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              data-testid="esto-se-repite-guardar"
              className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              {guardando ? 'Guardando…' : 'Guardar como habitual'}
            </button>
            <button type="button" onClick={onClose} data-testid="esto-se-repite-ahora-no" className="text-xs text-gray-500">
              Ahora no
            </button>
          </div>
        </>
      )}

      {estado === 'ok' && (
        <div data-testid="esto-se-repite-ok">
          <div className="font-medium text-blue-900">Guardado como pedido habitual de {nombre}.</div>
          <button type="button" onClick={onClose} className="mt-2 text-xs text-blue-600 hover:underline">Cerrar</button>
        </div>
      )}

      {estado === 'ya-existe' && (
        <div data-testid="esto-se-repite-ya-existe">
          <div className="font-medium text-amber-900">{nombre} ya tiene un pedido habitual.</div>
          <p className="mt-1 text-[11px] text-amber-800">No se cambió nada. Si querés revisarlo o ajustarlo, hacelo desde el pedido habitual.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => { router.push('/recurrentes'); onClose() }}
              data-testid="esto-se-repite-revisar"
              className="text-xs text-blue-600 hover:underline"
            >
              Revisar el habitual
            </button>
            <button type="button" onClick={onClose} className="text-xs text-gray-500">Cerrar</button>
          </div>
        </div>
      )}

      {estado === 'error' && (
        <div data-testid="esto-se-repite-error">
          <div className="font-medium text-amber-900">No se pudo guardar como habitual.</div>
          <p className="mt-1 text-[11px] text-amber-800">El pedido está creado y no se vio afectado.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => { setEstado('form'); guardar() }}
              data-testid="esto-se-repite-reintentar"
              className="text-xs text-blue-600 hover:underline"
            >
              Reintentar
            </button>
            <button type="button" onClick={onClose} className="text-xs text-gray-500">Ahora no</button>
          </div>
        </div>
      )}
    </div>
  )
}
