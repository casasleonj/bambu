import { calcularMontoPagado, calcularTotalEntregado, type CuadrePedido } from './types'

/**
 * Fase 7 — gating del wizard forzado de cierre.
 *
 * Decisión D7: cerrar un embarque es un wizard que NO deja avanzar con pasos
 * incompletos. Cada paso expone `{ valido, motivos }`; la UI deshabilita
 * "Siguiente" y muestra los motivos cuando `valido === false`.
 *
 * Pasos (0-index): 0 Pedidos · 1 Ventas Libres · 2 Físico/Conciliación ·
 * 3 Gastos · 4 Cuadre y Confirmar.
 */

export interface PasoValidez {
  valido: boolean
  motivos: string[]
}

/**
 * Paso 0 — Pedidos: ningún pedido puede tener pagos que excedan el total
 * entregado (eso violaría `chk_pedido_montopagado_le_total` y devolvería
 * 500 en el backend; ver bug preexistente #2 / Fase 8).
 */
export function pasoPedidosValido(cuadres: Record<string, CuadrePedido>): PasoValidez {
  const motivos: string[] = []
  for (const c of Object.values(cuadres)) {
    const totalReal = calcularTotalEntregado(c)
    const pagado = calcularMontoPagado(c.pagos)
    if (pagado > totalReal) {
      motivos.push(`Pedido #${c.pedidoId}: cobrado (${pagado}) excede lo entregado (${totalReal})`)
    }
  }
  return { valido: motivos.length === 0, motivos }
}

/**
 * Paso 2 — Físico/Conciliación: si hay unidades sin conciliar, exigen
 * justificación (o ajustar devueltas/cambios/rotas).
 */
export function pasoFisicoValido(totalDiscrepancia: number, justificacion: string): PasoValidez {
  if (totalDiscrepancia > 0 && !justificacion.trim()) {
    return {
      valido: false,
      motivos: [`Hay ${totalDiscrepancia} unidad(es) sin conciliar. Justificá la discrepancia o ajustá los retornos.`],
    }
  }
  return { valido: true, motivos: [] }
}

/**
 * Paso 4 — Cuadre y Confirmar: solo se habilita "Confirmar cierre" cuando el
 * preview autoritativo del backend (dry-run del mismo `CerrarEmbarqueUseCase`)
 * terminó sin error. Sin preview verificado → no se puede confirmar.
 */
export function pasoConfirmarValido(previewOk: boolean, previewLoading: boolean): PasoValidez {
  if (previewLoading) {
    return { valido: false, motivos: ['Verificando el cuadre con el backend…'] }
  }
  if (!previewOk) {
    return { valido: false, motivos: ['El preview del cierre no se pudo verificar. Revisá los pasos anteriores.'] }
  }
  return { valido: true, motivos: [] }
}
