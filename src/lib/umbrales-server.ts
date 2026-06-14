/**
 * Server-only reader para los umbrales de alertas.
 *
 * FIX BUILD ERROR (pre-existente): Este archivo se separó de
 * `src/lib/umbrales.ts` para que el bundle del cliente no incluya
 * transitivamente `revalidateTag`/`unstable_cache` desde `config.ts`.
 *
 * Solo importar desde Server Components, Route Handlers, o archivos
 * que se importan únicamente desde el servidor. El naming convention
 * `-server.ts` es la señal de que este módulo NO debe importarse
 * desde Client Components.
 *
 * @see src/lib/umbrales.ts para los tipos y constantes client-safe
 */

import { getConfigs } from './config'
import {
  UMBRALES_DEFAULT,
  CLAVES_UMBRALES,
  type UmbralesAlertas,
} from './umbrales'

/**
 * Lee los umbrales de la tabla Config y los mezcla con los defaults.
 *
 * Si una clave no existe en la DB, su campo usa el default.
 * Si el valor parseado es NaN, también usa el default.
 *
 * Esta función usa el cache de `getConfigs` (60s TTL) — seguro de
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
