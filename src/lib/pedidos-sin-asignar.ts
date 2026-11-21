/**
 * #929: una sola fuente de riesgo operativo para banner, filtro y tarjetas.
 * El conteo "atrasados sin asignar" sigue siendo distinto: pendientes de días
 * previos, aunque aún no hayan alcanzado el umbral de minutos hábiles.
 */
import { prisma } from '@/lib/prisma'
import { startOfDayBogota, endOfDayBogota, subDaysBogota } from '@/lib/dates'
import { pickRutaId } from '@/lib/pedido-ruta'
import type { Turno } from '@/lib/business-hours'
import { getConfigs, getConfigNumber } from '@/lib/config'
import { elegibleRiesgoOperativo, evaluarRiesgoPorTiempo, riesgoPorEmbarques, type RiesgoOperativo } from '@/lib/pedidos-riesgo-operativo'
import type { Prisma } from '@prisma/client'

export function whereAtrasadosSinAsignar(): Prisma.PedidoWhereInput {
  return {
    // FIX: incluye NO_ENTREGADO además de PENDIENTE. Un pedido que se
    // despachó y no se pudo entregar (y no se reasignó a otro embarque en
    // el cierre — ver ADR-REASIGNACION-001) queda estadoEntrega=NO_ENTREGADO
    // con embarqueId=null, y ese estado NUNCA vuelve a PENDIENTE por sí
    // solo. Antes esta vista solo miraba PENDIENTE, así que esos pedidos
    // "atrapados" quedaban invisibles para siempre en ambos banners de
    // riesgo (ver también findPedidosHoyEnRiesgoIds más abajo).
    estadoEntrega: { in: ['PENDIENTE', 'NO_ENTREGADO'] },
    embarqueId: null,
    fecha: { lt: startOfDayBogota() },
  }
}

export async function countPedidosAtrasadosSinAsignar(): Promise<number> {
  return prisma.pedido.count({ where: whereAtrasadosSinAsignar() })
}

/** Umbral de embarques CERRADO hoy a partir del cual un pedido de hoy sin
 *  asignar se considera "en riesgo" de un próximo ciclo también sin asignar. */
export const UMBRAL_EMBARQUES_RIESGO = 3

/** Defaults si no hay Config configurado — horario típico de una operación
 *  de reparto: mañana 6-12, tarde 2-5pm (con almuerzo de por medio). */
const DEFAULT_TURNOS: Turno[] = [
  { inicio: '06:00', fin: '12:00' },
  { inicio: '14:00', fin: '17:00' },
]
const DEFAULT_UMBRAL_HORAS_HABILES_RIESGO = 2

function esHHMM(v: string | undefined): v is string {
  return !!v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
}

/** Lee turnos de trabajo + umbral de horas hábiles desde Config, con
 *  defaults sensatos si no están configurados (ver claves en
 *  configuracion-client.tsx, sección "Parámetros de Operación"). */
export async function getTurnosYUmbralRiesgo(): Promise<{ turnos: Turno[]; umbralHoras: number }> {
  const cfg = await getConfigs([
    'HORARIO_MANANA_INICIO',
    'HORARIO_MANANA_FIN',
    'HORARIO_TARDE_INICIO',
    'HORARIO_TARDE_FIN',
  ])
  const turnos: Turno[] = []
  if (esHHMM(cfg.HORARIO_MANANA_INICIO) && esHHMM(cfg.HORARIO_MANANA_FIN) && cfg.HORARIO_MANANA_INICIO < cfg.HORARIO_MANANA_FIN) {
    turnos.push({ inicio: cfg.HORARIO_MANANA_INICIO, fin: cfg.HORARIO_MANANA_FIN })
  }
  if (esHHMM(cfg.HORARIO_TARDE_INICIO) && esHHMM(cfg.HORARIO_TARDE_FIN) && cfg.HORARIO_TARDE_INICIO < cfg.HORARIO_TARDE_FIN) {
    turnos.push({ inicio: cfg.HORARIO_TARDE_INICIO, fin: cfg.HORARIO_TARDE_FIN })
  }
  const umbralHoras = await getConfigNumber('UMBRAL_HORAS_HABILES_RIESGO', DEFAULT_UMBRAL_HORAS_HABILES_RIESGO)
  return { turnos: turnos.length > 0 ? turnos : DEFAULT_TURNOS, umbralHoras: Number.isFinite(umbralHoras) && umbralHoras > 0 ? umbralHoras : DEFAULT_UMBRAL_HORAS_HABILES_RIESGO }
}

/**
 * El mapa incluye motivos por tiempo de cualquier fecha operativa y el motivo
 * vigente de 3 embarques cerrados para pendientes del día. El tiempo se toma
 * desde createdAt, no desde Pedido.fecha, que puede ser una fecha operativa.
 * Se consultan candidatos por lotes: nunca hay polling ni N+1 por tarjeta.
 */
export async function findPedidosEnRiesgo(): Promise<Map<string, RiesgoOperativo>> {
  const desde = startOfDayBogota()
  const hasta = endOfDayBogota()
  const ahora = new Date()

  const camposRiesgo = {
    id: true, fecha: true, createdAt: true, fechaEntrega: true,
    estadoEntrega: true, embarqueId: true,
    items: { select: { cantEntrega: true, cantRegaloEntrega: true } },
    cPacaAguaEnt: true, cPacaHieloEnt: true, cBotellonFabEnt: true,
    cBotellonDomEnt: true, cBolsaAguaEnt: true, cBolsaHieloEnt: true,
  } as const

  const [candidatosPendientes, candidatosEnRuta, { turnos, umbralHoras }] = await Promise.all([
    prisma.pedido.findMany({
      where: {
        estadoEntrega: { in: ['PENDIENTE', 'NO_ENTREGADO'] },
        embarqueId: null,
        // Los anteriores deben seguir acumulando horas. Futuro no es pendiente hoy.
        fecha: { lte: hasta },
      },
      select: {
        ...camposRiesgo,
        cliente: { select: { rutaId: true } },
        negocio: { select: { rutaId: true } },
      },
    }),
    prisma.pedido.findMany({
      where: {
        estadoEntrega: 'EN_RUTA',
        // Guard defensivo existente para el estado transitorio EN_RUTA.
        fecha: { gte: subDaysBogota(365) },
      },
      select: camposRiesgo,
    }),
    getTurnosYUmbralRiesgo(),
  ])

  const riesgos = new Map<string, RiesgoOperativo>()
  for (const p of [...candidatosPendientes, ...candidatosEnRuta]) {
    const riesgo = evaluarRiesgoPorTiempo(p, ahora, turnos, umbralHoras)
    if (riesgo) riesgos.set(p.id, riesgo)
  }

  // Esta segunda regla NO se calcula para pendientes de ayer: sus ciclos de
  // embarque fueron distintos. La regla temporal anterior sí cruza días.
  const pendientesHoy = candidatosPendientes.filter(p =>
    p.fecha >= desde && p.fecha <= hasta && elegibleRiesgoOperativo(p, ahora)
  )
  if (pendientesHoy.length) {
    const conRuta = pendientesHoy.map(p => ({
      pedido: p,
      rutaId: pickRutaId({ cliente: p.cliente, negocio: p.negocio }),
    }))
    const rutaIds = [...new Set(conRuta.map(c => c.rutaId).filter((id): id is string => id !== null))]
    const [porRuta, globalCerrados] = await Promise.all([
      rutaIds.length
        ? prisma.embarque.groupBy({
            by: ['rutaId'],
            where: { rutaId: { in: rutaIds }, fecha: { gte: desde, lte: hasta }, estado: 'CERRADO' },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      prisma.embarque.count({ where: { fecha: { gte: desde, lte: hasta }, estado: 'CERRADO' } }),
    ])
    const cerradosPorRuta = new Map(porRuta.map(r => [r.rutaId as string, r._count._all]))
    for (const c of conRuta) {
      const cerrados = c.rutaId !== null ? (cerradosPorRuta.get(c.rutaId) ?? 0) : globalCerrados
      if (cerrados >= UMBRAL_EMBARQUES_RIESGO && !riesgos.has(c.pedido.id)) {
        riesgos.set(c.pedido.id, riesgoPorEmbarques(c.pedido))
      }
    }
  }

  return riesgos
}

/** Nombre legacy conservado para consumidores; ahora incluye pendientes anteriores. */
export async function findPedidosHoyEnRiesgoIds(): Promise<string[]> {
  return [...(await findPedidosEnRiesgo()).keys()]
}

export async function countPedidosHoyEnRiesgo(): Promise<number> {
  const ids = await findPedidosHoyEnRiesgoIds()
  return ids.length
}
