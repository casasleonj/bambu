import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { PESOS_KG } from '@/lib/embarque-capacidad'
import { publishRealtimeEvent } from '@/lib/realtime'
import { startOfDayBogota, endOfDayBogota, todayStringBogota } from '@/lib/dates'
import { getConfigInt } from '@/lib/config'
import { MAX_UNIDADES } from '@/modules/embarques/domain/services/embarque-validation.service'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTrabajadorEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaTrabajadorEmbarqueRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'
import { StockValidator } from '@/modules/embarques/infrastructure/stock/StockValidator'
import { CrearEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CrearEmbarqueUseCase'

const embarqueRepo = new PrismaEmbarqueRepository()
const productoRepo = new PrismaEmbarqueProductoRepository()
const txManager = new PrismaTransactionManager()
const stockRepo = new StockValidator()
const workerRepo = new PrismaTrabajadorEmbarqueRepository()

const AsignacionSchema = z.object({
  pedidoIds: z.array(z.string().min(1)).min(1),
  trabajadorId: z.string().min(1),
  baseDinero: z.coerce.number().min(0).default(0),
  horaSalida: z.string().min(1),
  tipoMoto: z.string().optional(),
  rutaId: z.string().optional(),
})

const EmbarqueAutoSchema = z.object({
  // dryRun=true (default): sólo calcula y devuelve la propuesta, no escribe nada.
  // dryRun=false: crea los embarques a partir de `asignaciones`.
  dryRun: z.boolean().optional(),
  asignaciones: z.array(AsignacionSchema).optional(),
})

/**
 * Convierte un input type="time" ("HH:MM") en un Date UTC, asumiendo que la
 * hora es local a Bogotá (UTC-5). Evita `new Date("HH:MM")` (Invalid Date).
 */
function horaSalidaToDate(horaSalida: string): Date {
  return new Date(`${todayStringBogota()}T${horaSalida}:00-05:00`)
}

function unidadesPedido(p: {
  cPacaAguaPed?: number | null
  cPacaHieloPed?: number | null
  cBotellonFabPed?: number | null
  cBotellonDomPed?: number | null
  cBolsaAguaPed?: number | null
  cBolsaHieloPed?: number | null
}): number {
  return (
    (p.cPacaAguaPed || 0) +
    (p.cPacaHieloPed || 0) +
    (p.cBotellonFabPed || 0) +
    (p.cBotellonDomPed || 0) +
    (p.cBolsaAguaPed || 0) +
    (p.cBolsaHieloPed || 0)
  )
}

function pesoPedido(p: {
  cPacaAguaPed?: number | null
  cPacaHieloPed?: number | null
  cBotellonFabPed?: number | null
  cBotellonDomPed?: number | null
  cBolsaAguaPed?: number | null
  cBolsaHieloPed?: number | null
}): number {
  return (
    (p.cPacaAguaPed || 0) * PESOS_KG.PACA_AGUA +
    (p.cPacaHieloPed || 0) * PESOS_KG.PACA_HIELO +
    (p.cBotellonFabPed || 0) * PESOS_KG.BOTELLON +
    (p.cBotellonDomPed || 0) * PESOS_KG.BOTELLON +
    (p.cBolsaAguaPed || 0) * PESOS_KG.BOLSA_AGUA +
    (p.cBolsaHieloPed || 0) * PESOS_KG.BOLSA_HIELO
  )
}

type PedidoConRuta = {
  id: string
  cPacaAguaPed?: number | null
  cPacaHieloPed?: number | null
  cBotellonFabPed?: number | null
  cBotellonDomPed?: number | null
  cBolsaAguaPed?: number | null
  cBolsaHieloPed?: number | null
  cliente?: { rutaId?: string | null; barrio?: string | null; nombre?: string | null } | null
  negocio?: { rutaId?: string | null; barrio?: string | null; nombre?: string | null } | null
}

/**
 * Split a group of pedidos into chunks that don't exceed maxUnidades.
 * Uses a greedy approach: adds pedidos to current chunk until adding the next
 * would exceed the limit, then starts a new chunk.
 */
function splitPedidosByCapacity(pedidos: PedidoConRuta[], maxUnidades: number): PedidoConRuta[][] {
  const chunks: PedidoConRuta[][] = []
  let chunkActual: PedidoConRuta[] = []
  let unidadesChunk = 0

  for (const pedido of pedidos) {
    const unidades = unidadesPedido(pedido)
    if (unidades > maxUnidades) {
      if (chunkActual.length > 0) {
        chunks.push(chunkActual)
        chunkActual = []
        unidadesChunk = 0
      }
      chunks.push([pedido])
      continue
    }
    if (unidadesChunk + unidades > maxUnidades && chunkActual.length > 0) {
      chunks.push(chunkActual)
      chunkActual = []
      unidadesChunk = 0
    }
    chunkActual.push(pedido)
    unidadesChunk += unidades
  }
  if (chunkActual.length > 0) {
    chunks.push(chunkActual)
  }
  return chunks
}

interface PreviewChunk {
  pedidoIds: string[]
  rutaId: string | null
  rutaNombre: string
  trabajadorIdPropuesto: string
  unidades: number
  pesoKg: number
}

/**
 * Calcula (sin escribir nada) los embarques que se crearían: agrupa
 * pedidos PENDIENTE sin embarque por ruta/barrio, propone un repartidor
 * disponible por grupo y divide en chunks que respetan maxUnidades.
 *
 * "Disponible" excluye a cualquier repartidor con un embarque de HOY en
 * estado ABIERTO o EN_RUTA — antes esta función sólo excluía EN_RUTA,
 * permitiendo que un repartidor terminara con dos embarques ABIERTOS el
 * mismo día (la creación manual sí bloquea esto vía
 * CrearEmbarqueUseCase.findByTrabajadorAndFecha).
 */
async function computePreview(maxUnidades: number) {
  const pedidosPendientes = await prisma.pedido.findMany({
    where: { estado: 'PENDIENTE', embarqueId: null },
    include: {
      cliente: { select: { rutaId: true, barrio: true, nombre: true } },
      negocio: { select: { rutaId: true, barrio: true, nombre: true } },
    },
  })

  if (pedidosPendientes.length === 0) {
    return {
      chunks: [] as PreviewChunk[],
      gruposSinAsignar: [] as Array<{ ruta: string; pedidosCount: number; unidades: number }>,
      repartidoresDisponibles: [] as Array<{ id: string; nombre: string }>,
      pedidosPendientesCount: 0,
    }
  }

  const grupos = new Map<string, typeof pedidosPendientes>()
  for (const pedido of pedidosPendientes) {
    const rutaKey = pedido.negocio?.rutaId ?? pedido.cliente?.rutaId
    const barrioKey = pedido.negocio?.barrio ?? pedido.cliente?.barrio
    const key = rutaKey || barrioKey || 'SIN_RUTA'
    if (!grupos.has(key)) grupos.set(key, [])
    grupos.get(key)!.push(pedido)
  }

  const repartidores = await prisma.trabajador.findMany({
    where: { rol: 'REPARTIDOR', activo: true, usaMoto: true },
    select: { id: true, nombre: true },
  })

  if (repartidores.length === 0) {
    throw new Error('NO_REPARTIDORES')
  }

  const fechaStr = todayStringBogota()
  const embarquesHoy = await prisma.embarque.findMany({
    where: {
      fecha: { gte: startOfDayBogota(fechaStr), lte: endOfDayBogota(fechaStr) },
      estado: { in: ['ABIERTO', 'EN_RUTA'] },
    },
    select: { trabajadorId: true },
    distinct: ['trabajadorId'],
  })
  const idsOcupados = new Set(embarquesHoy.map((e) => e.trabajadorId))
  const repartidoresDisponibles = repartidores.filter((r) => !idsOcupados.has(r.id))

  const chunksPreview: PreviewChunk[] = []
  const gruposSinAsignar: Array<{ ruta: string; pedidosCount: number; unidades: number }> = []

  for (const [key, pedidosGrupo] of grupos) {
    const ruta = key !== 'SIN_RUTA' ? await prisma.ruta.findUnique({ where: { id: key } }) : null

    let repartidor = repartidoresDisponibles.find((r) => r.id === ruta?.repartidorId)
    if (!repartidor && repartidoresDisponibles.length > 0) {
      const hash = key.split('').reduce((a, b) => a + b.charCodeAt(0), 0)
      repartidor = repartidoresDisponibles[hash % repartidoresDisponibles.length]
    }

    if (!repartidor) {
      const totalUnidadesGrupo = pedidosGrupo.reduce((s: number, p: PedidoConRuta) => s + unidadesPedido(p), 0)
      gruposSinAsignar.push({
        ruta: ruta?.nombre || key,
        pedidosCount: pedidosGrupo.length,
        unidades: totalUnidadesGrupo,
      })
      continue
    }

    const chunks = splitPedidosByCapacity(pedidosGrupo, maxUnidades)
    for (const chunk of chunks) {
      chunksPreview.push({
        pedidoIds: chunk.map((p) => p.id),
        rutaId: ruta?.id || null,
        rutaNombre: ruta?.nombre || chunk[0].negocio?.nombre || chunk[0].cliente?.barrio || 'Sin ruta',
        trabajadorIdPropuesto: repartidor.id,
        unidades: chunk.reduce((s, p) => s + unidadesPedido(p), 0),
        pesoKg: chunk.reduce((s, p) => s + pesoPedido(p), 0),
      })
    }
  }

  return {
    chunks: chunksPreview,
    gruposSinAsignar,
    repartidoresDisponibles: repartidoresDisponibles.map((r) => ({ id: r.id, nombre: r.nombre })),
    pedidosPendientesCount: pedidosPendientes.length,
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  // Alineado con la creación manual (POST /api/embarques): ADMIN y ASISTENTE.
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const session = authResult as { user?: { id?: string } }

  try {
    const body = await request.json()
    const validation = EmbarqueAutoSchema.safeParse(body)
    if (!validation.success) {
      return apiError('Parámetros inválidos', 400)
    }

    const maxUnidades = await getConfigInt('MAX_UNIDADES_EMBARQUE', MAX_UNIDADES)
    const isDryRun = validation.data.dryRun !== false

    if (isDryRun) {
      const preview = await computePreview(maxUnidades)
      const message =
        preview.pedidosPendientesCount === 0
          ? 'No hay pedidos pendientes para embarcar'
          : `${preview.chunks.length} embarque(s) propuesto(s) con ${preview.chunks.reduce((s, c) => s + c.pedidoIds.length, 0)} pedido(s)`
      return apiSuccess({ dryRun: true, maxUnidades, message, ...preview })
    }

    // --- Confirmación: crear un Embarque por cada asignación, reusando
    // CrearEmbarqueUseCase (misma validación/numeración que la creación
    // manual: stock, peso, máximo de unidades, numeroDia, y el bloqueo de
    // "un embarque abierto por trabajador por día").
    const asignaciones = validation.data.asignaciones
    if (!asignaciones || asignaciones.length === 0) {
      return apiError('No hay asignaciones para confirmar', 400)
    }

    const useCase = new CrearEmbarqueUseCase(embarqueRepo, workerRepo, stockRepo, productoRepo, txManager)

    const creados: Array<{ embarqueId: string; numero: number; numeroDia: number; trabajadorId: string; pedidosCount: number }> = []
    const errores: Array<{ trabajadorId: string; pedidosCount: number; error: string }> = []

    for (const asignacion of asignaciones) {
      try {
        const pedidos = await prisma.pedido.findMany({
          where: { id: { in: asignacion.pedidoIds }, estado: 'PENDIENTE', embarqueId: null },
        })
        if (pedidos.length !== asignacion.pedidoIds.length) {
          throw new Error('Algunos pedidos ya fueron asignados a otro embarque, recarga e intenta de nuevo')
        }

        const carga = {
          PACA_AGUA: pedidos.reduce((s, p) => s + (p.cPacaAguaPed || 0), 0),
          PACA_HIELO: pedidos.reduce((s, p) => s + (p.cPacaHieloPed || 0), 0),
          BOTELLON: pedidos.reduce((s, p) => s + (p.cBotellonFabPed || 0) + (p.cBotellonDomPed || 0), 0),
          BOLSA_AGUA: pedidos.reduce((s, p) => s + (p.cBolsaAguaPed || 0), 0),
          BOLSA_HIELO: pedidos.reduce((s, p) => s + (p.cBolsaHieloPed || 0), 0),
        }

        const result = await useCase.execute({
          trabajadorId: asignacion.trabajadorId,
          rutaId: asignacion.rutaId,
          carga: carga as never,
          tipoMoto: asignacion.tipoMoto,
          baseDinero: asignacion.baseDinero,
          horaSalida: horaSalidaToDate(asignacion.horaSalida),
          obs: `Auto-generado: ${pedidos.length} pedido(s)`,
          createdById: session.user?.id,
          verificarStock: true,
          maxUnidades,
        })

        await prisma.pedido.updateMany({
          where: { id: { in: asignacion.pedidoIds } },
          data: { embarqueId: result.id, estado: 'EN_RUTA', estadoEntrega: 'EN_RUTA' },
        })

        creados.push({
          embarqueId: result.id,
          numero: result.numero,
          numeroDia: result.numeroDia,
          trabajadorId: asignacion.trabajadorId,
          pedidosCount: pedidos.length,
        })

        logAudit({
          entidad: 'Embarque',
          registroId: result.id,
          accion: 'CREATE',
          datos: { auto: true, numero: result.numero, numeroDia: result.numeroDia, trabajadorId: result.trabajadorId },
          usuarioId: session.user?.id,
        })

        publishRealtimeEvent('embarque.created', result.id).catch(() => {})
        asignacion.pedidoIds.forEach((pedidoId) => {
          publishRealtimeEvent('pedido.updated', pedidoId).catch(() => {})
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido'
        errores.push({ trabajadorId: asignacion.trabajadorId, pedidosCount: asignacion.pedidoIds.length, error: message })
        logger.error({ err: message, trabajadorId: asignacion.trabajadorId }, 'Error creando embarque auto-generado:')
      }
    }

    const pedidosAsignados = creados.reduce((s, c) => s + c.pedidosCount, 0)
    let message = `${creados.length} embarque(s) creado(s) con ${pedidosAsignados} pedido(s)`
    if (errores.length > 0) {
      message += `. ${errores.length} asignación(es) fallaron`
    }

    return apiSuccess({ dryRun: false, created: creados.length, creados, errores, message })
  } catch (error) {
    if (error instanceof Error && error.message === 'NO_REPARTIDORES') {
      return apiError('No hay repartidores activos para generar embarques', 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error auto-generating embarques:')
    return apiError('Error al generar embarques automáticos', 500)
  }
}
