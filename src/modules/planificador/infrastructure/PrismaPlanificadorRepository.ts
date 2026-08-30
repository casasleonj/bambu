/**
 * Repositorio del planificador (ADR-PLANIFICADOR-001).
 *
 * Lee de Pedido/Cliente/Negocio/Trabajador/Ruta (por id, sin FK — el
 * planificador no es dueño de esos dominios). Persiste el árbol
 * PlanDia → PlanGrupo → PlanParada → PlanActividad + PlanExcepcion.
 */

import type { $Enums } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { startOfDayBogota, endOfDayBogota } from '@/lib/dates'
import { pickRutaId } from '@/lib/pedido-ruta'
import { wherePedidosElegiblesPlan } from '../domain/services/elegibilidad.service'
import type { CandidatoPedido, Propuesta } from '../application/construir-propuesta'

type PlanEstado = $Enums.PlanEstado

export interface DatosGeneracion {
  candidatos: CandidatoPedido[]
  repartidoresDisponibles: Array<{ id: string; nombre: string; rutaIdsPreferidas: string[] }>
  nombresRuta: Record<string, string>
}

export class PrismaPlanificadorRepository {
  /** Carga todo lo necesario para generar el plan de `fecha` (YYYY-MM-DD Bogotá). */
  async cargarDatos(fecha: string): Promise<DatosGeneracion> {
    const [pedidos, repartidores, embarquesHoy, rutas] = await Promise.all([
      prisma.pedido.findMany({
        where: wherePedidosElegiblesPlan(fecha),
        select: {
          id: true,
          clienteId: true,
          negocioId: true,
          barrioEntrega: true,
          cPacaAguaPed: true,
          cPacaHieloPed: true,
          cBotellonFabPed: true,
          cBotellonDomPed: true,
          cBolsaAguaPed: true,
          cBolsaHieloPed: true,
          cliente: {
            select: {
              id: true, nombre: true, barrio: true, rutaId: true,
              lat: true, lng: true, geocodeOrigen: true, geocodeAt: true,
            },
          },
          negocio: {
            select: { id: true, nombre: true, barrio: true, rutaId: true, lat: true, lng: true },
          },
        },
        orderBy: { fecha: 'asc' },
      }),
      prisma.trabajador.findMany({
        where: { rol: 'REPARTIDOR', activo: true, usaMoto: true },
        select: { id: true, nombre: true, rutasAsignadas: { select: { id: true } } },
      }),
      prisma.embarque.findMany({
        where: {
          fecha: { gte: startOfDayBogota(fecha), lte: endOfDayBogota(fecha) },
          estado: { in: ['ABIERTO', 'EN_RUTA'] },
        },
        select: { trabajadorId: true },
        distinct: ['trabajadorId'],
      }),
      prisma.ruta.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
    ])

    const ocupados = new Set(embarquesHoy.map((e) => e.trabajadorId))
    const repartidoresDisponibles = repartidores
      .filter((r) => !ocupados.has(r.id))
      .map((r) => ({ id: r.id, nombre: r.nombre, rutaIdsPreferidas: r.rutasAsignadas.map((x) => x.id) }))

    const nombresRuta = Object.fromEntries(rutas.map((r) => [r.id, r.nombre]))

    const candidatos: CandidatoPedido[] = pedidos.map((p) => ({
      pedidoId: p.id,
      clienteId: p.clienteId,
      negocioId: p.negocioId,
      cantidades: {
        cPacaAguaPed: p.cPacaAguaPed,
        cPacaHieloPed: p.cPacaHieloPed,
        cBotellonFabPed: p.cBotellonFabPed,
        cBotellonDomPed: p.cBotellonDomPed,
        cBolsaAguaPed: p.cBolsaAguaPed,
        cBolsaHieloPed: p.cBolsaHieloPed,
      },
      rutaId: pickRutaId({ cliente: p.cliente, negocio: p.negocio }),
      clienteNombre: p.cliente.nombre,
      geo: {
        pedidoId: p.id,
        clienteId: p.clienteId,
        negocioId: p.negocioId,
        barrioEntrega: p.barrioEntrega,
        cliente: {
          lat: p.cliente.lat,
          lng: p.cliente.lng,
          barrio: p.cliente.barrio,
          geocodeOrigen: p.cliente.geocodeOrigen,
          geocodeAt: p.cliente.geocodeAt,
          nombre: p.cliente.nombre,
        },
        negocio: p.negocio
          ? { lat: p.negocio.lat, lng: p.negocio.lng, barrio: p.negocio.barrio, nombre: p.negocio.nombre }
          : null,
      },
    }))

    return { candidatos, repartidoresDisponibles, nombresRuta }
  }

  /**
   * Mapa `pedidoId → nombreLogico` de la versión vigente (para el peso de
   * estabilidad, ADR-PLANIFICADOR-005 §2). Vacío si no hay plan vigente.
   */
  async grupoAnteriorPorPedido(fecha: string): Promise<Record<string, string>> {
    const vigente = await prisma.planDia.findFirst({
      where: { fecha: startOfDayBogota(fecha), estado: { in: ['PROPOSED', 'REVIEW', 'CONFIRMED'] } },
      orderBy: { version: 'desc' },
      select: {
        grupos: {
          select: { nombreLogico: true, paradas: { select: { actividades: { select: { pedidoIds: true } } } } },
        },
      },
    })
    if (!vigente) return {}
    const map: Record<string, string> = {}
    for (const g of vigente.grupos) {
      for (const par of g.paradas) {
        for (const act of par.actividades) {
          for (const pid of act.pedidoIds) map[pid] = g.nombreLogico
        }
      }
    }
    return map
  }

  /**
   * Persiste una propuesta como nuevo `PlanDia` (version = anterior + 1; la
   * anterior pasa a SUPERSEDED). Devuelve el id creado.
   */
  async persistirPropuesta(
    propuesta: Propuesta,
    opts: { generadoPorId?: string; causa: string },
  ): Promise<{ id: string; version: number }> {
    const fechaDate = startOfDayBogota(propuesta.fecha)

    return prisma.$transaction(async (tx) => {
      const anterior = await tx.planDia.findFirst({
        where: { fecha: fechaDate },
        orderBy: { version: 'desc' },
        select: { id: true, version: true },
      })

      if (anterior) {
        await tx.planDia.updateMany({
          where: { fecha: fechaDate, estado: { in: ['PROPOSED', 'REVIEW'] } },
          data: { estado: 'SUPERSEDED' },
        })
      }

      const plan = await tx.planDia.create({
        data: {
          fecha: fechaDate,
          version: (anterior?.version ?? 0) + 1,
          estado: 'PROPOSED',
          generadoPorId: opts.generadoPorId ?? null,
          causa: opts.causa,
          resumen: propuesta.resumen,
          grupos: {
            create: propuesta.grupos.map((g) => ({
              nombreLogico: g.nombreLogico,
              secuencia: g.secuencia,
              capacidadUnidades: g.capacidadUnidades,
              cargaPlanificada: g.cargaPlanificada,
              trabajadorPropuestoId: g.trabajadorPropuestoId,
              trabajadorFinalId: g.trabajadorPropuestoId,
              rutaId: g.rutaId,
              score: g.score,
              explicacion: g.explicacion,
              paradas: {
                create: g.paradas.map((p) => ({
                  secuencia: p.secuencia,
                  clienteId: p.clienteId,
                  negocioId: p.negocioId,
                  ubicacionUsada: p.ubicacionUsada,
                  motivo: p.motivo,
                  actividades: {
                    create: p.actividades.map((a) => ({
                      tipo: a.tipo,
                      pedidoIds: a.pedidoIds,
                      snapshotCantidades: a.snapshotCantidades,
                    })),
                  },
                })),
              },
            })),
          },
          excepciones: {
            create: propuesta.excepciones.map((e) => ({
              tipo: e.tipo,
              severidad: e.severidad,
              entidad: e.entidad,
              explicacion: e.explicacion,
              opciones: e.opciones,
            })),
          },
        },
      })

      await tx.planDiaVersion.create({
        data: {
          planDiaId: plan.id,
          version: plan.version,
          snapshot: JSON.parse(JSON.stringify(propuesta)),
          actorId: opts.generadoPorId ?? null,
          causa: opts.causa,
        },
      })

      return { id: plan.id, version: plan.version }
    })
  }

  /** Plan completo con grupos/paradas/actividades/excepciones. */
  async obtenerPlan(id: string) {
    return prisma.planDia.findUnique({
      where: { id },
      include: {
        grupos: {
          orderBy: { secuencia: 'asc' },
          include: {
            paradas: {
              orderBy: { secuencia: 'asc' },
              include: { actividades: true },
            },
          },
        },
        excepciones: { orderBy: { createdAt: 'asc' } },
      },
    })
  }

  /** Plan vigente de una fecha (mayor version en estado no terminal). */
  async obtenerVigentePorFecha(fecha: string) {
    const plan = await prisma.planDia.findFirst({
      where: {
        fecha: startOfDayBogota(fecha),
        estado: { in: ['PROPOSED', 'REVIEW', 'CONFIRMED', 'INTEGRATION_PARTIAL'] },
      },
      orderBy: { version: 'desc' },
      select: { id: true },
    })
    return plan ? this.obtenerPlan(plan.id) : null
  }

  /**
   * Transición de estado del plan con chequeo de versión optimista
   * (ADR-PLANIFICADOR-005 §4). Lanza 'VERSION_CONFLICT' si `expectedVersion`
   * no coincide, o 'ESTADO_INVALIDO' si la transición no aplica.
   */
  async transicionar(params: {
    id: string
    expectedVersion: number
    desde: PlanEstado[]
    hacia: PlanEstado
    userId?: string
    confirmOfflineId?: string
  }): Promise<{ deduped: boolean }> {
    return prisma.$transaction(async (tx) => {
      const plan = await tx.planDia.findUnique({
        where: { id: params.id },
        select: { version: true, estado: true, confirmOfflineId: true },
      })
      if (!plan) throw new Error('PLAN_NOT_FOUND')

      // Idempotencia: replay del confirmar con el mismo offlineId.
      if (
        params.confirmOfflineId &&
        plan.confirmOfflineId === params.confirmOfflineId &&
        ['CONFIRMED', 'INTEGRATION_PARTIAL'].includes(plan.estado)
      ) {
        return { deduped: true }
      }

      if (plan.version !== params.expectedVersion) throw new Error('VERSION_CONFLICT')
      if (!params.desde.includes(plan.estado)) throw new Error('ESTADO_INVALIDO')

      await tx.planDia.update({
        where: { id: params.id },
        data: {
          estado: params.hacia,
          ...(params.hacia === 'CONFIRMED'
            ? { confirmadoEn: new Date(), confirmadoPorId: params.userId ?? null }
            : {}),
          ...(params.confirmOfflineId ? { confirmOfflineId: params.confirmOfflineId } : {}),
        },
      })
      return { deduped: false }
    })
  }

  async marcarEstado(id: string, estado: PlanEstado): Promise<void> {
    await prisma.planDia.update({ where: { id }, data: { estado } })
  }

  async marcarGrupoMaterializado(grupoId: string, embarqueId: string): Promise<void> {
    await prisma.planGrupo.update({ where: { id: grupoId }, data: { embarqueId } })
  }

  /** Grupos de un plan con sus pedidos (para materializar). */
  async gruposParaMaterializar(planId: string) {
    return prisma.planGrupo.findMany({
      where: { planDiaId: planId },
      orderBy: { secuencia: 'asc' },
      include: { paradas: { include: { actividades: true } } },
    })
  }
}
