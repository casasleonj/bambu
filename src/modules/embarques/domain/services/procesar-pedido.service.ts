/**
 * ProcesarPedido Domain Service.
 *
 * FIX F4.10-a: extrae la lógica de procesamiento de UN pedido individual
 * durante el cierre de embarque. Antes: ~119 líneas inline en
 * CerrarEmbarqueUseCase.procesarPedido(). Ahora: service dedicado
 * con responsabilidades claras.
 *
 * Responsabilidades:
 * - Procesar pedido ENTREGADO (actualizar cantidades, precios, factura)
 * - Procesar pedido PARCIAL (crear pedido hijo con faltantes)
 * - Procesar pedido NO_ENTREGADO (reasignar a nuevo embarque o dejar pendiente)
 * - Actualizar PedidoItems
 * - Loggear cambios de precio en historial
 *
 * Dependencias:
 * - `calcularEstadoPago` (lib/pedido-utils) — calcular estado de pago
 * - `getNextNumero` (lib/sequence) — generar número para pedido hijo
 * - `logPrecioCierre` interno — crear historial.PRECIO_CIERRE
 *
 * NO tiene dependencias de Prisma — recibe el `client` (TxOrPrisma)
 * como parámetro. Esto permite que el llamador (use case) decida si
 * corre dentro o fuera de una tx.
 */

import { EstadoEmbarque } from '@prisma/client'
import { calcularEstadoPago } from '@/lib/pedido-utils'
import { getNextNumero } from '@/lib/sequence'
import type { CerrarEmbarqueInput } from '../../application/dto'
import type { MetodoPago } from '@prisma/client'

// Tipo del cliente (Tx o Prisma global)
// Reutilizamos la misma técnica que el use case
type TxOrPrisma = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
  [model: string]: any
}

export interface PedidoRawInput {
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

export interface PreciosPedido {
  pacaAgua: number
  pacaHielo: number
  botellonFab: number
  botellonDom: number
  bolsaAgua: number
  bolsaHielo: number
}

export interface ProductosEntregados {
  cPacaAguaEnt: number
  cPacaHieloEnt: number
  cBotellonFabEnt: number
  cBotellonDomEnt: number
  cBolsaAguaEnt: number
  cBolsaHieloEnt: number
}

export interface ResultadoProcesarPedido {
  totalReal: number
  estado: 'ENTREGADO' | 'NO_ENTREGADO' | 'EN_RUTA'  // EN_RUTA = reasignado
}

function toNumber(value: number | { toNumber: () => number } | null | undefined): number {
  if (value === null || value === undefined) return 0
  return typeof value === 'number' ? value : value.toNumber()
}

export class ProcesarPedidoService {
  /**
   * Procesa un pedido individual según su estado de entrega:
   * - ENTREGADO: actualiza cantidades, precios, factura
   * - PARCIAL: idem ENTREGADO + crea pedido hijo con faltantes
   * - NO_ENTREGADO: reasigna a nuevo embarque o desasigna
   *
   * @returns totalReal (monto real del pedido, 0 si NO_ENTREGADO)
   */
  async execute(
    client: TxOrPrisma,
    pedido: PedidoRawInput,
    cuadre: CerrarEmbarqueInput['pedidos'][number],
    userRole: string | undefined,
    userId: string | undefined,
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

    const precios: PreciosPedido = (cuadre.preciosReales && userRole === 'ADMIN')
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
    const tx = client as unknown as {
      pedido: {
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string; numero: number }>
      }
      pago: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }
      factura: { update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown> }
      pedidoItem: { updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown> }
      historial: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }
      embarque: { findUnique: (args: { where: { id: string }; select?: Record<string, boolean> }) => Promise<{ id: string; estado: string; numero: number } | null> }
    }
    await tx.pedido.update({
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
    await this.logPrecioCierre(client, pedido, totalReal, userId)

    // Validate payments (1% tolerance)
    const montoPagadoTotal = cuadre.pagos.reduce((sum, p) => sum + p.monto, 0)
    if (montoPagadoTotal > totalReal * 1.01) {
      throw new Error(`PAGOS_EXCEDIDOS: Pagos ($${montoPagadoTotal}) exceden total real ($${totalReal}) para pedido #${pedido.numero}`)
    }

    pedidosActualizados.push({ id: pedido.id, estado: 'ENTREGADO' })

    // Register payments
    for (const pago of cuadre.pagos) {
      if (pago.monto > 0) {
        await tx.pago.create({
          data: { pedidoId: pedido.id, metodo: pago.metodo as MetodoPago, monto: pago.monto },
        })
      }
    }

    // Update factura
    if (pedido.factura) {
      await tx.factura.update({
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
      await this.crearPedidoHijo(client, pedido, entProd, precios, pedidosHijosCreados, userId)
    }

    return totalReal
  }

  /**
   * Maneja caso NO_ENTREGADO: reasigna a nuevo embarque o desasigna.
   * @returns 0 (no genera venta)
   */
  private async procesarNoEntregado(
    client: TxOrPrisma,
    pedido: PedidoRawInput,
    cuadre: CerrarEmbarqueInput['pedidos'][number],
    pedidosActualizados: Array<{ id: string; estado: string }>,
  ): Promise<number> {
    const tx = client as unknown as {
      pedido: { update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown> }
      embarque: { findUnique: (args: { where: { id: string }; select?: Record<string, boolean> }) => Promise<{ id: string; estado: string; numero: number } | null> }
      pedidoItem: { updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown> }
    }

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
      const nuevoEmbarque = await tx.embarque.findUnique({
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

    await tx.pedido.update({ where: { id: pedido.id }, data: updateData })

    for (const item of pedido.items) {
      await tx.pedidoItem.updateMany({
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
    const tx = client as unknown as {
      pedidoItem: { updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown> }
    }

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
      await tx.pedidoItem.updateMany({
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
    pedido: PedidoRawInput,
    totalReal: number,
    userId: string | undefined,
  ): Promise<void> {
    const tx = client as unknown as {
      historial: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }
    }

    const totalOriginal = toNumber(pedido.total)
    const deltaTotal = totalReal - totalOriginal
    if (Math.abs(deltaTotal) > 0.01) {
      await tx.historial.create({
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
            usuario: userId || 'unknown',
          }),
          usuarioId: userId,
        },
      })
    }
  }

  private async crearPedidoHijo(
    client: TxOrPrisma,
    pedido: PedidoRawInput,
    entProd: ProductosEntregados,
    precios: PreciosPedido,
    pedidosHijosCreados: Array<{ id: string; numero: number }>,
    userId: string | undefined,
  ): Promise<void> {
    const tx = client as unknown as {
      pedido: { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string; numero: number }> }
    }

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

      const hijo = await tx.pedido.create({
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
          createdById: userId,
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
}
