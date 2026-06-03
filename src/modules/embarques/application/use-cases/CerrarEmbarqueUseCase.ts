/**
 * CerrarEmbarqueUseCase.
 *
 * Closes an embarque: processes pedidos, creates child pedidos for partials,
 * creates ventas libres, reconciles products, calculates discrepancies,
 * creates descuentos, creates gastos, and updates facturas.
 *
 * This is the most complex use case — formerly a 582-line route handler.
 */

import { prisma } from '@/lib/prisma'
import { resolverPrecio } from '@/lib/pricing'
import { calcularEstadoPago } from '@/lib/pedido-utils'
import { getNextNumero } from '@/lib/sequence'
import { logAudit } from '@/lib/audit'
import { EstadoEmbarque } from '@prisma/client'
import type { MetodoPago } from '@prisma/client'

import type { IEmbarqueRepository } from '../../domain/repositories/IEmbarqueRepository'
import type { IGastoEmbarqueRepository } from '../../domain/repositories/IGastoEmbarqueRepository'
import type { IEmbarqueProductoRepository } from '../../domain/repositories/IEmbarqueProductoRepository'
import { EmbarqueTransitionsService } from '../../domain/services/embarque-transitions.service'
import type { ProductCode } from '../../domain/value-objects/Carga'
import { EstadoEmbarque as EstadoEmbarqueVO } from '../../domain/value-objects/EstadoEmbarque'
import type { CerrarEmbarqueInput, CierreResultadoDTO } from '../dto'
import type { ITransactionManager } from '../../infrastructure/transactions/PrismaTransactionManager'

type TxOrPrisma = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

function toNumber(value: number | { toNumber: () => number } | null | undefined): number {
  if (value === null || value === undefined) return 0
  return typeof value === 'number' ? value : value.toNumber()
}

interface PedidoRaw {
  id: string
  numero: number
  clienteId: string
  embarqueId: string | null
  estadoEntrega: string
  estado: string
  tipo: string
  canal: string
  origen: string
  precioPacaAgua: number | { toNumber: () => number }
  precioPacaHielo: number | { toNumber: () => number }
  precioBotellonFab: number | { toNumber: () => number }
  precioBotellonDom: number | { toNumber: () => number }
  precioBolsaAgua: number | { toNumber: () => number }
  precioBolsaHielo: number | { toNumber: () => number }
  cPacaAguaPed: number
  cPacaHieloPed: number
  cBotellonFabPed: number
  cBotellonDomPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
  cPacaAguaEnt: number
  cPacaHieloEnt: number
  cBotellonFabEnt: number
  cBotellonDomEnt: number
  cBolsaAguaEnt: number
  cBolsaHieloEnt: number
  total: number | { toNumber: () => number }
  obs: string | null
  createdById: string | null
  items: Array<{ producto: string }>
  factura: { id: string } | null
}

interface PreciosPedido {
  pacaAgua: number
  pacaHielo: number
  botellonFab: number
  botellonDom: number
  bolsaAgua: number
  bolsaHielo: number
}

interface ProductosEntregados {
  cPacaAguaEnt: number
  cPacaHieloEnt: number
  cBotellonFabEnt: number
  cBotellonDomEnt: number
  cBolsaAguaEnt: number
  cBolsaHieloEnt: number
}

export class CerrarEmbarqueUseCase {
  private readonly transitions = new EmbarqueTransitionsService()

  constructor(
    private readonly embarqueRepo: IEmbarqueRepository,
    private readonly gastoRepo: IGastoEmbarqueRepository,
    private readonly productoRepo: IEmbarqueProductoRepository,
    private readonly txManager: ITransactionManager,
    private readonly userId?: string,
    private readonly userRole?: string,
  ) {}

  async execute(input: CerrarEmbarqueInput): Promise<CierreResultadoDTO> {
    // FIX F2.2: usar executeWithLock('CIERRE', ...) en vez de execute sin lock.
    //
    // Antes: dos cierres concurrentes del mismo embarque (o cierres
    // paralelos de embarques distintos) podían crear el mismo número
    // de pedido/factura porque getNextNumero usa `_max + 1` (count + 1),
    // que NO es atómico entre transacciones paralelas.
    //
    // pg_advisory_xact_lock(7) — el id de CIERRE en LOCK_IDS (locks.ts:10)
    // — serializa TODAS las operaciones de cierre dentro de la misma
    // conexión PostgreSQL. Se libera automáticamente al hacer commit/rollback.
    //
    // Trade-off conocido (aceptable):
    // - Si dos admins intentan cerrar embarques al MISMO tiempo, uno espera
    //   al otro. El lock se mantiene solo durante el cierre, no encolar
    //   requests, pero el segundo sentirá latencia. Aceptable porque los
    //   cierres son operaciones infrecuentes (1-3 por día típicamente).
    // - Si la operación falla dentro del lock, el rollback libera el lock.
    return this.txManager.executeWithLock('CIERRE', async (tx) => {
      const client = this.getTx(tx)

      // 1. Verify embarque exists and can be closed
      const embarque = await this.embarqueRepo.findById(input.id, tx)
      if (!embarque) throw new Error('EMBARQUE_NOT_FOUND')

      const transitionResult = this.transitions.cerrar(embarque.estado)
      if (!transitionResult.success) throw new Error(transitionResult.error)

      // 2. Fetch pedidos for this embarque
      const pedidosRaw = await this.fetchPedidosForEmbarque(input.id, client)

      const pedidosHijosCreados: Array<{ id: string; numero: number }> = []
      const pedidosActualizados: Array<{ id: string; estado: string }> = []
      let totalVentas = 0

      // 3. Process each pedido
      for (const cuadre of input.pedidos) {
        const pedido = pedidosRaw.find((p) => p.id === cuadre.pedidoId)
        if (!pedido) continue

        const totalReal = await this.procesarPedido(
          client,
          pedido,
          cuadre,
          pedidosHijosCreados,
          pedidosActualizados,
        )
        totalVentas += totalReal
      }

      const ventasLibresCount = await this.crearVentasLibres(client, input.ventasLibres ?? [], input.id)

      // 5. Reconcile products
      const { totalDiscrepancia, discrepanciasPorProducto } = this.conciliarProductos(
        embarque,
        pedidosRaw,
        input.ventasLibres ?? [],
        input.productosRetorno ?? [],
      )

      // 6. Create descuento for unexplained discrepancies
      let descuentoCreado: { id: string; monto: number } | undefined
      if (totalDiscrepancia > 0 && !input.justificacionDiscrepancia) {
        descuentoCreado = await this.crearDescuento(
          client,
          embarque.trabajadorId,
          input.id,
          discrepanciasPorProducto,
        )
      }

      // 7. Create gastos
      const gastosCount = await this.crearGastos(tx, input.gastos ?? [], input.id, embarque.trabajadorId)

      // 8. Update EmbarqueProducto records
      await this.actualizarProductosRetorno(tx, input.id, input.productosRetorno ?? [])

      // 9. Close embarque
      await this.embarqueRepo.update(
        input.id,
        {
          estado: new EstadoEmbarqueVO('CERRADO'),
          horaLlegada: new Date(),
          dineroEntregado: input.dineroEntregado ?? 0,
          obs: input.obs ?? embarque.obs,
        },
        tx,
      )

      // 10. Log audit
      logAudit({
        entidad: 'Embarque',
        registroId: input.id,
        accion: 'UPDATE',
        datos: {
          accion: 'CERRAR',
          pedidosProcesados: pedidosActualizados.length,
          hijosCreados: pedidosHijosCreados.length,
          ventasLibres: ventasLibresCount,
          gastos: gastosCount,
          discrepancia: totalDiscrepancia,
          dineroEntregado: input.dineroEntregado ?? 0,
        },
        usuarioId: this.userId,
      })

      return {
        embarqueId: input.id,
        estado: 'CERRADO',
        pedidosProcesados: pedidosActualizados.length,
        pedidosHijosCreados,
        pedidosActualizados,
        ventasLibresCreadas: ventasLibresCount,
        discrepanciaTotal: totalDiscrepancia,
        descuentoCreado,
        gastosCreados: gastosCount,
        totalVentas,
        comision: totalVentas * 0.05,
        caja: {
          efectivoEsperado: 0,
          efectivoReal: 0,
          diferencia: 0,
        },
      }
    })
  }

  private async fetchPedidosForEmbarque(embarqueId: string, client: TxOrPrisma): Promise<PedidoRaw[]> {
    const raw = await client.pedido.findMany({
      where: { embarqueId },
      include: { cliente: true, pagos: true, items: true, factura: true },
    })
    return raw as unknown as PedidoRaw[]
  }

  private async procesarPedido(
    client: TxOrPrisma,
    pedido: PedidoRaw,
    cuadre: CerrarEmbarqueInput['pedidos'][number],
    pedidosHijosCreados: Array<{ id: string; numero: number }>,
    pedidosActualizados: Array<{ id: string; estado: string }>,
  ): Promise<number> {
    const entProd = cuadre.productosEntregados ?? {
      cPacaAguaEnt: 0,
      cPacaHieloEnt: 0,
      cBotellonFabEnt: 0,
      cBotellonDomEnt: 0,
      cBolsaAguaEnt: 0,
      cBolsaHieloEnt: 0,
    }
    const montoPagado = cuadre.pagos.reduce((sum, p) => sum + p.monto, 0)

    // NO_ENTREGADO case
    if (cuadre.entregado === 'NO_ENTREGADO') {
      return this.procesarNoEntregado(client, pedido, cuadre, pedidosActualizados)
    }

    // Resolve prices (frozen original prices, ADMIN override only)
    const preciosOriginales: PreciosPedido = {
      pacaAgua: toNumber(pedido.precioPacaAgua),
      pacaHielo: toNumber(pedido.precioPacaHielo),
      botellonFab: toNumber(pedido.precioBotellonFab),
      botellonDom: toNumber(pedido.precioBotellonDom),
      bolsaAgua: toNumber(pedido.precioBolsaAgua),
      bolsaHielo: toNumber(pedido.precioBolsaHielo),
    }

    const precios: PreciosPedido = (cuadre.preciosReales && this.userRole === 'ADMIN')
      ? {
          pacaAgua: cuadre.preciosReales['pacaAgua'] ?? preciosOriginales.pacaAgua,
          pacaHielo: cuadre.preciosReales['pacaHielo'] ?? preciosOriginales.pacaHielo,
          botellonFab: cuadre.preciosReales['botellonFab'] ?? preciosOriginales.botellonFab,
          botellonDom: cuadre.preciosReales['botellonDom'] ?? preciosOriginales.botellonDom,
          bolsaAgua: cuadre.preciosReales['bolsaAgua'] ?? preciosOriginales.bolsaAgua,
          bolsaHielo: cuadre.preciosReales['bolsaHielo'] ?? preciosOriginales.bolsaHielo,
        }
      : preciosOriginales

    const totalReal =
      precios.pacaAgua * (entProd.cPacaAguaEnt || 0) +
      precios.pacaHielo * (entProd.cPacaHieloEnt || 0) +
      precios.botellonFab * (entProd.cBotellonFabEnt || 0) +
      precios.botellonDom * (entProd.cBotellonDomEnt || 0) +
      precios.bolsaAgua * (entProd.cBolsaAguaEnt || 0) +
      precios.bolsaHielo * (entProd.cBolsaHieloEnt || 0)

    const estadoPago = calcularEstadoPago(totalReal, montoPagado)

    // Update pedido
    await client.pedido.update({
      where: { id: pedido.id },
      data: {
        estadoEntrega: 'ENTREGADO',
        estado: 'ENTREGADO',
        estadoPago,
        cPacaAguaEnt: entProd.cPacaAguaEnt || 0,
        cPacaHieloEnt: entProd.cPacaHieloEnt || 0,
        cBotellonFabEnt: entProd.cBotellonFabEnt || 0,
        cBotellonDomEnt: entProd.cBotellonDomEnt || 0,
        cBolsaAguaEnt: entProd.cBolsaAguaEnt || 0,
        cBolsaHieloEnt: entProd.cBolsaHieloEnt || 0,
        precioPacaAgua: precios.pacaAgua,
        precioPacaHielo: precios.pacaHielo,
        precioBotellonFab: precios.botellonFab,
        precioBotellonDom: precios.botellonDom,
        precioBolsaAgua: precios.bolsaAgua,
        precioBolsaHielo: precios.bolsaHielo,
        total: totalReal,
        totalPagado: montoPagado,
        saldo: totalReal - montoPagado,
      },
    })

    // Update PedidoItems
    await this.updatePedidoItems(client, pedido.id, entProd, precios)

    // Log price changes
    await this.logPrecioCierre(client, pedido, totalReal)

    // Validate payments (1% tolerance)
    const montoPagadoTotal = cuadre.pagos.reduce((sum, p) => sum + p.monto, 0)
    if (montoPagadoTotal > totalReal * 1.01) {
      throw new Error(`PAGOS_EXCEDIDOS: Pagos ($${montoPagadoTotal}) exceden total real ($${totalReal}) para pedido #${pedido.numero}`)
    }

    pedidosActualizados.push({ id: pedido.id, estado: 'ENTREGADO' })

    // Register payments
    for (const pago of cuadre.pagos) {
      if (pago.monto > 0) {
        await client.pago.create({
          data: { pedidoId: pedido.id, metodo: pago.metodo as MetodoPago, monto: pago.monto },
        })
      }
    }

    // Update factura
    if (pedido.factura) {
      await client.factura.update({
        where: { id: pedido.factura.id },
        data: {
          total: totalReal,
          saldo: totalReal - montoPagado,
          estado: montoPagado >= totalReal ? 'PAGADA' : (montoPagado > 0 ? 'PARCIAL' : 'EMITIDA'),
        },
      })
    }

    // Create child pedido if PARCIAL
    if (cuadre.entregado === 'PARCIAL') {
      await this.crearPedidoHijo(client, pedido, entProd, precios, pedidosHijosCreados)
    }

    return totalReal
  }

  private async procesarNoEntregado(
    client: TxOrPrisma,
    pedido: PedidoRaw,
    cuadre: CerrarEmbarqueInput['pedidos'][number],
    pedidosActualizados: Array<{ id: string; estado: string }>,
  ): Promise<number> {
    const updateData: Record<string, unknown> = {
      estadoEntrega: 'NO_ENTREGADO',
      estado: 'NO_ENTREGADO',
      embarqueId: null,
      cPacaAguaEnt: 0,
      cPacaHieloEnt: 0,
      cBotellonFabEnt: 0,
      cBotellonDomEnt: 0,
      cBolsaAguaEnt: 0,
      cBolsaHieloEnt: 0,
    }

    if (cuadre.nuevoEmbarqueId) {
      const nuevoEmbarque = await client.embarque.findUnique({
        where: { id: cuadre.nuevoEmbarqueId },
        select: { id: true, estado: true, numero: true },
      })
      if (!nuevoEmbarque) {
        throw new Error(`EMBARQUE_DESTINO_NOT_FOUND: Embarque destino ${cuadre.nuevoEmbarqueId} no existe`)
      }
      if (nuevoEmbarque.estado !== EstadoEmbarque.ABIERTO && nuevoEmbarque.estado !== EstadoEmbarque.EN_RUTA) {
        throw new Error(`EMBARQUE_DESTINO_NO_DISPONIBLE: Embarque destino #${nuevoEmbarque.numero} esta ${nuevoEmbarque.estado}`)
      }
      updateData.estadoEntrega = 'EN_RUTA'
      updateData.estado = 'EN_RUTA'
      updateData.embarqueId = cuadre.nuevoEmbarqueId
    }

    await client.pedido.update({ where: { id: pedido.id }, data: updateData })

    for (const item of pedido.items) {
      await client.pedidoItem.updateMany({
        where: { pedidoId: pedido.id, producto: item.producto },
        data: { cantEntrega: 0 },
      })
    }

    pedidosActualizados.push({ id: pedido.id, estado: updateData.estadoEntrega as string })
    return 0
  }

  private async updatePedidoItems(
    client: TxOrPrisma,
    pedidoId: string,
    entProd: ProductosEntregados,
    precios: PreciosPedido,
  ): Promise<void> {
    const precioKeyMap: Record<string, keyof PreciosPedido> = {
      PACA_AGUA: 'pacaAgua',
      PACA_HIELO: 'pacaHielo',
      BOTELLON_FAB: 'botellonFab',
      BOTELLON_DOM: 'botellonDom',
      BOLSA_AGUA: 'bolsaAgua',
      BOLSA_HIELO: 'bolsaHielo',
    }

    const itemUpdates = [
      { producto: 'PACA_AGUA', cantidad: entProd.cPacaAguaEnt },
      { producto: 'PACA_HIELO', cantidad: entProd.cPacaHieloEnt },
      { producto: 'BOTELLON_FAB', cantidad: entProd.cBotellonFabEnt },
      { producto: 'BOTELLON_DOM', cantidad: entProd.cBotellonDomEnt },
      { producto: 'BOLSA_AGUA', cantidad: entProd.cBolsaAguaEnt },
      { producto: 'BOLSA_HIELO', cantidad: entProd.cBolsaHieloEnt },
    ]

    for (const itemUpd of itemUpdates) {
      await client.pedidoItem.updateMany({
        where: { pedidoId, producto: itemUpd.producto },
        data: {
          cantEntrega: itemUpd.cantidad,
          precio: precios[precioKeyMap[itemUpd.producto]] || 0,
        },
      })
    }
  }

  private async logPrecioCierre(
    client: TxOrPrisma,
    pedido: PedidoRaw,
    totalReal: number,
  ): Promise<void> {
    const totalOriginal = toNumber(pedido.total)
    const deltaTotal = totalReal - totalOriginal
    if (Math.abs(deltaTotal) > 0.01) {
      await client.historial.create({
        data: {
          entidad: 'Pedido',
          registroId: pedido.id,
          accion: 'PRECIO_CIERRE',
          datos: JSON.stringify({
            pedidoNumero: pedido.numero,
            precioOriginal: totalOriginal,
            precioCierre: totalReal,
            delta: deltaTotal,
            deltaPct: totalOriginal > 0 ? ((deltaTotal / totalOriginal) * 100).toFixed(1) : '0',
            usuario: this.userId || 'unknown',
          }),
          usuarioId: this.userId,
        },
      })
    }
  }

  private async crearPedidoHijo(
    client: TxOrPrisma,
    pedido: PedidoRaw,
    entProd: ProductosEntregados,
    precios: PreciosPedido,
    pedidosHijosCreados: Array<{ id: string; numero: number }>,
  ): Promise<void> {
    const faltanteAgua = (pedido.cPacaAguaPed || 0) - (entProd.cPacaAguaEnt || 0)
    const faltanteHielo = (pedido.cPacaHieloPed || 0) - (entProd.cPacaHieloEnt || 0)
    const faltanteBotFab = (pedido.cBotellonFabPed || 0) - (entProd.cBotellonFabEnt || 0)
    const faltanteBotDom = (pedido.cBotellonDomPed || 0) - (entProd.cBotellonDomEnt || 0)
    const faltanteBolAgua = (pedido.cBolsaAguaPed || 0) - (entProd.cBolsaAguaEnt || 0)
    const faltanteBolHielo = (pedido.cBolsaHieloPed || 0) - (entProd.cBolsaHieloEnt || 0)

    const hayFaltante =
      faltanteAgua > 0 || faltanteHielo > 0 || faltanteBotFab > 0 ||
      faltanteBotDom > 0 || faltanteBolAgua > 0 || faltanteBolHielo > 0

    if (hayFaltante) {
      const numeroHijo = await getNextNumero(client, { model: 'pedido' })
      const totalHijo =
        precios.pacaAgua * faltanteAgua +
        precios.pacaHielo * faltanteHielo +
        precios.botellonFab * faltanteBotFab +
        precios.botellonDom * faltanteBotDom +
        precios.bolsaAgua * faltanteBolAgua +
        precios.bolsaHielo * faltanteBolHielo

      const hijo = await client.pedido.create({
        data: {
          numero: numeroHijo,
          clienteId: pedido.clienteId,
          tipo: pedido.tipo,
          canal: pedido.canal,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          origen: pedido.origen as never,
          estadoEntrega: 'PENDIENTE',
          estadoPago: 'PENDIENTE',
          estado: 'PENDIENTE',
          idOrigen: pedido.id,
          total: totalHijo,
          saldo: totalHijo,
          totalPagado: 0,
          obs: `Faltante de pedido #${pedido.numero}`,
          createdById: this.userId,
          items: {
            create: [
              ...(faltanteAgua > 0 ? [{ producto: 'PACA_AGUA', cantPedido: faltanteAgua, cantEntrega: 0, precio: precios.pacaAgua, subtotal: precios.pacaAgua * faltanteAgua }] : []),
              ...(faltanteHielo > 0 ? [{ producto: 'PACA_HIELO', cantPedido: faltanteHielo, cantEntrega: 0, precio: precios.pacaHielo, subtotal: precios.pacaHielo * faltanteHielo }] : []),
              ...(faltanteBotFab > 0 ? [{ producto: 'BOTELLON_FAB', cantPedido: faltanteBotFab, cantEntrega: 0, precio: precios.botellonFab, subtotal: precios.botellonFab * faltanteBotFab }] : []),
              ...(faltanteBotDom > 0 ? [{ producto: 'BOTELLON_DOM', cantPedido: faltanteBotDom, cantEntrega: 0, precio: precios.botellonDom, subtotal: precios.botellonDom * faltanteBotDom }] : []),
              ...(faltanteBolAgua > 0 ? [{ producto: 'BOLSA_AGUA', cantPedido: faltanteBolAgua, cantEntrega: 0, precio: precios.bolsaAgua, subtotal: precios.bolsaAgua * faltanteBolAgua }] : []),
              ...(faltanteBolHielo > 0 ? [{ producto: 'BOLSA_HIELO', cantPedido: faltanteBolHielo, cantEntrega: 0, precio: precios.bolsaHielo, subtotal: precios.bolsaHielo * faltanteBolHielo }] : []),
            ],
          },
        },
      })

      pedidosHijosCreados.push({ id: hijo.id, numero: hijo.numero })
    }
  }

  private async crearVentasLibres(
    client: TxOrPrisma,
    ventas: NonNullable<CerrarEmbarqueInput['ventasLibres']>,
    embarqueId: string,
  ): Promise<number> {
    let count = 0

    for (const venta of ventas) {
      const totalItems = (venta.cPacaAgua || 0) + (venta.cPacaHielo || 0) + (venta.cBotellonFab || 0) + (venta.cBotellonDom || 0) + (venta.cBolsaAgua || 0) + (venta.cBolsaHielo || 0)
      if (totalItems === 0) continue

      const totalPagado = venta.pagos.reduce((sum, p) => sum + p.monto, 0)
      const numeroVenta = await getNextNumero(client, { model: 'pedido' })

      const botellonCant = (venta.cBotellonFab || 0) + (venta.cBotellonDom || 0)
      const [precioAgua, precioHielo, precioBot, precioBolAgua, precioBolHielo] = await Promise.all([
        resolverPrecio('PACA_AGUA', venta.cPacaAgua || 0, 'DOMICILIO', null, null, client),
        resolverPrecio('PACA_HIELO', venta.cPacaHielo || 0, 'DOMICILIO', null, null, client),
        resolverPrecio('BOTELLON', botellonCant, 'DOMICILIO', null, null, client),
        resolverPrecio('BOLSA_AGUA', venta.cBolsaAgua || 0, 'DOMICILIO', null, null, client),
        resolverPrecio('BOLSA_HIELO', venta.cBolsaHielo || 0, 'DOMICILIO', null, null, client),
      ])

      const totalVenta =
        (venta.cPacaAgua || 0) * precioAgua.precio +
        (venta.cPacaHielo || 0) * precioHielo.precio +
        botellonCant * precioBot.precio +
        (venta.cBolsaAgua || 0) * precioBolAgua.precio +
        (venta.cBolsaHielo || 0) * precioBolHielo.precio

      const estadoPago = calcularEstadoPago(totalVenta, totalPagado)

      const nuevaVenta = await client.pedido.create({
        data: {
          numero: numeroVenta,
          clienteId: venta.clienteId,
          tipo: 'ENVIO',
          canal: 'DOMICILIO',
          origen: 'VENTA_LIBRE',
          estadoEntrega: 'ENTREGADO',
          estadoPago,
          estado: 'ENTREGADO',
          embarqueId,
          precioPacaAgua: precioAgua.precio,
          precioPacaHielo: precioHielo.precio,
          precioBotellonFab: 0,
          precioBotellonDom: precioBot.precio,
          precioBolsaAgua: precioBolAgua.precio,
          precioBolsaHielo: precioBolHielo.precio,
          cPacaAguaPed: venta.cPacaAgua || 0,
          cPacaAguaEnt: venta.cPacaAgua || 0,
          cPacaHieloPed: venta.cPacaHielo || 0,
          cPacaHieloEnt: venta.cPacaHielo || 0,
          cBotellonFabPed: venta.cBotellonFab || 0,
          cBotellonFabEnt: venta.cBotellonFab || 0,
          cBotellonDomPed: venta.cBotellonDom || 0,
          cBotellonDomEnt: venta.cBotellonDom || 0,
          cBolsaAguaPed: venta.cBolsaAgua || 0,
          cBolsaAguaEnt: venta.cBolsaAgua || 0,
          cBolsaHieloPed: venta.cBolsaHielo || 0,
          cBolsaHieloEnt: venta.cBolsaHielo || 0,
          total: totalVenta,
          totalPagado: totalPagado,
          saldo: totalVenta - totalPagado,
          obs: venta.obs || 'Venta libre en ruta',
          createdById: this.userId,
          items: {
            create: [
              ...((venta.cPacaAgua || 0) > 0 ? [{ producto: 'PACA_AGUA', cantPedido: venta.cPacaAgua, cantEntrega: venta.cPacaAgua, precio: precioAgua.precio, subtotal: precioAgua.precio * venta.cPacaAgua }] : []),
              ...((venta.cPacaHielo || 0) > 0 ? [{ producto: 'PACA_HIELO', cantPedido: venta.cPacaHielo, cantEntrega: venta.cPacaHielo, precio: precioHielo.precio, subtotal: precioHielo.precio * venta.cPacaHielo }] : []),
              ...(botellonCant > 0 ? [{ producto: 'BOTELLON', cantPedido: botellonCant, cantEntrega: botellonCant, precio: precioBot.precio, subtotal: precioBot.precio * botellonCant }] : []),
              ...((venta.cBolsaAgua || 0) > 0 ? [{ producto: 'BOLSA_AGUA', cantPedido: venta.cBolsaAgua, cantEntrega: venta.cBolsaAgua, precio: precioBolAgua.precio, subtotal: precioBolAgua.precio * venta.cBolsaAgua }] : []),
              ...((venta.cBolsaHielo || 0) > 0 ? [{ producto: 'BOLSA_HIELO', cantPedido: venta.cBolsaHielo, cantEntrega: venta.cBolsaHielo, precio: precioBolHielo.precio, subtotal: precioBolHielo.precio * venta.cBolsaHielo }] : []),
            ],
          },
        },
      })

      for (const pago of venta.pagos) {
        if (pago.monto > 0) {
          await client.pago.create({
            data: { pedidoId: nuevaVenta.id, metodo: pago.metodo as MetodoPago, monto: pago.monto },
          })
        }
      }

      const facturaNum = await getNextNumero(client, { model: 'factura', field: 'numero' })
      const facturaClienteId = venta.clienteId === 'CONSUMIDOR_FINAL' ? 'CONSUMIDOR_FINAL' : venta.clienteId
      await client.factura.create({
        data: {
          numero: `FAC-${facturaNum.toString().padStart(5, '0')}`,
          clienteId: facturaClienteId,
          pedidoId: nuevaVenta.id,
          subtotal: totalVenta,
          total: totalVenta,
          saldo: totalVenta - totalPagado,
          estado: totalPagado >= totalVenta ? 'PAGADA' : 'EMITIDA',
        },
      })

      count++
    }

    return count
  }

  private conciliarProductos(
    embarque: { productos: Array<{ producto: string; cargadas: number }> },
    pedidosRaw: PedidoRaw[],
    ventasLibres: CerrarEmbarqueInput['ventasLibres'],
    productosRetorno: CerrarEmbarqueInput['productosRetorno'],
  ): { totalDiscrepancia: number; discrepanciasPorProducto: Array<{ producto: string; discrepancia: number }> } {
    const productosKeys = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO'] as const

    const totalCargado: Record<string, number> = { PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 }
    for (const prod of embarque.productos) {
      if (prod.producto in totalCargado) {
        totalCargado[prod.producto] = prod.cargadas
      }
    }

    const totalEntregado: Record<string, number> = { PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 }
    for (const p of pedidosRaw) {
      totalEntregado.PACA_AGUA += p.cPacaAguaEnt || 0
      totalEntregado.PACA_HIELO += p.cPacaHieloEnt || 0
      totalEntregado.BOTELLON += (p.cBotellonFabEnt || 0) + (p.cBotellonDomEnt || 0)
      totalEntregado.BOLSA_AGUA += p.cBolsaAguaEnt || 0
      totalEntregado.BOLSA_HIELO += p.cBolsaHieloEnt || 0
    }

    for (const v of ventasLibres ?? []) {
      totalEntregado.PACA_AGUA += v.cPacaAgua || 0
      totalEntregado.PACA_HIELO += v.cPacaHielo || 0
      totalEntregado.BOTELLON += (v.cBotellonFab || 0) + (v.cBotellonDom || 0)
      totalEntregado.BOLSA_AGUA += v.cBolsaAgua || 0
      totalEntregado.BOLSA_HIELO += v.cBolsaHielo || 0
    }

    const retornoMap: Record<string, { devueltas: number; rotas: number }> = {}
    for (const pr of productosRetorno ?? []) {
      retornoMap[pr.producto] = { devueltas: pr.devueltas, rotas: pr.rotas }
    }

    const discrepanciasPorProducto: Array<{ producto: string; discrepancia: number }> = []
    let totalDiscrepancia = 0

    for (const key of productosKeys) {
      const ret = retornoMap[key] || { devueltas: 0, rotas: 0 }
      const disc = (totalCargado[key] || 0) - (totalEntregado[key] || 0) - ret.devueltas - ret.rotas
      discrepanciasPorProducto.push({ producto: key, discrepancia: disc })
      if (disc > 0) totalDiscrepancia += disc
    }

    return { totalDiscrepancia, discrepanciasPorProducto }
  }

  private async crearDescuento(
    client: TxOrPrisma,
    trabajadorId: string,
    embarqueId: string,
    discrepancias: Array<{ producto: string; discrepancia: number }>,
  ): Promise<{ id: string; monto: number }> {
    const precioMap: Record<string, number> = {}
    for (const disc of discrepancias) {
      if (disc.discrepancia > 0) {
        const precioResult = await resolverPrecio(disc.producto as ProductCode, 1, 'DOMICILIO', null, null, client)
        precioMap[disc.producto] = precioResult.precio
      }
    }

    let montoTotal = 0
    const motivos: string[] = []
    for (const disc of discrepancias) {
      if (disc.discrepancia > 0) {
        const precio = precioMap[disc.producto] ?? precioMap['PACA_AGUA'] ?? 0
        montoTotal += disc.discrepancia * precio
        motivos.push(`${disc.discrepancia} ${disc.producto}`)
      }
    }

    const descuento = await client.descuentoRepartidor.create({
      data: {
        embarqueId,
        trabajadorId,
        monto: montoTotal,
        motivo: `Discrepancia conciliacion: ${motivos.join(', ')}`,
        justificado: false,
      },
    })

    return { id: descuento.id, monto: toNumber(descuento.monto) }
  }

  private async crearGastos(
    tx: unknown,
    gastos: CerrarEmbarqueInput['gastos'],
    embarqueId: string,
    trabajadorId: string,
  ): Promise<number> {
    let count = 0
    for (const gastoData of gastos ?? []) {
      await this.gastoRepo.create(
        {
          embarqueId,
          categoria: gastoData.categoria,
          descripcion: gastoData.nota || gastoData.categoria,
          monto: gastoData.monto,
          responsable: trabajadorId,
          notas: gastoData.nota,
          createdById: this.userId,
        },
        tx,
      )
      count++
    }
    return count
  }

  private async actualizarProductosRetorno(
    tx: unknown,
    embarqueId: string,
    productosRetorno: CerrarEmbarqueInput['productosRetorno'],
  ): Promise<void> {
    for (const pr of productosRetorno ?? []) {
      await this.productoRepo.upsert(
        embarqueId,
        pr.producto as ProductCode,
        {
          cargadas: 0,
          devueltas: pr.devueltas,
          cambios: pr.cambios,
          rotas: pr.rotas,
        },
        tx,
      )
    }
  }

  private getTx(tx: unknown): TxOrPrisma {
    return (tx as TxOrPrisma) ?? prisma
  }
}
