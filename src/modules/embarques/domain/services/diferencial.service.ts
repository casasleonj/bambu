/**
 * Diferencial económico de un cambio de modo (N2, AGUA_BAMBU_N2_ALS_v2.0.md §3.3).
 *
 * Diferencial = valor actualmente aplicable al pendiente − valor histórico
 * atribuible al pendiente. Reutiliza el motor de precios existente
 * (`resolverPreciosPedido`) sin modificarlo — cero pricing nuevo.
 *
 * El valor histórico es el snapshot real de `PedidoItem.precio` (ya refleja
 * especiales/volumen/manual del pedido original, nunca precio de lista bruto).
 * El valor actual se resuelve con las reglas comerciales VIGENTES para el modo
 * destino — mismo motor que cualquier pedido nuevo.
 */

import { resolverPreciosPedido, type Canal, type ProductCode } from '@/lib/pricing'

export interface DiferencialInput {
  producto: ProductCode
  /** Precio histórico snapshot (`PedidoItem.precio`) — NUNCA se recalcula. */
  precioHistorico: number
  cantidadPendiente: number
  /** Modo destino de la Actividad — mismo tipo que `Canal` para el motor de precios. */
  modoDestino: Canal
  clienteId: string
  negocioId: string | null
}

export interface DiferencialResultado {
  valorHistorico: number
  valorActual: number
  /** valorActual - valorHistorico. Positivo = cobro adicional; negativo = ajuste a favor; 0 = sin ajuste. */
  diferencial: number
}

export async function calcularDiferencial(input: DiferencialInput): Promise<DiferencialResultado> {
  const valorHistorico = input.cantidadPendiente * input.precioHistorico

  const preciosResueltos = await resolverPreciosPedido(
    [{ codigo: input.producto, cantidad: input.cantidadPendiente }],
    input.modoDestino,
    input.clienteId,
    input.negocioId,
  )
  const valorActual = preciosResueltos.reduce((sum, pr) => sum + pr.subtotal, 0)

  return { valorHistorico, valorActual, diferencial: valorActual - valorHistorico }
}
