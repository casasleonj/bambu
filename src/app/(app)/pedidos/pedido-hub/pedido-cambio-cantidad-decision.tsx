'use client'

import { useState } from 'react'

export type CambioCantidadCausa = 'correccion' | 'nueva-demanda'

/**
 * Punto de decisión de G11 (blueprint §5.2, plan Fase 6-i, P1/P2/P9).
 *
 * "¿Qué pasó?" — **exactamente dos** opciones, sin default seleccionado, sin
 * opción "no sé", sin Venta Libre. La selección es una **declaración de
 * causa**, no una autorización (P3): sólo emite la causa; el flujo siguiente
 * valida, proyecta, confirma y audita.
 *
 * Si el usuario no puede determinar la causa, la ayuda expandible **explica
 * por qué la distinción importa** — nunca hay un botón "continuar sin
 * decidir".
 */
export function PedidoCambioCantidadDecision({
  onElegir,
  onCancel,
}: {
  onElegir: (causa: CambioCantidadCausa) => void
  onCancel: () => void
}) {
  const [ayuda, setAyuda] = useState(false)

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" data-testid="cambio-cantidad-decision">
      <div className="text-xs font-semibold text-gray-700">¿Qué pasó?</div>

      <div className="mt-2 space-y-1.5">
        <button
          type="button"
          onClick={() => onElegir('correccion')}
          data-testid="cambio-causa-correccion"
          className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-xs hover:border-blue-400 hover:bg-blue-50"
        >
          <span className="font-medium text-gray-800">Me equivoqué al capturar</span>
          <span className="block text-[11px] text-gray-500">Corregir este pedido — cambia su total y su factura</span>
        </button>
        <button
          type="button"
          onClick={() => onElegir('nueva-demanda')}
          data-testid="cambio-causa-nueva-demanda"
          className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-xs hover:border-blue-400 hover:bg-blue-50"
        >
          <span className="font-medium text-gray-800">El cliente pidió más / menos</span>
          <span className="block text-[11px] text-gray-500">Crear un pedido nuevo, vinculado a este</span>
        </button>
      </div>

      <button
        type="button"
        onClick={() => setAyuda((v) => !v)}
        data-testid="cambio-decision-ayuda-toggle"
        className="mt-2 text-[11px] text-blue-600 hover:underline"
      >
        No estoy seguro de cuál es
      </button>
      {ayuda && (
        <p className="mt-1 text-[11px] text-gray-600" data-testid="cambio-decision-ayuda">
          La distinción es necesaria para registrar bien la operación. Si escribiste mal la cantidad
          (por ejemplo, pusiste 12 y eran 10), es una <b>corrección</b>: se ajusta este mismo pedido.
          Si el cliente efectivamente cambió lo que quiere después de haber pedido, es una
          <b> nueva demanda</b>: se crea un pedido aparte que queda vinculado a este. No hay una
          tercera opción — elegí según lo que realmente ocurrió.
        </p>
      )}

      <div className="mt-2">
        <button type="button" onClick={onCancel} className="text-[11px] text-gray-500">Cancelar</button>
      </div>
    </div>
  )
}
