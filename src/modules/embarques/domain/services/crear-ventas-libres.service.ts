/**
 * CrearVentasLibresService.
 *
 * FIX F4.10-b: extrae la lógica de creación de ventas libres (~104
 * líneas) del CerrarEmbarqueUseCase. Responsabilidad única: procesar
 * el array de ventas libres que el admin capturó en ruta y crear
 * un pedido ENTREGADO + factura para cada una.
 *
 * Patrón alineado con ProcesarPedidoService (F4.10-a): service
 * dedicado, sin dependencias de Prisma (recibe client como param),
 * backward compat con default = new instance.
 */

import { resolverPrecio } from '@/lib/pricing'
import { calcularEstadoPago } from '@/lib/pedido-utils'
import { getNextNumero } from '@/lib/sequence'
import { datosConfirmacionInicial, leerMetodosRequierenConfirmacion } from '@/lib/pago-confirmacion'
import type { CerrarEmbarqueInput } from '../../application/dto'
import type { MetodoPago, PrismaClient } from '@prisma/client'

type TxOrPrisma = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
  [model: string]: unknown
}

export class CrearVentasLibresService {
  /**
   * Crea ventas libres (pedidos ENTREGADOS con factura) para cada
   * venta en el array. Retorna el conteo de ventas creadas.
   */
  async execute(
    client: TxOrPrisma,
    ventas: NonNullable<CerrarEmbarqueInput['ventasLibres']>,
    embarqueId: string,
    userId: string | undefined,
    // ADR-PAGO-REPORTADO-CONFIRMADO-001 §2: lista ya resuelta (el use case la
    // lee una vez para todo el cierre). Fallback a Config si se omite.
    metodosRequieren?: string[],
  ): Promise<number> {
    const tx = client as unknown as {
      pedido: { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string; numero: number }> }
      pago: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }
      factura: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }
      receivableEntry: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }
    }

    let count = 0
    // ADR-PAGO-REPORTADO-CONFIRMADO-001 §2: override configurable de qué métodos
    // nacen REPORTADO (default = tabla del ADR).
    const metodosConfirmacion =
      metodosRequieren ??
      (await leerMetodosRequierenConfirmacion(
        client as unknown as Parameters<typeof leerMetodosRequierenConfirmacion>[0],
      ))

    for (const venta of ventas) {
      const totalItems = (venta.cPacaAgua || 0) + (venta.cPacaHielo || 0) + (venta.cBotellonFab || 0) + (venta.cBotellonDom || 0) + (venta.cBolsaAgua || 0) + (venta.cBolsaHielo || 0)
      if (totalItems === 0) continue

      const totalPagado = venta.pagos.reduce((sum, p) => sum + p.monto, 0)
      const numeroVenta = await getNextNumero(client, { model: 'pedido' })

      const botellonCant = (venta.cBotellonFab || 0) + (venta.cBotellonDom || 0)
      const [precioAgua, precioHielo, precioBot, precioBolAgua, precioBolHielo] = await Promise.all([
        resolverPrecio('PACA_AGUA', venta.cPacaAgua || 0, 'DOMICILIO', null, null, client as unknown as PrismaClient),
        resolverPrecio('PACA_HIELO', venta.cPacaHielo || 0, 'DOMICILIO', null, null, client as unknown as PrismaClient),
        resolverPrecio('BOTELLON', botellonCant, 'DOMICILIO', null, null, client as unknown as PrismaClient),
        resolverPrecio('BOLSA_AGUA', venta.cBolsaAgua || 0, 'DOMICILIO', null, null, client as unknown as PrismaClient),
        resolverPrecio('BOLSA_HIELO', venta.cBolsaHielo || 0, 'DOMICILIO', null, null, client as unknown as PrismaClient),
      ])

      const totalVenta =
        (venta.cPacaAgua || 0) * precioAgua.precio +
        (venta.cPacaHielo || 0) * precioHielo.precio +
        botellonCant * precioBot.precio +
        (venta.cBolsaAgua || 0) * precioBolAgua.precio +
        (venta.cBolsaHielo || 0) * precioBolHielo.precio

      const estadoPago = calcularEstadoPago(totalVenta, totalPagado)

      const nuevaVenta = await tx.pedido.create({
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
          // ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001: embarque de origen inmutable.
          embarqueOrigenId: embarqueId,
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
          createdById: userId,
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
          // ADR-PAGO-REPORTADO-CONFIRMADO-001: digital cobrado en ruta nace REPORTADO.
          await tx.pago.create({
            data: {
              pedidoId: nuevaVenta.id,
              metodo: pago.metodo as MetodoPago,
              monto: pago.monto,
              // ADR-PAGO-EMBARQUE-CAPTURA-001: venta libre creada en el cierre →
              // el dinero se capturó en la misión que se está cerrando.
              embarqueId,
              ...datosConfirmacionInicial(pago.metodo, metodosConfirmacion),
            },
          })
        }
      }

      // FASE FINAL (ADR-MONETARIO-001, §12): proyección de auditoría de los pagos.
      if (totalPagado > 0) {
        await tx.receivableEntry.create({
          data: {
            pedidoId: nuevaVenta.id,
            clienteId: venta.clienteId,
            tipo: 'PAGO',
            monto: totalPagado,
            saldoResultante: totalVenta - totalPagado,
            totalPagadoResultante: totalPagado,
          },
        })
      }

      const facturaNum = await getNextNumero(client, { model: 'factura', field: 'numero' })
      const facturaClienteId = venta.clienteId === 'CONSUMIDOR_FINAL' ? 'CONSUMIDOR_FINAL' : venta.clienteId
      await tx.factura.create({
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
}
