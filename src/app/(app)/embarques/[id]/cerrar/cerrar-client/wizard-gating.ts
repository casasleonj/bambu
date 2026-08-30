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
  /** No bloquean el avance; se muestran en ámbar como aviso. */
  advertencias?: string[]
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
 * Paso 4 — Cuadre y Confirmar.
 *
 * El preview autoritativo (`POST /cerrar/preview`, dry-run del mismo
 * `CerrarEmbarqueUseCase` con rollback) es **best-effort**: sirve para mostrar
 * los números reales antes de confirmar, pero NO es un gate duro. Si falla
 * (offline, timeout, 2G rural) NO se bloquea el cierre — el `POST /cerrar`
 * real valida en el servidor y es la fuente de verdad; un cierre inválido se
 * revierte sin efecto. Bloquear acá dejaría al asistente sin poder cerrar el
 * embarque cuando la red está mala, justo el escenario para el que se diseñó
 * el offline-first del proyecto.
 *
 * - `previewLoading` → bloquea (transitorio, se está verificando).
 * - `previewError` → NO bloquea; muestra advertencia ámbar.
 * - preview OK → habilita sin aviso.
 */
export function pasoConfirmarValido(
  previewOk: boolean,
  previewLoading: boolean,
  previewError: boolean,
): PasoValidez {
  if (previewLoading) {
    return { valido: false, motivos: ['Verificando el cuadre con el servidor…'] }
  }
  if (previewError) {
    return {
      valido: true,
      motivos: [],
      advertencias: [
        'No se pudo verificar el cuadre con el servidor (sin conexión o error). ' +
          'Al confirmar, el cierre se valida en el servidor; si algo no cuadra, se cancela sin efecto.',
      ],
    }
  }
  if (!previewOk) {
    // Estado inicial al entrar al paso, antes de que arranque el fetch.
    return { valido: false, motivos: ['Cargando verificación del cuadre…'] }
  }
  return { valido: true, motivos: [] }
}
