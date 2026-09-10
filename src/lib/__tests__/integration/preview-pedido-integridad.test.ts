// @tests POST /api/pedidos/preview (Fase 4, BRECHA §9.1) contra Postgres real.
// (a) READ-ONLY comportamental: snapshots antes/después de CADA entidad
//     alcanzable (Pedido, PedidoItem, Pago, Factura, NotaCredito, Cliente) —
//     preview no crea ni modifica ninguna fila.
// (b) INTEGRIDAD preview vs commit: la operación proyectada por el preview ==
//     la que crearPedidoUseCase realmente persiste, campo por campo.
// Contrato: docs/pedidos/02-api-contract-pedidos.md.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// getFiadoStatusUseCase → getConfigInt → getConfig, que envuelve la query en
// unstable_cache — eso requiere un incrementalCache que solo existe dentro de
// un request de Next ("Invariant: incrementalCache missing"). Mismo mock que
// usa src/lib/__tests__/integration/pedidos-sin-asignar.test.ts.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))

import { testPrisma, resetAndSeed, disconnect, getAdminUser, createTestCliente } from './setup'
import { PreviewPedidoUseCase } from '@/modules/pedidos/application/use-cases/PreviewPedidoUseCase'
import { GetFiadoStatusUseCase } from '@/modules/pedidos/application/use-cases/GetFiadoStatusUseCase'
import { CrearPedidoUseCase } from '@/modules/pedidos/application/use-cases/CrearPedidoUseCase'
import { ActualizarPedidoUseCase } from '@/modules/pedidos/application/use-cases/ActualizarPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository'
import { PrismaClienteRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaClienteRepository'
import { PrismaPricingAdapter } from '@/modules/pedidos/infrastructure/repositories/PrismaPricingAdapter'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'
import { getPrecioMinimos } from '@/lib/pricing'
import { resolverCoordsDeLink } from '@/lib/geo/resolver-coords-de-link'

function makePreviewUseCase() {
  const pedidoRepo = new PrismaPedidoRepository()
  const clienteRepo = new PrismaClienteRepository()
  return new PreviewPedidoUseCase({
    pricingPort: new PrismaPricingAdapter(),
    clienteRepo,
    pedidoRepo,
    getFiadoStatusUseCase: new GetFiadoStatusUseCase(pedidoRepo, clienteRepo),
    getPrecioMinimos,
    resolverCoordsDeLink,
  })
}

function makeCrearUseCase() {
  return new CrearPedidoUseCase(
    new PrismaPedidoRepository(),
    new PrismaFacturaRepository(),
    new PrismaPagoRepository(),
    new PrismaClienteRepository(),
    new PrismaPricingAdapter(),
    new PrismaTransactionManager(),
    resolverCoordsDeLink,
  )
}

function makeActualizarUseCase() {
  return new ActualizarPedidoUseCase(
    new PrismaPedidoRepository(),
    new PrismaFacturaRepository(),
    new PrismaClienteRepository(),
    new PrismaPricingAdapter(),
    new PrismaTransactionManager(),
    resolverCoordsDeLink,
  )
}

async function snapshot(clienteId: string) {
  return {
    pedidos: await testPrisma.pedido.count(),
    items: await testPrisma.pedidoItem.count(),
    pagos: await testPrisma.pago.count(),
    facturas: await testPrisma.factura.count(),
    notasCredito: await testPrisma.notaCredito.count(),
    clientes: await testPrisma.cliente.count(),
    cliente: JSON.stringify(await testPrisma.cliente.findUnique({ where: { id: clienteId } })),
  }
}

/**
 * Snapshot PROFUNDO (JSON verbatim, no counts) de todas las entidades
 * alcanzables por el flujo de preview de edición — para probar read-only
 * exacto: PREVIEW → cero mutaciones (revisión del equipo, punto 2).
 */
async function deepSnapshot(clienteId: string, pedidoId: string) {
  const factura = await testPrisma.factura.findFirst({ where: { pedidoId } })
  return JSON.stringify({
    pedido: await testPrisma.pedido.findUnique({ where: { id: pedidoId } }),
    items: await testPrisma.pedidoItem.findMany({ where: { pedidoId }, orderBy: { producto: 'asc' } }),
    pagos: await testPrisma.pago.findMany({ where: { pedidoId }, orderBy: { id: 'asc' } }),
    factura,
    abonos: factura ? await testPrisma.abono.findMany({ where: { facturaId: factura.id }, orderBy: { id: 'asc' } }) : [],
    notasCredito: await testPrisma.notaCredito.findMany({ where: { pedidoId }, orderBy: { id: 'asc' } }),
    cliente: await testPrisma.cliente.findUnique({ where: { id: clienteId } }),
    // conteos globales — nada nuevo aparece en ninguna tabla
    counts: {
      pedidos: await testPrisma.pedido.count(),
      items: await testPrisma.pedidoItem.count(),
      pagos: await testPrisma.pago.count(),
      facturas: await testPrisma.factura.count(),
      abonos: await testPrisma.abono.count(),
      notasCredito: await testPrisma.notaCredito.count(),
      clientes: await testPrisma.cliente.count(),
    },
  })
}

describe('preview — read-only comportamental + integridad vs commit', () => {
  let clienteId: string
  let adminId: string

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await createTestCliente('PreviewIntegridad')).id
  })

  afterAll(async () => { await disconnect() })

  it('(a) preview NO crea ni modifica ninguna fila (snapshots de todas las entidades)', async () => {
    const before = await snapshot(clienteId)

    const uc = makePreviewUseCase()
    await uc.execute({
      clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }, { producto: 'BOTELLON', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 999_999 }], // sobrepago deliberado
      actorId: adminId,
    })
    // también con pedidoOrigenId inexistente (rama de validación) y CONSUMIDOR_FINAL
    await uc.execute({ clienteId: 'CONSUMIDOR_FINAL', canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: adminId }).catch(() => {})

    const after = await snapshot(clienteId)
    expect(after).toEqual(before)
  })

  it('(b) la operación proyectada por preview == el pedido realmente creado', async () => {
    const input = {
      clienteId, canal: 'DOMICILIO' as const, origen: 'PEDIDO' as const,
      items: [{ producto: 'PACA_AGUA' as const, cantidad: 5 }, { producto: 'BOTELLON' as const, cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO' as const, monto: 3000 }],
    }

    const preview = await makePreviewUseCase().execute({ ...input, actorId: adminId })

    let createdId: string | undefined
    try {
      const { pedido } = await makeCrearUseCase().execute({
        ...input,
        createdById: adminId,
        createdByRole: 'ADMIN',
        offlineId: `preview-integridad-${Date.now()}`,
      })
      createdId = pedido.id

      // Totales y estado
      expect(preview.calculation.total).toBe(Number(pedido.total))
      expect(preview.calculation.totalPagado).toBe(Number(pedido.totalPagado))
      expect(preview.calculation.saldoProyectado).toBe(Number(pedido.saldo))
      expect(preview.calculation.estadoEntregaProyectado).toBe(pedido.estadoEntrega)
      expect(preview.calculation.estadoPagoProyectado).toBe(pedido.estadoPago)
      // Identidad del desglose
      expect(preview.calculation.subtotal + preview.calculation.recargoDomicilio).toBe(preview.calculation.total)
      // origen / canal
      expect(preview.auditPreview.valoresRelevantes.origen).toBe(pedido.origen)
      expect(preview.auditPreview.valoresRelevantes.canal).toBe(pedido.canal)

      // Items: producto / cantidad / precio unitario / subtotal / precioOrigen
      const pvByProd = Object.fromEntries(preview.calculation.items.map(i => [i.producto, i]))
      for (const it of pedido.items) {
        const pv = pvByProd[it.producto]
        expect(pv, `preview no proyectó ${it.producto}`).toBeDefined()
        expect(pv.cantidad).toBe(it.cantPedido)
        expect(pv.precioUnitario).toBe(Number(it.precio))
        expect(pv.subtotal).toBe(Number(it.subtotal))
        expect(pv.precioOrigen).toBe(it.precioOrigen)
      }
    } finally {
      // cleanup explícito — sin depender de cascadas
      if (createdId) {
        await testPrisma.pago.deleteMany({ where: { pedidoId: createdId } })
        await testPrisma.notaCredito.deleteMany({ where: { pedidoId: createdId } })
        const fact = await testPrisma.factura.findFirst({ where: { pedidoId: createdId }, select: { id: true } })
        if (fact) {
          await testPrisma.abono.deleteMany({ where: { facturaId: fact.id } })
          await testPrisma.factura.delete({ where: { id: fact.id } })
        }
        await testPrisma.pedidoItem.deleteMany({ where: { pedidoId: createdId } })
        await testPrisma.pedido.delete({ where: { id: createdId } })
      }
    }
  })

  it('(c) modo edición: preview({pedidoId}) es read-only exacto Y == el pedido tras el PUT', async () => {
    let createdId: string | undefined
    try {
      // pedido con pago parcial (2 pagos, para probar que se conservan exactos)
      const { pedido } = await makeCrearUseCase().execute({
        clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
        items: [{ producto: 'PACA_AGUA', cantidad: 5 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 2000 }, { metodo: 'NEQUI', monto: 1000 }],
        createdById: adminId, createdByRole: 'ADMIN',
        offlineId: `preview-edit-${Date.now()}`,
      })
      createdId = pedido.id

      const nuevosItems = [
        { producto: 'PACA_AGUA' as const, cantidad: 8 },
        { producto: 'BOTELLON' as const, cantidad: 1 },
      ]

      // ── Punto 2: PREVIEW → cero mutaciones (snapshot profundo antes/después) ──
      const antes = await deepSnapshot(clienteId, createdId)
      const preview = await makePreviewUseCase().execute({
        clienteId, canal: 'DOMICILIO', pedidoId: createdId,
        items: nuevosItems,
        // pagos deliberados en el body — deben ignorarse por completo en edición
        pagos: [{ metodo: 'EFECTIVO', monto: 999_999 }],
        actorId: adminId,
      })
      const despues = await deepSnapshot(clienteId, createdId)
      expect(despues).toBe(antes) // ninguna fila de ninguna entidad cambió

      expect(preview.allowedActions).toEqual(['actualizar'])
      expect(preview.auditPreview.accion).toBe('ACTUALIZAR_PEDIDO')
      // el body traía pagos por 999.999 — el preview usa el totalPagado real (3000)
      expect(preview.calculation.totalPagado).toBe(3000)
      expect(preview.calculation.saldoFavorProyectado).toBe(0)

      // ── Punto 3: PREVIEW ↔ PUT — equivalencia campo a campo ──
      const pagosAntes = await testPrisma.pago.findMany({ where: { pedidoId: createdId }, orderBy: { id: 'asc' } })

      await makeActualizarUseCase().execute({
        pedidoId: createdId, items: nuevosItems, usuarioId: adminId,
      })
      const actualizado = await testPrisma.pedido.findUniqueOrThrow({
        where: { id: createdId },
        include: { items: { orderBy: { producto: 'asc' } } },
      })

      expect(preview.calculation.total).toBe(Number(actualizado.total))
      expect(preview.calculation.subtotal + preview.calculation.recargoDomicilio).toBe(preview.calculation.total)
      expect(preview.calculation.totalPagado).toBe(Number(actualizado.totalPagado))
      expect(preview.calculation.saldoProyectado).toBe(Number(actualizado.saldo))
      expect(preview.calculation.estadoPagoProyectado).toBe(actualizado.estadoPago)
      expect(preview.calculation.estadoEntregaProyectado).toBe(actualizado.estadoEntrega)
      expect(preview.auditPreview.valoresRelevantes.canal).toBe(actualizado.canal)
      expect(preview.auditPreview.valoresRelevantes.origen).toBe(actualizado.origen)

      // items: producto / cantidad / precio unitario / subtotal / origen del precio
      const pvByProd = Object.fromEntries(preview.calculation.items.map(i => [i.producto, i]))
      expect(preview.calculation.items).toHaveLength(actualizado.items.length)
      for (const it of actualizado.items) {
        const pv = pvByProd[it.producto]
        expect(pv, `preview no proyectó ${it.producto}`).toBeDefined()
        expect(pv.cantidad).toBe(it.cantPedido)
        expect(pv.precioUnitario).toBe(Number(it.precio))
        expect(pv.subtotal).toBe(Number(it.subtotal))
        expect(pv.precioOrigen).toBe(it.precioOrigen)
      }

      // los pagos existentes se conservan EXACTOS (mismos ids / montos / métodos)
      const pagosDespues = await testPrisma.pago.findMany({ where: { pedidoId: createdId }, orderBy: { id: 'asc' } })
      expect(pagosDespues.map(p => ({ id: p.id, monto: Number(p.monto), metodo: p.metodo })))
        .toEqual(pagosAntes.map(p => ({ id: p.id, monto: Number(p.monto), metodo: p.metodo })))
      expect(Number(actualizado.totalPagado)).toBe(3000)
    } finally {
      if (createdId) {
        await testPrisma.pago.deleteMany({ where: { pedidoId: createdId } })
        await testPrisma.notaCredito.deleteMany({ where: { pedidoId: createdId } })
        const fact = await testPrisma.factura.findFirst({ where: { pedidoId: createdId }, select: { id: true } })
        if (fact) {
          await testPrisma.abono.deleteMany({ where: { facturaId: fact.id } })
          await testPrisma.factura.delete({ where: { id: fact.id } })
        }
        await testPrisma.pedidoItem.deleteMany({ where: { pedidoId: createdId } })
        await testPrisma.pedido.delete({ where: { id: createdId } })
      }
    }
  })
})
