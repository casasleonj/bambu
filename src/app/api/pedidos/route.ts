import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { PedidoCreateSchema } from '@/lib/validators'
import { withAdvisoryLock } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { getTodayRange, getDateRange } from '@/lib/dates'
import { resolverPreciosPedido, type Canal, type ProductCode } from '@/lib/pricing'
import { calcularEstadoPago, puedeCrearPedido } from '@/lib/pedido-utils'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { OrigenPedido, EstadoEntrega } from '@prisma/client'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const pagination = getPaginationParams(searchParams)
  const session = authResult as { user?: { id?: string; role?: string } }

  try {
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const all = searchParams.get('all')

    let where: Record<string, unknown> = {}

    // REPARTIDOR: only see pedidos assigned to their own embarques + unassigned pedidos
    if (session.user?.role === 'REPARTIDOR') {
      const trabajador = await prisma.trabajador.findFirst({
        where: { userId: session.user.id },
        select: { id: true },
      })
      if (trabajador) {
        where = {
          OR: [
            { embarque: { trabajadorId: trabajador.id } },
            { embarqueId: null, estadoEntrega: 'PENDIENTE' },
          ],
        }
      } else {
        return apiSuccess({ pedidos: [], total: 0 })
      }
    }

    if (all === 'true') {
      if (session.user?.role !== 'REPARTIDOR') where = {}
    } else if (desde && hasta) {
      const { startDate, endDate } = getDateRange(desde, hasta)
      where = { fecha: { gte: startDate, lt: endDate } }
    } else {
      const { startOfDay, endOfDay } = getTodayRange()
      where = { fecha: { gte: startOfDay, lt: endOfDay } }
    }

    const prismaPagination = all === 'true' ? { take: 200 } : getPrismaPagination(pagination)

    const [pedidosRaw, total] = await Promise.all([
      prisma.pedido.findMany({
        where,
        orderBy: { numero: 'desc' },
        include: { cliente: true, items: true, factura: { include: { abonos: true } } },
        ...prismaPagination,
      }),
      prisma.pedido.count({ where }),
    ])

    const pedidos = pedidosRaw.map(p => ({
      ...p,
      nombreCli: p.clienteId === 'CONSUMIDOR_FINAL' ? 'Consumidor Final' : (p.cliente?.nombre || 'Desconocido'),
      telefonoCli: p.cliente?.telefono || '',
      zonaCli: p.cliente?.direccion || '',
      barrioCli: p.cliente?.barrio || '',
      fecha: p.fecha.toISOString(),
    }))

    return apiSuccess(
      pagination.all
        ? { pedidos, total }
        : buildPaginationResponse(pedidos, total, pagination.page!, pagination.pageSize!)
    )
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching pedidos:')
    return apiError('Error cargando pedidos')
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()
    const parsed = PedidoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    const {
      clienteId: rawClienteId,
      items: itemsInput,
      productos: productosLegacy,
      obs,
      fechaEntrega,
      canal,
      preciosManuales,
      clienteNuevo,
      actualizarCliente,
      origen: origenInput,
      ventaRapida,
    } = parsed.data

    const pagosData = parsed.data.pagos || []
    const totalPagado = pagosData.reduce((sum, p) => sum + p.monto, 0)
    const canalReal = (canal || 'DOMICILIO') as Canal
    const tipo = canalReal === 'PUNTO' ? 'PUNTO' : 'ENVIO'

    // Determinar origen
    let origen: OrigenPedido = origenInput || 'PEDIDO'
    if (ventaRapida) origen = 'VENTA_RAPIDA'

    const result = await withAdvisoryLock('PEDIDO', async (tx) => {
      let clienteId = rawClienteId

      // 1. Crear cliente nuevo o reusar existente por teléfono
      if (clienteNuevo) {
        const existente = clienteNuevo.telefono
          ? await tx.cliente.findFirst({
              where: { telefono: clienteNuevo.telefono },
              select: { id: true },
            })
          : null

        if (existente) {
          clienteId = existente.id
        } else {
          const nuevo = await tx.cliente.create({
            data: {
              nombre: clienteNuevo.nombre,
              apellido: clienteNuevo.apellido,
              telefono: clienteNuevo.telefono,
              direccion: clienteNuevo.direccion || '',
              barrio: clienteNuevo.barrio,
              nombreNegocio: clienteNuevo.nombreNegocio || null,
              tipoNegocio: clienteNuevo.tipoNegocio || null,
              fuente: clienteNuevo.fuente || null,
              frecuencia: 'NINGUNA',
              creadoPorRol: authResult.user?.role as any || 'ASISTENTE',
            },
          })
          clienteId = nuevo.id
        }
      }

      // 2. Validar cliente existe (auto-crear CONSUMIDOR_FINAL si falta)
      let cliente = await tx.cliente.findUnique({ where: { id: clienteId } })
      if (!cliente) {
        if (clienteId === 'CONSUMIDOR_FINAL') {
          cliente = await tx.cliente.create({
            data: {
              id: 'CONSUMIDOR_FINAL',
              nombre: 'Consumidor Final',
              telefono: '',
              direccion: '',
              frecuencia: 'NINGUNA',
              creadoPorRol: authResult.user?.role as any || 'ASISTENTE',
            },
          })
        } else {
          throw new Error('CLIENTE_NOT_FOUND')
        }
      }

      // 2b. Verificar si el cliente puede crear nuevos pedidos
      const pedidosPendientes = await tx.pedido.findMany({
        where: {
          clienteId: cliente.id,
          estadoEntrega: { notIn: ['ANULADO', 'CANCELADO'] },
          estadoPago: { notIn: ['PAGADO', 'ANTICIPADO', 'ANULADO'] },
        },
        orderBy: { numero: 'asc' },
        select: { id: true, numero: true, saldo: true },
      })

      // Determinar limite de fiados: cliente override → Config global → fallback 3
      let limiteFiados = cliente.limitePedidosFiados ?? 3
      if (cliente.limitePedidosFiados == null) {
        const configLimite = await tx.config.findUnique({ where: { clave: 'LIMITE_PEDIDOS_FIADOS_DEFAULT' } })
        if (configLimite) {
          limiteFiados = parseInt(configLimite.valor, 10) || 3
        }
      }

      const errorDeuda = puedeCrearPedido(cliente, pedidosPendientes, limiteFiados)
      if (errorDeuda) {
        throw new Error(`CLIENTE_DEBE: ${errorDeuda}`)
      }

      // 3. Actualizar dirección/barrio del cliente existente si se editó en el form
      if (actualizarCliente && clienteId !== 'CONSUMIDOR_FINAL') {
        await tx.cliente.update({
          where: { id: clienteId },
          data: {
            direccion: actualizarCliente.direccion,
            barrio: actualizarCliente.barrio,
          },
        })
      }

      // 4. Construir items para pricing engine
      // Priorizar items array nuevo, fallback a productos legacy
      let itemsParaPrecios: Array<{ codigo: ProductCode; cantidad: number; precioManual?: number }> = []

      if (itemsInput && itemsInput.length > 0) {
        itemsParaPrecios = itemsInput
          .filter(i => i.cantidad > 0)
          .map(i => ({
            codigo: i.producto as ProductCode,
            cantidad: i.cantidad,
            precioManual: i.precioManual,
          }))
      } else if (productosLegacy) {
        const manualPrices = preciosManuales || {}
        itemsParaPrecios = [
          { codigo: 'PACA_AGUA', cantidad: productosLegacy.pacaAgua || 0, precioManual: manualPrices['PACA_AGUA'] },
          { codigo: 'PACA_HIELO', cantidad: productosLegacy.pacaHielo || 0, precioManual: manualPrices['PACA_HIELO'] },
          { codigo: 'BOTELLON', cantidad: productosLegacy.botellon || 0, precioManual: manualPrices['BOTELLON'] },
          { codigo: 'BOLSA_AGUA', cantidad: productosLegacy.bolsaAgua || 0, precioManual: manualPrices['BOLSA_AGUA'] },
          { codigo: 'BOLSA_HIELO', cantidad: productosLegacy.bolsaHielo || 0, precioManual: manualPrices['BOLSA_HIELO'] },
        ]
      }

      if (itemsParaPrecios.length === 0 || itemsParaPrecios.every(i => i.cantidad === 0)) {
        throw new Error('SIN_PRODUCTOS')
      }

      // 5. Resolver precios
      const preciosResueltos = await resolverPreciosPedido(itemsParaPrecios, canalReal, clienteId, tx)
      const precioMap: Record<string, number> = {}
      for (const pr of preciosResueltos) {
        precioMap[pr.codigo] = pr.precio
      }

      const total = preciosResueltos.reduce((sum, pr) => sum + pr.subtotal, 0)

      // 6. Determinar estados iniciales
      let estadoEntrega: EstadoEntrega = 'PENDIENTE'
      if (origen === 'VENTA_RAPIDA') {
        estadoEntrega = 'ENTREGADO'
      }

      const estadoPago = calcularEstadoPago(total, totalPagado)

      // 7. Crear PedidoItem records
      const pedidoItemsData = itemsParaPrecios
        .filter(i => i.cantidad > 0)
        .map(i => ({
          producto: i.codigo,
          cantPedido: i.cantidad,
          cantEntrega: estadoEntrega === 'ENTREGADO' ? i.cantidad : 0,
          precio: precioMap[i.codigo] || 0,
          subtotal: (precioMap[i.codigo] || 0) * i.cantidad,
        }))

      // 8. Crear pedido con legacy + nuevos campos
      const pedido = await tx.pedido.create({
        data: {
          clienteId,
          createdById: authResult.user?.id,
          tipo,
          canal: canalReal,
          origen,
          estadoEntrega,
          estadoPago,
          estado: estadoEntrega, // legacy
          total,
          saldo: total - totalPagado,
          totalPagado,
          obs,
          fechaEntrega: fechaEntrega ? new Date(fechaEntrega) : null,
          // Legacy fields
          cPacaAguaPed: itemsParaPrecios.find(i => i.codigo === 'PACA_AGUA')?.cantidad || 0,
          cPacaHieloPed: itemsParaPrecios.find(i => i.codigo === 'PACA_HIELO')?.cantidad || 0,
          cBotellonFabPed: canalReal === 'PUNTO' ? (itemsParaPrecios.find(i => i.codigo === 'BOTELLON')?.cantidad || 0) : 0,
          cBotellonDomPed: canalReal === 'DOMICILIO' ? (itemsParaPrecios.find(i => i.codigo === 'BOTELLON')?.cantidad || 0) : 0,
          cBolsaAguaPed: itemsParaPrecios.find(i => i.codigo === 'BOLSA_AGUA')?.cantidad || 0,
          cBolsaHieloPed: itemsParaPrecios.find(i => i.codigo === 'BOLSA_HIELO')?.cantidad || 0,
          precioPacaAgua: precioMap['PACA_AGUA'] || 0,
          precioPacaHielo: precioMap['PACA_HIELO'] || 0,
          precioBotellonFab: canalReal === 'PUNTO' ? (precioMap['BOTELLON'] || 0) : 0,
          precioBotellonDom: canalReal === 'DOMICILIO' ? (precioMap['BOTELLON'] || 0) : 0,
          precioBolsaAgua: precioMap['BOLSA_AGUA'] || 0,
          precioBolsaHielo: precioMap['BOLSA_HIELO'] || 0,
          // PedidoItems
          items: {
            create: pedidoItemsData,
          },
        },
        include: { items: true },
      })

      // 9. Crear pagos
      for (const pago of pagosData) {
        await tx.pago.create({
          data: {
            pedidoId: pedido.id,
            metodo: pago.metodo,
            monto: pago.monto,
          },
        })
      }

      // 10. SIEMPRE crear factura (incluso punto pagado completo)
      const facturaNum = await getNextNumero(tx, { model: 'factura', field: 'numero' })
      const facturaClienteId = clienteId === 'CONSUMIDOR_FINAL' ? 'CONSUMIDOR_FINAL' : clienteId

      await tx.factura.create({
        data: {
          numero: `FAC-${facturaNum.toString().padStart(5, '0')}`,
          clienteId: facturaClienteId,
          pedidoId: pedido.id,
          subtotal: total,
          total,
          saldo: total - totalPagado,
          estado: totalPagado >= total ? 'PAGADA' : (totalPagado > 0 ? 'PARCIAL' : 'EMITIDA'),
        },
      })

      return { pedido, clienteId }
    })

    logAudit({
      entidad: 'Pedido',
      registroId: result.pedido.id,
      accion: 'CREATE',
      datos: { numero: result.pedido.numero, origen, tipo: result.pedido.tipo, total: Number(result.pedido.total), clienteId: result.clienteId },
      usuarioId: authResult.user?.id,
    })

    return apiSuccess({ pedido: result.pedido }, 201)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'CLIENTE_NOT_FOUND') return apiError('Cliente no encontrado', 404)
      if (error.message.startsWith('CLIENTE_DEBE:')) return apiError(error.message.replace('CLIENTE_DEBE: ', ''), 400)
      if (error.message === 'SIN_PRODUCTOS') return apiError('Agrega al menos un producto', 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creating pedido:')
    return apiError('Error creando pedido')
  }
}