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

import { resolverPreciosPedido, type ProductCode } from '@/lib/pricing'
import { calcularEstadoPago, puedeFiar } from '@/lib/pedido-utils'
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'
import type { VentaLibreResumen } from './senales-cierre.service'
import { GetFiadoStatusUseCase } from '@/modules/pedidos/application/use-cases/GetFiadoStatusUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaClienteRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaClienteRepository'
import type { TransactionClient } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'
import { getNextNumero } from '@/lib/sequence'
import { datosConfirmacionInicial, leerMetodosRequierenConfirmacion } from '@/lib/pago-confirmacion'
import type { CerrarEmbarqueInput } from '../../application/dto'
import type { MetodoPago, PrismaClient } from '@prisma/client'

type TxOrPrisma = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
  [model: string]: unknown
}

export class CrearVentasLibresService {
  constructor(
    // F1: la MISMA autoridad de crédito que usan Preview/Crear/venta-libre.
    private readonly fiadoAuthority: GetFiadoStatusUseCase = new GetFiadoStatusUseCase(
      new PrismaPedidoRepository(),
      new PrismaClienteRepository(),
    ),
  ) {}

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
    // ADR-CIERRE-002 §5: resumen por venta (saldo y unidades) para calcular señales.
    resumenes?: VentaLibreResumen[],
  ): Promise<number> {
    const tx = client as unknown as {
      pedido: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string; numero: number }>
        findUnique: (args: { where: { id: string }; select: Record<string, boolean> }) => Promise<{ id: string; clienteId: string } | null>
      }
      pago: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }
      cliente: { findUnique: (args: { where: { id: string }; select: Record<string, boolean> }) => Promise<{ id: string; verificado: boolean; creadoPorRol: string } | null> }
      negocio: { findUnique: (args: { where: { id: string }; select: Record<string, boolean> }) => Promise<{ id: string; clienteId: string } | null> }
      pedidoExcepcionCredito: { updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }> }
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
      const totalPagado = venta.pagos.reduce((sum, p) => sum + p.monto, 0)
      if (totalItems === 0) {
        // Fila en blanco: se ignora. Pero un pago sin productos NO se descarta en
        // silencio (ADR-CIERRE-002 §4, #444): el dinero se perdería sin rastro.
        if (totalPagado > 0) {
          throw new Error('VENTA_LIBRE_PAGO_SIN_PRODUCTOS: registraste un pago sin productos en una venta libre. Agrega los productos o quita el pago.')
        }
        continue
      }

      const esAnonimo = venta.clienteId === CANONICAL_CONSUMIDOR_FINAL_ID
      const cliente = esAnonimo
        ? null
        : await tx.cliente.findUnique({ where: { id: venta.clienteId }, select: { id: true, verificado: true, creadoPorRol: true } })
      if (!esAnonimo && !cliente) {
        throw new Error(`VENTA_LIBRE_CLIENTE_NO_ENCONTRADO: el cliente ${venta.clienteId} de la venta libre no existe.`)
      }

      // Vínculos opcionales (ADR-CIERRE-002 §4): tienda y pedido del que nace la compra adicional.
      if (venta.negocioId) {
        const negocio = await tx.negocio.findUnique({ where: { id: venta.negocioId }, select: { id: true, clienteId: true } })
        if (!negocio || negocio.clienteId !== venta.clienteId) {
          throw new Error('NEGOCIO_INVALIDO: la tienda elegida no pertenece al cliente de la venta libre.')
        }
      }
      if (venta.pedidoOrigenId) {
        const origen = await tx.pedido.findUnique({ where: { id: venta.pedidoOrigenId }, select: { id: true, clienteId: true } })
        if (!origen || origen.clienteId !== venta.clienteId) {
          throw new Error('PEDIDO_ORIGEN_INVALIDO: el pedido relacionado no existe o es de otro cliente.')
        }
      }

      const botellonCant = (venta.cBotellonFab || 0) + (venta.cBotellonDom || 0)
      // Precios con la MISMA prioridad que un pedido real: negocio → cliente → volumen → base
      // (antes se ignoraban los precios especiales, #445).
      const todasLasLineas: Array<{ codigo: ProductCode; cantidad: number }> = [
        { codigo: 'PACA_AGUA', cantidad: venta.cPacaAgua || 0 },
        { codigo: 'PACA_HIELO', cantidad: venta.cPacaHielo || 0 },
        { codigo: 'BOTELLON', cantidad: botellonCant },
        { codigo: 'BOLSA_AGUA', cantidad: venta.cBolsaAgua || 0 },
        { codigo: 'BOLSA_HIELO', cantidad: venta.cBolsaHielo || 0 },
      ]
      const lineasPrecio = todasLasLineas.filter((l) => l.cantidad > 0)
      const resueltos = await resolverPreciosPedido(
        lineasPrecio,
        'DOMICILIO',
        esAnonimo ? undefined : venta.clienteId,
        venta.negocioId ?? null,
        client as unknown as PrismaClient,
      )
      const precioDe = (codigo: ProductCode) => ({ precio: resueltos.find((r) => r.codigo === codigo)?.precio ?? 0 })
      const precioAgua = precioDe('PACA_AGUA')
      const precioHielo = precioDe('PACA_HIELO')
      const precioBot = precioDe('BOTELLON')
      const precioBolAgua = precioDe('BOLSA_AGUA')
      const precioBolHielo = precioDe('BOLSA_HIELO')

      const totalVenta =
        (venta.cPacaAgua || 0) * precioAgua.precio +
        (venta.cPacaHielo || 0) * precioHielo.precio +
        botellonCant * precioBot.precio +
        (venta.cBolsaAgua || 0) * precioBolAgua.precio +
        (venta.cBolsaHielo || 0) * precioBolHielo.precio

      // Un pago mayor al total violaba chk_pedido_montopagado_le_total (500). Es un
      // error de captura: se rechaza con un mensaje claro (#444).
      if (totalPagado > totalVenta + 0.01) {
        throw new Error(`PAGO_EXCEDE_TOTAL: el pago de la venta libre (${totalPagado}) es mayor que su total (${totalVenta}).`)
      }

      // Crédito (ADR-CIERRE-002 §4): una venta que deja saldo exige un deudor válido.
      const saldoVenta = totalVenta - totalPagado
      let excepcionCreditoAplicada: string | undefined
      if (saldoVenta > 0.01) {
        if (esAnonimo) {
          throw new Error('DEUDOR_REQUERIDO: la venta al paso exige pago completo: sin cliente no hay a quién cobrarle después.')
        }
        if (cliente && !puedeFiar({ verificado: cliente.verificado, creadoPorRol: cliente.creadoPorRol, id: cliente.id }, false)) {
          throw new Error('PAGO_COMPLETO_OBLIGATORIO: este cliente no está verificado y debe pagar completo.')
        }
        const fiado = await this.fiadoAuthority.execute({
          clienteId: venta.clienteId,
          operacion: { total: totalVenta, totalPagado },
          excepcionId: venta.excepcionId,
          tx: client as unknown as TransactionClient,
        })
        if (fiado.errorDeuda) throw new Error(`CLIENTE_DEBE: ${fiado.errorDeuda}`)
        excepcionCreditoAplicada = fiado.excepcionAplicada?.id
      }

      const numeroVenta = await getNextNumero(client, { model: 'pedido' })
      const estadoPago = calcularEstadoPago(totalVenta, totalPagado)

      const nuevaVenta = await tx.pedido.create({
        data: {
          numero: numeroVenta,
          clienteId: venta.clienteId,
          negocioId: venta.negocioId ?? null,
          pedidoOrigenId: venta.pedidoOrigenId ?? null,
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

      // F2: consumo atómico, una sola vez, de la excepción de crédito autorizada.
      if (excepcionCreditoAplicada) {
        const consumo = await tx.pedidoExcepcionCredito.updateMany({
          where: { id: excepcionCreditoAplicada, pedidoId: null },
          data: { pedidoId: nuevaVenta.id },
        })
        if (consumo.count === 0) throw new Error('EXCEPCION_CREDITO_YA_CONSUMIDA: la excepción de crédito ya se usó en otra venta.')
      }

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

      resumenes?.push({
        clienteId: venta.clienteId,
        saldo: saldoVenta,
        unidades: {
          PACA_AGUA: venta.cPacaAgua || 0,
          PACA_HIELO: venta.cPacaHielo || 0,
          BOTELLON: botellonCant,
          BOLSA_AGUA: venta.cBolsaAgua || 0,
          BOLSA_HIELO: venta.cBolsaHielo || 0,
        },
      })
      count++
    }

    return count
  }
}
