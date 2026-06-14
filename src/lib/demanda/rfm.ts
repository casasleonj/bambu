/**
 * Cálculo de intervalo mediano entre pedidos (RFM lite, solo R y F).
 *
 * Por qué mediana y no promedio: la mediana es robusta a outliers. Si un
 * cliente pidió 12 veces a intervalos de 7±2 días y una vez tardó 90 días
 * (vacaciones, viaje), el promedio se va a 12 días, la mediana sigue en 7.
 *
 * Edge cases:
 *  - 0 pedidos → null (no se puede calcular)
 *  - 1 pedido → null (no hay intervalo)
 *  - 2+ pedidos → mediana de los intervalos entre fechas consecutivas
 *  - Intervalos <1 día o >365 días → filtrados como outliers (no son
 *    patrones de compra reales; son errores de tipeo o pruebas)
 */

export interface RfmConfig {
  /** Intervalos menores a esto (días) se filtran. Default 1. */
  minDias?: number
  /** Intervalos mayores a esto se filtran. Default 365. */
  maxDias?: number
}

const DEFAULTS: Required<RfmConfig> = {
  minDias: 1,
  maxDias: 365,
}

export function calcularIntervaloMediano(
  fechas: Date[] | string[],
  cfg: RfmConfig = {},
): number | null {
  const { minDias, maxDias } = { ...DEFAULTS, ...cfg }
  if (fechas.length < 2) return null

  const sorted = [...fechas]
    .map(f => (typeof f === 'string' ? new Date(f) : f))
    .sort((a, b) => a.getTime() - b.getTime())

  const intervalos: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const dias = (sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24)
    if (dias >= minDias && dias <= maxDias) {
      intervalos.push(dias)
    }
  }
  if (intervalos.length === 0) return null

  intervalos.sort((a, b) => a - b)
  const mid = Math.floor(intervalos.length / 2)
  return intervalos.length % 2 === 0
    ? Math.round((intervalos[mid - 1] + intervalos[mid]) / 2)
    : Math.round(intervalos[mid])
}

export interface ClienteFrecuencia {
  ultEntrega: Date | null
  intervaloMediano: number | null
  proxEsperada: Date | null
  diasAtraso: number // positivo = atrasado, negativo = no debe pedir aún
}

/**
 * Calcula la fecha esperada de próximo pedido, los días de atraso y
 * el intervalo mediano para un cliente. Todo a partir de su historial.
 */
export function calcularFrecuenciaCliente(
  fechas: Date[] | string[],
  ahora: Date = new Date(),
  cfg?: RfmConfig,
): ClienteFrecuencia {
  const intervalo = calcularIntervaloMediano(fechas, cfg)
  const ultEntrega = fechas.length > 0
    ? (typeof fechas[0] === 'string' ? new Date(fechas[0]) : fechas[0])
    : null

  // Tomar la fecha más reciente del array
  let ult: Date | null = null
  for (const f of fechas) {
    const d = typeof f === 'string' ? new Date(f) : f
    if (ult === null || d.getTime() > ult.getTime()) ult = d
  }
  if (ult === null && ultEntrega) ult = ultEntrega

  if (ult === null || intervalo === null) {
    return { ultEntrega: null, intervaloMediano: null, proxEsperada: null, diasAtraso: 0 }
  }

  const proxEsperada = new Date(ult.getTime() + intervalo * 24 * 60 * 60 * 1000)
  const diasAtraso = Math.floor((ahora.getTime() - proxEsperada.getTime()) / (1000 * 60 * 60 * 24))
  return {
    ultEntrega: ult,
    intervaloMediano: intervalo,
    proxEsperada,
    diasAtraso,
  }
}
