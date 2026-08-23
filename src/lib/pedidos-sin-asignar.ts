/**
 * Dos reglas relacionadas de "pedido operacionalmente en riesgo por falta
 * de gestión", ambas viven aquí para que el dashboard, el badge de
 * Pedidos y el filtro de la API nunca muestren números distintos entre sí:
 *
 * 1. `whereAtrasadosSinAsignar` / `countPedidosAtrasadosSinAsignar` —
 *    pendiente, sin embarque, de un día ANTERIOR a hoy (Bogotá).
 * 2. `findPedidosHoyEnRiesgoIds` / `countPedidosHoyEnRiesgo` — pedidos que
 *    llevan demasiado tiempo sin resolverse. Dos sub-reglas, unidas con OR
 *    (cualquiera de las dos marca "en riesgo"):
 *    a) PENDIENTE sin embarque **de HOY**, cuya ruta ya tuvo 3+ embarques
 *       CERRADO hoy (o, sin ruta resoluble, si CUALQUIER ruta ya tuvo 3+ —
 *       ver comentario en la función). Acotado a hoy porque los días
 *       anteriores ya los cubre `whereAtrasadosSinAsignar`.
 *    b) PENDIENTE sin embarque de HOY, O **EN_RUTA sin entregar de
 *       CUALQUIER DÍA**, cuyo tiempo hábil transcurrido desde `pedido.fecha`
 *       (contando solo horas de trabajo, ver `src/lib/business-hours.ts`)
 *       supera `UMBRAL_HORAS_HABILES_RIESGO`. Esto cubre "se creó a las 6am
 *       y a las 4:40pm sigue sin gestionar" sin importar cuántos embarques
 *       haya habido — y, para EN_RUTA, cubre pedidos ya asignados que
 *       quedaron atascados en la calle sin entregar SIN IMPORTAR CUÁNTOS
 *       DÍAS lleven así, porque no hay ninguna otra regla que los cubra
 *       (`whereAtrasadosSinAsignar` exige `embarqueId=null`, que un EN_RUTA
 *       nunca cumple).
 *
 * Ver plan en docs/superpowers/... (o AGENTS.md) para el contexto completo.
 */
import { prisma } from '@/lib/prisma'
import { startOfDayBogota, endOfDayBogota, subDaysBogota } from '@/lib/dates'
import { pickRutaId } from '@/lib/pedido-ruta'
import { minutosHabilesTranscurridos, type Turno } from '@/lib/business-hours'
import { getConfigs, getConfigNumber } from '@/lib/config'
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
  return !!v && /^\d{2}:\d{2}$/.test(v)
}

/** Lee turnos de trabajo + umbral de horas hábiles desde Config, con
 *  defaults sensatos si no están configurados (ver claves en
 *  configuracion-client.tsx, sección "Parámetros de Operación"). */
async function getTurnosYUmbralRiesgo(): Promise<{ turnos: Turno[]; umbralHoras: number }> {
  const cfg = await getConfigs([
    'HORARIO_MANANA_INICIO',
    'HORARIO_MANANA_FIN',
    'HORARIO_TARDE_INICIO',
    'HORARIO_TARDE_FIN',
  ])
  const turnos: Turno[] = []
  if (esHHMM(cfg.HORARIO_MANANA_INICIO) && esHHMM(cfg.HORARIO_MANANA_FIN)) {
    turnos.push({ inicio: cfg.HORARIO_MANANA_INICIO, fin: cfg.HORARIO_MANANA_FIN })
  }
  if (esHHMM(cfg.HORARIO_TARDE_INICIO) && esHHMM(cfg.HORARIO_TARDE_FIN)) {
    turnos.push({ inicio: cfg.HORARIO_TARDE_INICIO, fin: cfg.HORARIO_TARDE_FIN })
  }
  const umbralHoras = await getConfigNumber('UMBRAL_HORAS_HABILES_RIESGO', DEFAULT_UMBRAL_HORAS_HABILES_RIESGO)
  return { turnos: turnos.length > 0 ? turnos : DEFAULT_TURNOS, umbralHoras }
}

/**
 * Pedidos en riesgo de quedar sin gestionar (PENDIENTE sin asignar de hoy, o
 * EN_RUTA atascado de cualquier día). Dos sub-reglas independientes unidas
 * con OR — ver comentario de cabecera del archivo.
 *
 * IMPORTANTE (cerrado — antes era un gap) — un pedido asignado a un
 * embarque y luego marcado NO_ENTREGADO al cerrar ese embarque NO vuelve a
 * PENDIENTE (queda en estadoEntrega=NO_ENTREGADO, ver
 * procesar-pedido.service.ts). Ambas sub-reglas de esta función y
 * `whereAtrasadosSinAsignar` ahora tratan NO_ENTREGADO igual que PENDIENTE
 * (mismo `embarqueId: null`), así que un pedido "atrapado" sin reasignar sí
 * se detecta — de HOY vía la sub-regla (a), de días anteriores vía
 * `whereAtrasadosSinAsignar`. La sub-regla (b) cubre además EN_RUTA
 * atascado, sin límite de días — confirmado necesario en producción: se
 * encontraron pedidos EN_RUTA de hasta ~2 meses de antigüedad, invisibles
 * para cualquier otra regla (ver hallazgo en sesión del 2026-08-15).
 *
 * IMPORTANTE — `Cliente.rutaId` no tiene flujo de escritura en la UI (solo
 * `Negocio.rutaId` es editable), así que la mayoría de pedidos de domicilio
 * no tendrán ruta resoluble vía `pickRutaId`. Para esos, la sub-regla (a) en
 * vez de quedar invisible (punto ciego), usa un fallback más grueso: en
 * riesgo si CUALQUIER ruta ya tuvo `UMBRAL_EMBARQUES_RIESGO`+ embarques
 * cerrados hoy. Es una decisión consciente de más recall a costa de
 * precisión. La sub-regla (b) no depende de ruta, así que no tiene este gap.
 */
export async function findPedidosHoyEnRiesgoIds(): Promise<string[]> {
  const desde = startOfDayBogota()
  const hasta = endOfDayBogota()
  const ahora = new Date()

  const [candidatosPendientes, candidatosEnRuta, { turnos, umbralHoras }] = await Promise.all([
    prisma.pedido.findMany({
      where: {
        // FIX: mismo motivo que whereAtrasadosSinAsignar — un NO_ENTREGADO
        // de HOY sin reasignar es tan "sin gestionar" como un PENDIENTE sin
        // asignar de hoy, y whereAtrasadosSinAsignar solo cubre días
        // anteriores (fecha < hoy).
        estadoEntrega: { in: ['PENDIENTE', 'NO_ENTREGADO'] },
        embarqueId: null,
        fecha: { gte: desde, lte: hasta },
      },
      select: {
        id: true,
        fecha: true,
        cliente: { select: { rutaId: true } },
        negocio: { select: { rutaId: true } },
      },
    }),
    // Sin acotar a "hoy" a propósito (ver comentario de la función):
    // un EN_RUTA atascado sigue siendo una señal válida sin importar cuántos
    // días lleve. `subDaysBogota(365)` es solo un guard defensivo contra un
    // full scan si la tabla crece mucho — EN_RUTA es un estado transitorio
    // en operación normal, así que en la práctica esto no filtra casos reales.
    prisma.pedido.findMany({
      where: {
        estadoEntrega: 'EN_RUTA',
        fecha: { gte: subDaysBogota(365) },
      },
      select: { id: true, fecha: true },
    }),
    getTurnosYUmbralRiesgo(),
  ])

  const umbralMinutos = umbralHoras * 60
  const enRiesgoPorTiempo = new Set<string>()
  for (const p of [...candidatosPendientes, ...candidatosEnRuta]) {
    if (minutosHabilesTranscurridos(p.fecha, ahora, turnos) >= umbralMinutos) {
      enRiesgoPorTiempo.add(p.id)
    }
  }

  const enRiesgoPorEmbarques = new Set<string>()
  if (candidatosPendientes.length > 0) {
    const conRuta = candidatosPendientes.map((c) => ({
      id: c.id,
      rutaId: pickRutaId({ cliente: c.cliente, negocio: c.negocio }),
    }))
    const rutaIds = [...new Set(conRuta.map((c) => c.rutaId).filter((r): r is string => r !== null))]

    const [porRuta, globalCerrados] = await Promise.all([
      rutaIds.length > 0
        ? prisma.embarque.groupBy({
            by: ['rutaId'],
            where: { rutaId: { in: rutaIds }, fecha: { gte: desde, lte: hasta }, estado: 'CERRADO' },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      prisma.embarque.count({ where: { fecha: { gte: desde, lte: hasta }, estado: 'CERRADO' } }),
    ])

    const cerradosPorRuta = new Map(porRuta.map((r) => [r.rutaId as string, r._count._all]))
    for (const c of conRuta) {
      const cerrados = c.rutaId !== null ? (cerradosPorRuta.get(c.rutaId) ?? 0) : globalCerrados
      if (cerrados >= UMBRAL_EMBARQUES_RIESGO) enRiesgoPorEmbarques.add(c.id)
    }
  }

  return [...new Set([...enRiesgoPorTiempo, ...enRiesgoPorEmbarques])]
}

export async function countPedidosHoyEnRiesgo(): Promise<number> {
  const ids = await findPedidosHoyEnRiesgoIds()
  return ids.length
}
