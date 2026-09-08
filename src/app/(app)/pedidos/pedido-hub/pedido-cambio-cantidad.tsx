'use client'

import { useState } from 'react'
import { PedidoCambioCantidadDecision, type CambioCantidadCausa } from './pedido-cambio-cantidad-decision'
import { CorreccionCantidadForm } from './correccion-cantidad-form'
import type { Pedido } from '../pedidos-client/types'

/**
 * Contenedor de G11 en el peek (plan Fase 6-i): "Cambiar cantidades" →
 * punto de decisión ("¿Qué pasó?") → rama A (corrección, inline) o rama B
 * (nueva demanda, `onNuevaDemanda` — el workspace lo monta F6-ii).
 *
 * Sólo se muestra si el pedido tiene items. El botón NO se oculta para
 * pedidos cerrados: "el cliente pidió más" tras la entrega es una nueva
 * demanda legítima; y si el usuario intenta corregir, el guard del backend
 * (`CORRECCION_PEDIDO_CERRADO`) se lo explica (P4).
 */
export function PedidoCambioCantidad({
  pedido,
  onMutado,
  onNuevaDemanda,
}: {
  pedido: Pedido
  onMutado: () => void
  onNuevaDemanda: () => void
}) {
  const [fase, setFase] = useState<'cerrado' | 'decidir' | 'correccion'>('cerrado')
  const tieneItems = (pedido.items ?? []).some((i) => i.cantPedido > 0)
  if (!tieneItems) return null

  function elegir(causa: CambioCantidadCausa) {
    if (causa === 'nueva-demanda') {
      setFase('cerrado')
      onNuevaDemanda()
      return
    }
    setFase('correccion')
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm" data-testid="pedido-cambio-cantidad">
      {fase === 'cerrado' && (
        <button
          type="button"
          onClick={() => setFase('decidir')}
          data-testid="cambio-cantidad-abrir"
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          Cambiar cantidades…
        </button>
      )}

      {fase === 'decidir' && (
        <PedidoCambioCantidadDecision onElegir={elegir} onCancel={() => setFase('cerrado')} />
      )}

      {fase === 'correccion' && (
        <CorreccionCantidadForm
          pedido={pedido}
          onCancel={() => setFase('cerrado')}
          onMutado={() => { setFase('cerrado'); onMutado() }}
          onIrANuevaDemanda={() => { setFase('cerrado'); onNuevaDemanda() }}
        />
      )}
    </div>
  )
}
