/**
 * Umbrales del Sistema de Alertas Antifraude.
 *
 * FIX BUILD ERROR (pre-existente): Este archivo ahora SOLO contiene tipos
 * y constantes client-safe. La función server-only `getUmbralesAlertas`
 * se movió a `src/lib/umbrales-server.ts` para que el bundle del cliente
 * no incluya `revalidateTag`/`unstable_cache` (importados transitivamente
 * por `config.ts`).
 *
 * @see prisma/seed.ts para los valores sembrados en la DB
 * @see src/lib/config-validation.ts para los validadores de rango
 * @see src/lib/umbrales-server.ts para el reader (server-only)
 */

export interface UmbralesAlertas {
  /** Dias desde creacion del cliente sin verificar para alertar (default 30) */
  diasNoVerificado: number
  /** Dias antes/despues de la promesa de pago para alertar (default 2) */
  diasVencimientoPromesa: number
  /** Multiplicador sobre mediana para alerta MONTO_ANOMALO (default 2) */
  multiplicadorMontoAnomalo: number
  /** % variacion vs ultimo pedido para alerta CAMBIO_PRECIO_BRUSCO (default 30) */
  variacionPrecioBruscoPct: number
  /** Umbral de pacas adeudadas para alerta REPARTIDOR_DEUDA_ALTA (default 50) */
  umbralDeudaRepartidorPacas: number
  /** Horas sin justificar descuento para alerta (default 48h) */
  diasSinJustificarDescuento: number
  /** Multiplicador sobre promedio de devoluciones para alerta (default 2) */
  pctDevolucionesAnormales: number
}

export const UMBRALES_DEFAULT: UmbralesAlertas = {
  diasNoVerificado: 30,
  diasVencimientoPromesa: 2,
  multiplicadorMontoAnomalo: 2,
  variacionPrecioBruscoPct: 30,
  umbralDeudaRepartidorPacas: 50,
  diasSinJustificarDescuento: 2,
  pctDevolucionesAnormales: 2,
}

export const CLAVES_UMBRALES = [
  'DIAS_ALERTA_NO_VERIFICADO',
  'DIAS_VENCIMIENTO_PROMESA',
  'MULTIPLICADOR_MONTO_ANOMALO',
  'VARIACION_PRECIO_BRUSCO_PCT',
  'UMBRAL_DEUDA_REPARTIDOR_PACAS',
  'DIAS_SIN_JUSTIFICAR_DESCUENTO',
  'PCT_DEVOLUCIONES_ANORMALES',
] as const
