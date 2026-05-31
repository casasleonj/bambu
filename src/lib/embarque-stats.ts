/**
 * Estadísticas de tiempo de embarques.
 *
 * KPIs estándar de la industria para delivery operations:
 * - Duración total (horaLlegada - horaSalida)
 * - Tiempo de preparación (horaSalida - createdAt)
 * - Entregas por hora
 * - Tasa de entrega / no entrega
 * - Discrepancia de productos
 */

export interface EmbarqueStatsInput {
  id: string
  numero: number
  numeroDia: number
  fecha: string
  horaSalida: string | null
  horaLlegada: string | null
  estado: string
  trabajadorId: string
  trabajadorNombre: string
  rutaId: string | null
  rutaNombre: string | null
  pedidos: Array<{
    id: string
    estadoEntrega?: string
    origen?: string
  }>
  productos: Array<{
    producto: string
    cargadas: number
    devueltas: number
    cambios: number
    rotas: number
  }>
}

export function calcularDuracionMin(
  inicio: string | null,
  fin: string | null,
): number | null {
  if (!inicio || !fin) return null
  const diff = new Date(fin).getTime() - new Date(inicio).getTime()
  if (diff < 0) return null
  return Math.round(diff / 60000)
}

export function formatDuracion(minutos: number): string {
  if (minutos < 60) return `${minutos}m`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function calcularStatsEmbarque(e: EmbarqueStatsInput) {
  const duracionMin = calcularDuracionMin(e.horaSalida, e.horaLlegada)
  const preparacionMin = calcularDuracionMin(e.fecha, e.horaSalida)

  const totalPedidos = e.pedidos.length
  const entregados = e.pedidos.filter(
    (p) => p.estadoEntrega === 'ENTREGADO',
  ).length
  const noEntregados = e.pedidos.filter(
    (p) => p.estadoEntrega === 'NO_ENTREGADO',
  ).length
  const parciales = e.pedidos.filter(
    (p) => p.estadoEntrega === 'PARCIAL',
  ).length

  const tasaEntrega = totalPedidos > 0 ? entregados / totalPedidos : 0
  const tasaNoEntrega = totalPedidos > 0 ? noEntregados / totalPedidos : 0

  const entregasPorHora =
    duracionMin && duracionMin > 0
      ? (entregados / duracionMin) * 60
      : null

  // Discrepancia de productos
  const totalCargadas = e.productos.reduce((s, p) => s + p.cargadas, 0)
  const totalDevueltas = e.productos.reduce((s, p) => s + p.devueltas, 0)
  const totalRotas = e.productos.reduce((s, p) => s + p.rotas, 0)
  const entregadas = totalCargadas - totalDevueltas - totalRotas
  const discrepanciaPct =
    totalCargadas > 0 ? (totalCargadas - entregadas) / totalCargadas : 0

  return {
    id: e.id,
    numero: e.numero,
    numeroDia: e.numeroDia,
    fecha: e.fecha,
    trabajadorNombre: e.trabajadorNombre,
    rutaNombre: e.rutaNombre,
    duracionMin,
    preparacionMin,
    totalPedidos,
    entregados,
    noEntregados,
    parciales,
    tasaEntrega,
    tasaNoEntrega,
    entregasPorHora,
    totalCargadas,
    totalDevueltas,
    totalRotas,
    discrepanciaPct,
  }
}

export interface KpiGeneral {
  totalEmbarques: number
  duracionPromedioMin: number | null
  duracionMedianaMin: number | null
  duracionMinMin: number | null
  duracionMaxMin: number | null
  entregasPorHoraPromedio: number | null
  tasaEntregaPromedio: number
  tasaNoEntregaPromedio: number
  tiempoPreparacionPromedioMin: number | null
  discrepanciaPromedioPct: number
  totalPedidos: number
  totalEntregados: number
  totalNoEntregados: number
}

export interface StatsPorTrabajador {
  trabajadorId: string
  nombre: string
  totalEmbarques: number
  duracionPromedioMin: number | null
  entregasPorHoraPromedio: number | null
  tasaEntrega: number
  tasaNoEntrega: number
  discrepanciaPct: number
  totalPedidos: number
  totalEntregados: number
}

export interface StatsPorRuta {
  rutaId: string | null
  nombre: string | null
  totalEmbarques: number
  duracionPromedioMin: number | null
  entregasPorHoraPromedio: number | null
  tasaEntrega: number
  tasaNoEntrega: number
  totalPedidos: number
  totalEntregados: number
}

export interface TendenciaDiaria {
  fecha: string
  totalEmbarques: number
  duracionPromedioMin: number | null
  entregasPorHoraPromedio: number | null
  tasaEntrega: number
}

export function calcularKpiGeneral(
  embarques: EmbarqueStatsInput[],
): KpiGeneral {
  // FIX #24: Include CERRADO and EN_RUTA (EN_RUTA may have partial data)
  const activos = embarques.filter((e) => e.estado === 'CERRADO' || e.estado === 'EN_RUTA')
  const stats = activos.map(calcularStatsEmbarque)

  const duraciones = stats
    .map((s) => s.duracionMin)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b)

  const preparaciones = stats
    .map((s) => s.preparacionMin)
    .filter((d): d is number => d !== null)

  const entregasHora = stats
    .map((s) => s.entregasPorHora)
    .filter((d): d is number => d !== null)

  const mediana = (arr: number[]) => {
    if (arr.length === 0) return null
    const mid = Math.floor(arr.length / 2)
    return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2
  }

  const totalPedidos = stats.reduce((s, st) => s + st.totalPedidos, 0)
  const totalEntregados = stats.reduce((s, st) => s + st.entregados, 0)
  const totalNoEntregados = stats.reduce((s, st) => s + st.noEntregados, 0)

  return {
    totalEmbarques: activos.length,
    duracionPromedioMin:
      duraciones.length > 0
        ? Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length)
        : null,
    duracionMedianaMin: mediana(duraciones),
    duracionMinMin: duraciones.length > 0 ? duraciones[0] : null,
    duracionMaxMin:
      duraciones.length > 0 ? duraciones[duraciones.length - 1] : null,
    entregasPorHoraPromedio:
      entregasHora.length > 0
        ? Math.round(
            (entregasHora.reduce((a, b) => a + b, 0) / entregasHora.length) *
              10,
          ) / 10
        : null,
    tasaEntregaPromedio:
      stats.length > 0
        ? stats.reduce((s, st) => s + st.tasaEntrega, 0) / stats.length
        : 0,
    tasaNoEntregaPromedio:
      stats.length > 0
        ? stats.reduce((s, st) => s + st.tasaNoEntrega, 0) / stats.length
        : 0,
    tiempoPreparacionPromedioMin:
      preparaciones.length > 0
        ? Math.round(
            preparaciones.reduce((a, b) => a + b, 0) / preparaciones.length,
          )
        : null,
    discrepanciaPromedioPct:
      stats.length > 0
        ? stats.reduce((s, st) => s + st.discrepanciaPct, 0) / stats.length
        : 0,
    totalPedidos,
    totalEntregados,
    totalNoEntregados,
  }
}

export function calcularStatsPorTrabajador(
  embarques: EmbarqueStatsInput[],
): StatsPorTrabajador[] {
  // FIX #24: Include CERRADO and EN_RUTA
  const activos = embarques.filter((e) => e.estado === 'CERRADO' || e.estado === 'EN_RUTA')
  const porTrabajador = new Map<string, EmbarqueStatsInput[]>()

  for (const e of activos) {
    const arr = porTrabajador.get(e.trabajadorId) || []
    arr.push(e)
    porTrabajador.set(e.trabajadorId, arr)
  }

  const results: StatsPorTrabajador[] = []

  for (const [trabajadorId, embs] of porTrabajador) {
    const stats = embs.map(calcularStatsEmbarque)
    const nombre = embs[0].trabajadorNombre

    const duraciones = stats
      .map((s) => s.duracionMin)
      .filter((d): d is number => d !== null)
    const entregasHora = stats
      .map((s) => s.entregasPorHora)
      .filter((d): d is number => d !== null)

    const totalPedidos = stats.reduce((s, st) => s + st.totalPedidos, 0)
    const totalEntregados = stats.reduce((s, st) => s + st.entregados, 0)

    results.push({
      trabajadorId,
      nombre,
      totalEmbarques: embs.length,
      duracionPromedioMin:
        duraciones.length > 0
          ? Math.round(
              duraciones.reduce((a, b) => a + b, 0) / duraciones.length,
            )
          : null,
      entregasPorHoraPromedio:
        entregasHora.length > 0
          ? Math.round(
              (entregasHora.reduce((a, b) => a + b, 0) / entregasHora.length) *
                10,
            ) / 10
          : null,
      tasaEntrega:
        stats.length > 0
          ? stats.reduce((s, st) => s + st.tasaEntrega, 0) / stats.length
          : 0,
      tasaNoEntrega:
        stats.length > 0
          ? stats.reduce((s, st) => s + st.tasaNoEntrega, 0) / stats.length
          : 0,
      discrepanciaPct:
        stats.length > 0
          ? stats.reduce((s, st) => s + st.discrepanciaPct, 0) / stats.length
          : 0,
      totalPedidos,
      totalEntregados,
    })
  }

  // Ordenar por tasa de entrega (mejor primero)
  results.sort((a, b) => b.tasaEntrega - a.tasaEntrega)
  return results
}

export function calcularStatsPorRuta(
  embarques: EmbarqueStatsInput[],
): StatsPorRuta[] {
  // FIX #24: Include CERRADO and EN_RUTA
  const activos = embarques.filter((e) => e.estado === 'CERRADO' || e.estado === 'EN_RUTA')
  const porRuta = new Map<string | null, EmbarqueStatsInput[]>()

  for (const e of activos) {
    const key = e.rutaId
    const arr = porRuta.get(key) || []
    arr.push(e)
    porRuta.set(key, arr)
  }

  const results: StatsPorRuta[] = []

  for (const [rutaId, embs] of porRuta) {
    const stats = embs.map(calcularStatsEmbarque)
    const nombre = embs[0].rutaNombre

    const duraciones = stats
      .map((s) => s.duracionMin)
      .filter((d): d is number => d !== null)
    const entregasHora = stats
      .map((s) => s.entregasPorHora)
      .filter((d): d is number => d !== null)

    const totalPedidos = stats.reduce((s, st) => s + st.totalPedidos, 0)
    const totalEntregados = stats.reduce((s, st) => s + st.entregados, 0)

    results.push({
      rutaId,
      nombre,
      totalEmbarques: embs.length,
      duracionPromedioMin:
        duraciones.length > 0
          ? Math.round(
              duraciones.reduce((a, b) => a + b, 0) / duraciones.length,
            )
          : null,
      entregasPorHoraPromedio:
        entregasHora.length > 0
          ? Math.round(
              (entregasHora.reduce((a, b) => a + b, 0) / entregasHora.length) *
                10,
            ) / 10
          : null,
      tasaEntrega:
        stats.length > 0
          ? stats.reduce((s, st) => s + st.tasaEntrega, 0) / stats.length
          : 0,
      tasaNoEntrega:
        stats.length > 0
          ? stats.reduce((s, st) => s + st.tasaNoEntrega, 0) / stats.length
          : 0,
      totalPedidos,
      totalEntregados,
    })
  }

  results.sort((a, b) => b.tasaEntrega - a.tasaEntrega)
  return results
}

export function calcularTendenciaDiaria(
  embarques: EmbarqueStatsInput[],
): TendenciaDiaria[] {
  // FIX #24: Include CERRADO and EN_RUTA
  const activos = embarques.filter((e) => e.estado === 'CERRADO' || e.estado === 'EN_RUTA')
  const porDia = new Map<string, EmbarqueStatsInput[]>()

  for (const e of activos) {
    const dia = new Date(e.fecha).toISOString().split('T')[0]
    const arr = porDia.get(dia) || []
    arr.push(e)
    porDia.set(dia, arr)
  }

  const results: TendenciaDiaria[] = []

  for (const [fecha, embs] of porDia) {
    const stats = embs.map(calcularStatsEmbarque)
    const duraciones = stats
      .map((s) => s.duracionMin)
      .filter((d): d is number => d !== null)
    const entregasHora = stats
      .map((s) => s.entregasPorHora)
      .filter((d): d is number => d !== null)

    results.push({
      fecha,
      totalEmbarques: embs.length,
      duracionPromedioMin:
        duraciones.length > 0
          ? Math.round(
              duraciones.reduce((a, b) => a + b, 0) / duraciones.length,
            )
          : null,
      entregasPorHoraPromedio:
        entregasHora.length > 0
          ? Math.round(
              (entregasHora.reduce((a, b) => a + b, 0) / entregasHora.length) *
                10,
            ) / 10
          : null,
      tasaEntrega:
        stats.length > 0
          ? stats.reduce((s, st) => s + st.tasaEntrega, 0) / stats.length
          : 0,
    })
  }

  results.sort((a, b) => a.fecha.localeCompare(b.fecha))
  return results
}
