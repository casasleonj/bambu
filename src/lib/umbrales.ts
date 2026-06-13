/**
 * Umbrales del Sistema de Alertas Antifraude.
 *
 * Centraliza la lectura de las claves de Config que parametrizan las
 * detecciones. Cada clave tiene un default hardcoded que mantiene el
 * comportamiento actual del código (los defaults coinciden con los
 * valores que el detector usaba embebidos).
 *
 * El endpoint /api/alertas/umbrales expone este objeto al cliente.
 * El commit 2 (fix sesgos) conecta estos umbrales a los calculos
 * reales; este commit solo define el contrato y el reader.
 *
 * @see prisma/seed.ts para los valores sembrados en la DB
 * @see src/lib/config-validation.ts para los validadores de rango
 */

import { getConfigs } from './config'

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

const CLAVES_UMBRALES = [
  'DIAS_ALERTA_NO_VERIFICADO',
  'DIAS_VENCIMIENTO_PROMESA',
  'MULTIPLICADOR_MONTO_ANOMALO',
  'VARIACION_PRECIO_BRUSCO_PCT',
  'UMBRAL_DEUDA_REPARTIDOR_PACAS',
  'DIAS_SIN_JUSTIFICAR_DESCUENTO',
  'PCT_DEVOLUCIONES_ANORMALES',
] as const

/**
 * Lee los umbrales de la tabla Config y los mezcla con los defaults.
 *
 * Si una clave no existe en la DB, su campo usa el default.
 * Si el valor parseado es NaN, tambien usa el default.
 *
 * Esta funcion usa el cache de `getConfigs` (60s TTL) — seguro de
 * llamar en cada request del endpoint /alertas/umbrales.
 */
export async function getUmbralesAlertas(): Promise<UmbralesAlertas> {
  const configs = await getConfigs(CLAVES_UMBRALES)

  const safeParse = (raw: string | undefined, fallback: number): number => {
    if (raw === undefined) return fallback
    const n = Number(raw)
    return Number.isFinite(n) ? n : fallback
  }

  return {
    diasNoVerificado: safeParse(configs.DIAS_ALERTA_NO_VERIFICADO, UMBRALES_DEFAULT.diasNoVerificado),
    diasVencimientoPromesa: safeParse(configs.DIAS_VENCIMIENTO_PROMESA, UMBRALES_DEFAULT.diasVencimientoPromesa),
    multiplicadorMontoAnomalo: safeParse(configs.MULTIPLICADOR_MONTO_ANOMALO, UMBRALES_DEFAULT.multiplicadorMontoAnomalo),
    variacionPrecioBruscoPct: safeParse(configs.VARIACION_PRECIO_BRUSCO_PCT, UMBRALES_DEFAULT.variacionPrecioBruscoPct),
    umbralDeudaRepartidorPacas: safeParse(configs.UMBRAL_DEUDA_REPARTIDOR_PACAS, UMBRALES_DEFAULT.umbralDeudaRepartidorPacas),
    diasSinJustificarDescuento: safeParse(configs.DIAS_SIN_JUSTIFICAR_DESCUENTO, UMBRALES_DEFAULT.diasSinJustificarDescuento),
    pctDevolucionesAnormales: safeParse(configs.PCT_DEVOLUCIONES_ANORMALES, UMBRALES_DEFAULT.pctDevolucionesAnormales),
  }
}
