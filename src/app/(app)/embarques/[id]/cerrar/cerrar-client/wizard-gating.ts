import { calcularMontoPagado, calcularTotalEntregado, type CuadrePedido, type Pedido, type VentaLibre } from './types'
import { derivarEntrega, lineasEntrega, resumenDineroPedido, validarVentaLibre } from './cierre-logic'

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
 * Paso 0 (cierre V2) — el estado de entrega se DERIVA de las cantidades, así
 * que el wizard ya no puede quedar en contradicción (p. ej. «Completo» con 5
 * de 10). Lo que sí exige es una decisión explícita cuando queda pendiente, y
 * que el cobro no exceda lo que el cliente debe (regla PAGOS_EXCEDIDOS).
 */
export function pasoPedidosValidoV2(pedidos: Pedido[], cuadres: Record<string, CuadrePedido>): PasoValidez {
  const motivos: string[] = []
  for (const pedido of pedidos) {
    const c = cuadres[pedido.id]
    if (!c) continue
    const lineas = lineasEntrega(pedido, c.productosEntregados)
    const r = derivarEntrega(lineas)
    if (r.hayExceso) {
      motivos.push(`Pedido #${pedido.numero}: entregas ${r.totalExceso} unidad(es) más de lo pendiente. Si el cliente pidió más, registra una venta libre.`)
    }
    if (r.requiereDecision && !c.decisionPendiente) {
      motivos.push(`Pedido #${pedido.numero}: quedan ${r.totalFalta} unidad(es) sin entregar. Elige qué pasa con lo que falta.`)
    }
    if (r.estado !== 'NO_ENTREGADO') {
      const d = resumenDineroPedido(pedido, c.pagos)
      if (d.excede) {
        motivos.push(`Pedido #${pedido.numero}: el cobro (${d.cobrarAhora}) excede lo que el cliente debe (${d.saldoPrevio}).`)
      }
    }
  }
  return { valido: motivos.length === 0, motivos }
}

/** Paso 1 (cierre V2) — cada venta libre debe ser consistente antes de avanzar. */
export function pasoVentasLibresValido(ventas: VentaLibre[], totales: number[]): PasoValidez {
  const motivos: string[] = []
  ventas.forEach((v, i) => {
    for (const m of validarVentaLibre(v, totales[i] ?? 0)) motivos.push(`Venta ${i + 1}: ${m}`)
  })
  return { valido: motivos.length === 0, motivos }
}

/**
 * Paso 2 — Físico/Conciliación: si hay unidades sin conciliar, exigen
 * justificación (o ajustar devueltas/cambios/rotas).
 */
export function pasoFisicoValido(
  totalDiscrepancia: number,
  justificacion: string,
  /** V2 (#446): los cambios salen de las sustituciones; sin cargarlas no se puede conciliar. */
  cambiosListos = true,
): PasoValidez {
  if (!cambiosListos) {
    return { valido: false, motivos: ['Espera a que carguen los cambios registrados (o reintenta si falló).'] }
  }
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
  /**
   * Rechazo de negocio del servidor (4xx del preview): a diferencia de una
   * falla de red, el cierre real fallaría igual, así que bloquea y muestra el
   * mensaje exacto.
   */
  rechazo?: string | null,
): PasoValidez {
  if (rechazo) {
    return { valido: false, motivos: [rechazo] }
  }
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
