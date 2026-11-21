import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { requireAuth, requirePermission } from '@/lib/auth-check'
import { apiError, apiSuccess } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'
import { leerExigibles } from '@/lib/entregas-exigibles-db'
import { pickCoords } from '@/lib/geo/pedido-coords'
import { isConsumidorFinalCanonical } from '@/lib/cliente-canonical'
import { diaEntregaBogota } from '@/lib/pedidos-entregas-historial'
import {
  coordenadaVialValida,
  RecorridoVialError,
  type ParadaVial,
} from '@/lib/geo/google-route-optimization'
import { GoogleRutaNoDisponibleError } from '@/lib/geo/google-route-optimization-server'
import { HeiGitRutaNoDisponibleError } from '@/lib/geo/heigit-vroom-server'
import {
  comprobarProveedorRecorridoVial,
  optimizarRecorridoVial,
  ProveedorVialInvalidoError,
} from '@/lib/geo/recorrido-vial-proveedor-server'
import { bloqueadaPorEmbarque, clasificarGestionVial, esParadaDeEntregaCercania } from '@/lib/geo/seleccion-recorrido-vial'

export const runtime = 'nodejs'

const schema = z.strictObject({
  pedidoIds: z.array(z.string().min(1).max(128)).min(1).max(25),
  origen: z.strictObject({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
  }),
})

/**
 * Previsualización sin mutaciones. El orden vial se calcula para el conjunto
 * explícito de pedidos seleccionado por la UI, NO se decide a partir de las
 * 25 filas paginadas del listado (esa selección completa es fase UI separada).
 *
 * El servidor recalcula la gestión física / cartera y rechaza cualquier
 * selección incoherente: jamás omite silenciosamente pedidos de una salida.
 */
export async function POST(request: NextRequest) {
  const session = await requireAuth()
  if (session instanceof Response) return session
  const permitido = await requirePermission('view:pedidos', session)
  if (permitido instanceof Response) return permitido

  // Habilitación y cuota del proveedor elegido. No probar Google si HeiGIT falla.
  try { comprobarProveedorRecorridoVial() } catch (e) {
    if (e instanceof GoogleRutaNoDisponibleError ||
        e instanceof HeiGitRutaNoDisponibleError ||
        e instanceof ProveedorVialInvalidoError)
      return apiError('La optimización vial aún no está habilitada o configurada.', 503)
    return apiError('No se pudo preparar el servicio vial.', 503)
  }

  if (Number(request.headers.get('content-length') ?? 0) > 16_384)
    return apiError('Solicitud de recorrido demasiado grande.', 413)

  let payload: unknown
  try { payload = await request.json() } catch {
    return apiError('Solicitud de recorrido no válida.', 400)
  }
  const parsed = schema.safeParse(payload)
  if (!parsed.success ||
      new Set(parsed.data?.pedidoIds).size !== parsed.data?.pedidoIds.length ||
      !coordenadaVialValida(parsed.data!.origen))
    return apiError('Selecciona pedidos únicos y un origen GPS válido.', 400)

  const { pedidoIds, origen } = parsed.data
  const ahora = new Date()

  try {
    const { paradas, advertenciasHora } = await prisma.$transaction(async tx => {
      const pedidos = await tx.pedido.findMany({
        where: { id: { in: pedidoIds } },
        select: {
          id: true, clienteId: true, canal: true, estadoEntrega: true,
          fechaEntrega: true, entregaNoAntesDe: true, embarqueId: true,
          entregaLat: true, entregaLng: true,
          cliente: { select: { lat: true, lng: true } },
          negocio: { select: { lat: true, lng: true } },
          items: { select: {
            producto: true, cantPedido: true, cantEntrega: true,
            cantRegaloPedido: true, cantRegaloEntrega: true,
          } },
          cPacaAguaPed: true, cPacaAguaEnt: true,
          cPacaHieloPed: true, cPacaHieloEnt: true,
          cBotellonFabPed: true, cBotellonFabEnt: true,
          cBotellonDomPed: true, cBotellonDomEnt: true,
          cBolsaAguaPed: true, cBolsaAguaEnt: true,
          cBolsaHieloPed: true, cBolsaHieloEnt: true,
        },
      })
      if (pedidos.length !== pedidoIds.length)
        throw new RecorridoVialError('PARADAS_INVALIDAS', 'Hay pedidos que ya no se encuentran disponibles.')
      const porId = new Map(pedidos.map(p => [p.id, p]))
      const exigibles = await leerExigibles(tx, { id: { in: pedidoIds } })
      const ordenadas: ParadaVial[] = []
      const horas: string[] = []
      for (const id of pedidoIds) {
        const p = porId.get(id)
        if (!p)
          throw new RecorridoVialError('PARADAS_INVALIDAS', 'Un pedido dejó de estar disponible.')
        if (isConsumidorFinalCanonical(p.clienteId))
          throw new RecorridoVialError('PARADAS_INVALIDAS', 'Una venta anónima no representa una visita de cobro.')
        // #959: Cercanía sirve a entregas pendientes; un fiado de entrega ya
        // completada se cobra desde Cartera, no agrega otra parada de reparto.
        if (p.estadoEntrega === 'ENTREGADO')
          throw new RecorridoVialError('PARADAS_INVALIDAS', 'Hay pedidos con entrega ya completada. Actualiza la selección.')
        const gestion = clasificarGestionVial({
          estadoEntrega: p.estadoEntrega,
          canal: p.canal,
          items: p.items,
          legacyPendientes: p.items.length ? undefined : [
            { pedidas: p.cPacaAguaPed, entregadas: p.cPacaAguaEnt },
            { pedidas: p.cPacaHieloPed, entregadas: p.cPacaHieloEnt },
            { pedidas: p.cBotellonFabPed, entregadas: p.cBotellonFabEnt },
            { pedidas: p.cBotellonDomPed, entregadas: p.cBotellonDomEnt },
            { pedidas: p.cBolsaAguaPed, entregadas: p.cBolsaAguaEnt },
            { pedidas: p.cBolsaHieloPed, entregadas: p.cBolsaHieloEnt },
          ],
          exigible: exigibles.get(id) ?? 0,
        })
        if (!esParadaDeEntregaCercania(gestion))
          throw new RecorridoVialError('PARADAS_INVALIDAS', 'La selección contiene pedidos sin productos pendientes de entrega.')
        // Cercanía solo acepta entregas físicas; no reasignar mercancía
        // ya vinculada a un embarque de otra salida.
        if (bloqueadaPorEmbarque(p.embarqueId, gestion))
          throw new RecorridoVialError('PARADAS_INVALIDAS', 'Hay pedidos con carga asignada a un embarque. Revisa su repartidor.')
        // La fecha prometida de mañana se preserva, no se adelanta por GPS.
        if (p.fechaEntrega && diaEntregaBogota(new Date(p.fechaEntrega)) > diaEntregaBogota(ahora) &&
            gestion.tipo !== 'COBRO')
          throw new RecorridoVialError('PARADAS_INVALIDAS', 'Hay pedidos programados para otro día.')
        if (p.entregaNoAntesDe) horas.push(id) // preferencia, no ventana dura aprobada
        const coords = pickCoords({
          pedido: { lat: p.entregaLat, lng: p.entregaLng },
          negocio: p.negocio,
          cliente: p.cliente,
        })
        if (!coords || !coordenadaVialValida(coords))
          throw new RecorridoVialError('COORDENADAS_INVALIDAS', 'Hay un destino sin coordenadas verificables.')
        ordenadas.push({ pedidoId: id, lat: coords.lat, lng: coords.lng, tipo: gestion.tipo })
      }
      return { paradas: ordenadas, advertenciasHora: horas }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 })

    const resultado = await optimizarRecorridoVial({ origen, paradas, salida: ahora })
    const response = apiSuccess({
      ...resultado,
      calculadoAt: ahora.toISOString(),
      avisos: {
        horasAcordadasSinGarantiaDeCumplimiento: advertenciasHora,
        capacidadCargaNoValidada: true,
        ordenSugeridoSinDespacho: true,
        perfilMotocargaPendienteValidacion: true,
      },
    })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    if (error instanceof RecorridoVialError)
      return apiError(error.message, error.codigo === 'COORDENADAS_INVALIDAS' ? 422 : 409)
    if (error instanceof GoogleRutaNoDisponibleError ||
        error instanceof HeiGitRutaNoDisponibleError ||
        error instanceof ProveedorVialInvalidoError)
      return apiError('No fue posible calcular el recorrido vial. Puedes seguir usando la lista General.', 503)
    // Nunca loguear origen GPS, direcciones, órdenes ni credenciales.
    return apiError('No se pudo preparar el recorrido; revisa la selección.', 503)
  }
}
