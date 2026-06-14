/**
 * Pronóstico agregado de demanda por día de la semana.
 *
 * Estrategia: histórico de los últimos N días agrupado por día de la semana
 * (0=Domingo, 1=Lunes, ..., 6=Sábado). Para cada día de la semana, calcula
 * el promedio y desviación estándar del total facturado y la cantidad de
 * pedidos. Devuelve predicción + intervalo de confianza para las próximas
 * 4 semanas.
 *
 * Esto es forecasting agregado para la producción, no para clientes
 * individuales (eso es Bloque 3 Cara A).
 *
 * Hipótesis:
 *  - El sistema es estacional por día de la semana (sí para la mayoría
 *    de SMB delivery).
 *  - No hay crecimiento/meseta anual complejo (suficiente para el caso).
 *  - 4-8 semanas de datos es suficiente.
 *
 * Si hay <4 semanas de datos, retorna `confianza: 'BAJA'`. Si hay 4-8,
 * 'MEDIA'. Si hay 8+, 'ALTA'.
 */

import type { EstadoPedido } from '@/types'

export interface PedidoParaPronostico {
  fecha: Date | string
  total: number | string
  estado: string | EstadoPedido
}

/** Total monetario del pedido. Si es string, lo parsea. */
function toNumber(x: number | string): number {
  if (typeof x === 'number') return x
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

/**
 * Parsea una fecha YYYY-MM-DD como local (no UTC). Importante porque
 * `new Date('2024-01-01')` se interpreta como UTC midnight, y `.getDay()`
 * devuelve el día en la zona LOCAL — eso puede ser el día anterior si
 * estamos al oeste de UTC (ej. Colombia, UTC-5). Para evitar ese
 * off-by-one, parseamos manualmente como local.
 */
function parseLocalDate(s: string): Date {
  // Si tiene hora, delegamos al constructor estándar.
  if (s.includes('T') || s.length > 10) return new Date(s)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return new Date(s)
  // Local midnight.
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Acepta Date|string, devuelve Date interpretando strings YYYY-MM-DD como local. */
function toDate(x: Date | string): Date {
  return typeof x === 'string' ? parseLocalDate(x) : x
}

export interface PronosticoPorDiaSemana {
  /** 0=Domingo, 1=Lunes, ..., 6=Sábado */
  diaSemana: number
  promedioPedidos: number
  promedioMonto: number
  /** Desviación estándar de los montos. */
  desvMonto: number
  /** Coeficiente de variación (desv/media). Útil para UI. */
  coefVariacion: number
  /** Cantidad de semanas observadas. */
  nSemanas: number
}

export interface PronosticoResultado {
  porDia: PronosticoPorDiaSemana[]
  /** 'ALTA' ≥8 semanas, 'MEDIA' 4-7, 'BAJA' <4. */
  confianza: 'ALTA' | 'MEDIA' | 'BAJA'
  /** Suma de promedioPedidos por todos los días de la semana = pedidos/semana esperados. */
  pedidosPorSemana: number
  montoPorSemana: number
  totalSemanasObservadas: number
  totalPedidosObservados: number
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export function nombreDia(dia: number): string {
  return DIAS[dia] ?? `Día ${dia}`
}

export function pronosticarPorDiaSemana(
  pedidos: PedidoParaPronostico[],
  semanasAtras: number = 8,
): PronosticoResultado {
  if (pedidos.length === 0) {
    return {
      porDia: Array.from({ length: 7 }, (_, i) => ({
        diaSemana: i,
        promedioPedidos: 0,
        promedioMonto: 0,
        desvMonto: 0,
        coefVariacion: 0,
        nSemanas: 0,
      })),
      confianza: 'BAJA',
      pedidosPorSemana: 0,
      montoPorSemana: 0,
      totalSemanasObservadas: 0,
      totalPedidosObservados: 0,
    }
  }

  // Filtrar solo pedidos ENTREGADOS (estado relevante para producción)
  const entregados = pedidos.filter(p => {
    const e = typeof p.estado === 'string' ? p.estado : p.estado
    return e === 'ENTREGADO' || e === 'PENDIENTE' || e === 'EN_RUTA'
  })

  // Encontrar el rango de fechas (semanas)
  const fechas = entregados.map(p => toDate(p.fecha))
  const minFecha = new Date(Math.min(...fechas.map(f => f.getTime())))
  const maxFecha = new Date(Math.max(...fechas.map(f => f.getTime())))
  const totalDias = Math.ceil(
    (maxFecha.getTime() - minFecha.getTime()) / (1000 * 60 * 60 * 24),
  )
  const totalSemanasObservadas = Math.max(1, Math.ceil(totalDias / 7))

  // Limitar a últimas N semanas si se pide
  const limite = new Date(maxFecha.getTime() - semanasAtras * 7 * 24 * 60 * 60 * 1000)
  const filtered = entregados.filter(p => {
    const f = toDate(p.fecha)
    return f >= limite
  })

  // Agrupar por (semana, día de la semana). Usamos minFecha del FILTERED
  // como startMs, así semana 0 = primera semana con datos, no la semana
  // calendario de `limite` (que puede tener gaps sin datos).
  const fechasFiltered = filtered.map(p => toDate(p.fecha))
  const startMs = fechasFiltered.length > 0
    ? Math.min(...fechasFiltered.map(f => f.getTime()))
    : limite.getTime()
  type Celda = { count: number; monto: number }
  const matriz: Record<string, Celda> = {}
  for (const p of filtered) {
    const f = toDate(p.fecha)
    const diasDesdeStart = Math.floor((f.getTime() - startMs) / (1000 * 60 * 60 * 24))
    const semana = Math.floor(diasDesdeStart / 7)
    const dia = f.getDay()
    const key = `${semana}-${dia}`
    if (!matriz[key]) matriz[key] = { count: 0, monto: 0 }
    matriz[key].count++
    matriz[key].monto += toNumber(p.total)
  }

  // Calcular el rango de semanas que aparecen en la data
  let maxSemana = 0
  for (const k of Object.keys(matriz)) {
    const sem = parseInt(k.split('-')[0], 10)
    if (sem > maxSemana) maxSemana = sem
  }
  const totalSemanasEnMatriz = maxSemana + 1

  // Para cada día de la semana, calcular stats
  const porDia: PronosticoPorDiaSemana[] = []
  for (let dia = 0; dia < 7; dia++) {
    const montosSemana: number[] = []
    const countsSemana: number[] = []
    for (let sem = 0; sem < totalSemanasEnMatriz; sem++) {
      const celda = matriz[`${sem}-${dia}`]
      countsSemana.push(celda?.count ?? 0)
      montosSemana.push(celda?.monto ?? 0)
    }
    const n = countsSemana.length
    const meanCount = countsSemana.reduce((a, b) => a + b, 0) / n
    const meanMonto = montosSemana.reduce((a, b) => a + b, 0) / n
    // Desviación estándar muestral
    const variance =
      montosSemana.reduce((acc, m) => acc + (m - meanMonto) ** 2, 0) / Math.max(1, n - 1)
    const desvMonto = Math.sqrt(variance)
    const coefVar = meanMonto > 0 ? desvMonto / meanMonto : 0
    porDia.push({
      diaSemana: dia,
      promedioPedidos: Math.round(meanCount * 100) / 100,
      promedioMonto: Math.round(meanMonto),
      desvMonto: Math.round(desvMonto),
      coefVariacion: Math.round(coefVar * 100) / 100,
      nSemanas: n,
    })
  }

  const pedidosPorSemana = porDia.reduce((a, d) => a + d.promedioPedidos, 0)
  const montoPorSemana = porDia.reduce((a, d) => a + d.promedioMonto, 0)

  const totalUsado = filtered.length
  const semanasUsadas = Math.min(semanasAtras, totalSemanasObservadas)
  let confianza: 'ALTA' | 'MEDIA' | 'BAJA' = 'BAJA'
  if (semanasUsadas >= 8 && totalUsado >= 50) confianza = 'ALTA'
  else if (semanasUsadas >= 4) confianza = 'MEDIA'

  return {
    porDia,
    confianza,
    pedidosPorSemana: Math.round(pedidosPorSemana * 100) / 100,
    montoPorSemana: Math.round(montoPorSemana),
    totalSemanasObservadas: semanasUsadas,
    totalPedidosObservados: totalUsado,
  }
}
