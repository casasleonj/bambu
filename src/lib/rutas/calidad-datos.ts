/**
 * Métricas de calidad de datos geográficos (F0 §10, v4 §38).
 *
 * El motor del planificador necesita coords o al menos barrio. Estas métricas
 * dicen si la base alcanza o si hace falta un backfill
 * (`scripts/backfill-coords-clientes.ts`).
 */

import { prisma } from '@/lib/prisma'

export interface CalidadDatosGeo {
  clientesActivos: number
  conCoords: number
  conBarrio: number
  conRuta: number
  sinGeoUtil: number
  barriosDistintos: number
  conLinkUbicacion: number
  negociosActivos: number
  negociosConCoords: number
  pctCoords: number
  pctBarrio: number
  /** Cobertura efectiva sobre la demanda real de los últimos 60 días. */
  demanda60d: {
    pedidos: number
    conCoordsEfectivas: number
    conBarrioEfectivo: number
    pctCoords: number
  }
  /** Recomendación derivada. */
  recomendacion: 'OK' | 'BACKFILL_SUGERIDO' | 'BACKFILL_NECESARIO'
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((100 * n) / d * 10) / 10
}

export async function calcularCalidadDatosGeo(): Promise<CalidadDatosGeo> {
  const hace60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)

  const [
    clientesActivos,
    conCoords,
    conBarrio,
    conRuta,
    conLink,
    barrios,
    negociosActivos,
    negociosConCoords,
    pedidos60,
  ] = await Promise.all([
    prisma.cliente.count({ where: { activo: true } }),
    prisma.cliente.count({ where: { activo: true, lat: { not: null }, lng: { not: null } } }),
    prisma.cliente.count({ where: { activo: true, barrio: { not: null } } }),
    prisma.cliente.count({ where: { activo: true, rutaId: { not: null } } }),
    prisma.cliente.count({ where: { activo: true, linkUbicacion: { not: null } } }),
    prisma.cliente.findMany({
      where: { activo: true, barrio: { not: null } },
      select: { barrio: true },
      distinct: ['barrio'],
    }),
    prisma.negocio.count({ where: { activo: true } }),
    prisma.negocio.count({ where: { activo: true, lat: { not: null }, lng: { not: null } } }),
    prisma.pedido.findMany({
      where: { estadoEntrega: 'ENTREGADO', fecha: { gt: hace60 } },
      select: {
        barrioEntrega: true,
        cliente: { select: { lat: true, barrio: true } },
        negocio: { select: { lat: true, barrio: true } },
      },
    }),
  ])

  const sinGeoUtil = await prisma.cliente.count({
    where: { activo: true, lat: null, OR: [{ barrio: null }, { barrio: '' }] },
  })

  const demandaConCoords = pedidos60.filter((p) => p.negocio?.lat != null || p.cliente.lat != null).length
  const demandaConBarrio = pedidos60.filter(
    (p) => p.barrioEntrega || p.negocio?.barrio || p.cliente.barrio,
  ).length

  const pctCoords = pct(conCoords, clientesActivos)
  const pctBarrio = pct(conBarrio, clientesActivos)
  const pctDemandaCoords = pct(demandaConCoords, pedidos60.length)

  // Si no hay demanda reciente, la señal es la cobertura a nivel cliente.
  // Si la hay, pesa más la cobertura efectiva sobre la demanda real.
  const coberturaCoords = pedidos60.length >= 10 ? pctDemandaCoords : pctCoords
  let recomendacion: CalidadDatosGeo['recomendacion'] = 'OK'
  if (coberturaCoords < 60 || pctBarrio < 85) recomendacion = 'BACKFILL_NECESARIO'
  else if (coberturaCoords < 80) recomendacion = 'BACKFILL_SUGERIDO'

  return {
    clientesActivos,
    conCoords,
    conBarrio,
    conRuta,
    sinGeoUtil,
    barriosDistintos: barrios.filter((b) => b.barrio && b.barrio.trim()).length,
    conLinkUbicacion: conLink,
    negociosActivos,
    negociosConCoords,
    pctCoords,
    pctBarrio,
    demanda60d: {
      pedidos: pedidos60.length,
      conCoordsEfectivas: demandaConCoords,
      conBarrioEfectivo: demandaConBarrio,
      pctCoords: pctDemandaCoords,
    },
    recomendacion,
  }
}
