import { prisma } from './prisma'

export interface BarrioAnalysis {
  barrio: string
  totalEntregas: number
  repartidores: Array<{
    trabajadorId: string
    nombre: string
    entregas: number
    porcentaje: number
  }>
  repartidorSugerido?: {
    trabajadorId: string
    nombre: string
    confianza: number // 0-100
  }
  conflicto?: boolean
  conflictoDetalle?: string
}

export interface RutaConflict {
  barrio: string
  repartidorActual: string
  repartidorInvadiendo: string
  entregasInvadiendo: number
  severidad: 'baja' | 'media' | 'alta'
}

export async function analizarPatronesEntrega(): Promise<{
  barrios: BarrioAnalysis[]
  conflictos: RutaConflict[]
  sugerencias: Array<{
    tipo: 'asignar' | 'unificar' | 'investigar'
    barrio: string
    mensaje: string
    datos: Record<string, unknown>
  }>
}> {
  // Obtener pedidos ENTREGADOS que tengan embarque con repartidor
  const pedidos = await prisma.pedido.findMany({
    where: {
      estado: 'ENTREGADO',
      embarqueId: { not: null },
    },
    include: {
      embarque: {
        include: {
          trabajador: true,
        },
      },
      cliente: {
        select: {
          barrio: true,
          rutaId: true,
        },
      },
    },
    orderBy: { fecha: 'desc' },
    take: 5000, // Limitar para performance
  })

  // Agrupar por barrio
  const barrioStats: Record<
    string,
    {
      entregas: number
      repartidores: Record<
        string,
        { id: string; nombre: string; entregas: number }
      >
      rutaId?: string
    }
  > = {}

  for (const pedido of pedidos) {
    const barrio = pedido.cliente?.barrio?.trim() || 'SIN_BARRIO'
    if (!barrioStats[barrio]) {
      barrioStats[barrio] = {
        entregas: 0,
        repartidores: {},
        rutaId: pedido.cliente?.rutaId || undefined,
      }
    }

    barrioStats[barrio].entregas++

    const trabajadorId = pedido.embarque?.trabajadorId
    const trabajadorNombre = pedido.embarque?.trabajador?.nombre || 'Desconocido'

    if (trabajadorId) {
      if (!barrioStats[barrio].repartidores[trabajadorId]) {
        barrioStats[barrio].repartidores[trabajadorId] = {
          id: trabajadorId,
          nombre: trabajadorNombre,
          entregas: 0,
        }
      }
      barrioStats[barrio].repartidores[trabajadorId].entregas++
    }
  }

  // Analizar cada barrio
  const barrios: BarrioAnalysis[] = []
  const conflictos: RutaConflict[] = []
  const sugerencias: Array<{
    tipo: 'asignar' | 'unificar' | 'investigar'
    barrio: string
    mensaje: string
    datos: Record<string, unknown>
  }> = []

  for (const [barrio, stats] of Object.entries(barrioStats)) {
    const repartidoresOrdenados = Object.values(stats.repartidores)
      .sort((a, b) => b.entregas - a.entregas)
      .map((r) => ({
        trabajadorId: r.id,
        nombre: r.nombre,
        entregas: r.entregas,
        porcentaje: Math.round((r.entregas / stats.entregas) * 100),
      }))

    const principal = repartidoresOrdenados[0]
    const sugerencia = principal && principal.porcentaje >= 70
      ? {
          trabajadorId: principal.trabajadorId,
          nombre: principal.nombre,
          confianza: principal.porcentaje,
        }
      : undefined

    // Detectar conflictos
    const hayConflicto = repartidoresOrdenados.length > 1 &&
      repartidoresOrdenados[0].porcentaje < 85

    if (hayConflicto) {
      conflictos.push({
        barrio,
        repartidorActual: repartidoresOrdenados[0].nombre,
        repartidorInvadiendo: repartidoresOrdenados[1].nombre,
        entregasInvadiendo: repartidoresOrdenados[1].entregas,
        severidad: repartidoresOrdenados[1].porcentaje > 30 ? 'alta' : 'media',
      })
    }

    barrios.push({
      barrio,
      totalEntregas: stats.entregas,
      repartidores: repartidoresOrdenados,
      repartidorSugerido: sugerencia,
      conflicto: hayConflicto,
      conflictoDetalle: hayConflicto
        ? `${repartidoresOrdenados[1].nombre} entregó ${repartidoresOrdenados[1].entregas} veces en ${barrio}`
        : undefined,
    })

    // Generar sugerencias
    if (!stats.rutaId && principal && principal.porcentaje >= 60) {
      sugerencias.push({
        tipo: 'asignar',
        barrio,
        mensaje: `Asignar ${barrio} a ruta de ${principal.nombre} (${principal.porcentaje}% de entregas)`,
        datos: { repartidorId: principal.trabajadorId, entregas: stats.entregas },
      })
    }
  }

  // Detectar barrios sin asignar
  const barriosSinAsignar = barrios.filter(
    (b) => b.barrio !== 'SIN_BARRIO' && !b.repartidorSugerido
  )

  for (const b of barriosSinAsignar) {
    if (b.totalEntregas >= 5) {
      sugerencias.push({
        tipo: 'investigar',
        barrio: b.barrio,
        mensaje: `${b.barrio} tiene ${b.totalEntregas} entregas pero sin patrón claro`,
        datos: { repartidores: b.repartidores.length, entregas: b.totalEntregas },
      })
    }
  }

  // Ordenar por relevancia
  barrios.sort((a, b) => b.totalEntregas - a.totalEntregas)
  conflictos.sort((a, b) => {
    const sev = { alta: 3, media: 2, baja: 1 }
    return sev[b.severidad] - sev[a.severidad]
  })

  return { barrios, conflictos, sugerencias }
}

export async function obtenerRepartidoresActivos() {
  return prisma.trabajador.findMany({
    where: {
      activo: true,
      rol: 'REPARTIDOR',
    },
    select: {
      id: true,
      nombre: true,
    },
    orderBy: { nombre: 'asc' },
  })
}

export async function obtenerBarriosSinRuta() {
  const clientes = await prisma.cliente.findMany({
    where: {
      activo: true,
      rutaId: null,
      barrio: { not: null },
    },
    select: {
      barrio: true,
    },
    distinct: ['barrio'],
  })

  return clientes
    .map((c) => c.barrio?.trim())
    .filter(Boolean) as string[]
}
