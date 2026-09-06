// @tests G11 (decisión PO 2026-09-06, "B. Nueva demanda") — cuando el
// cliente pide unidades adicionales sobre un Pedido existente, NO se
// corrige el Pedido original (eso es `AjustarPedidoCantidadUseCase`, para
// errores de captura) — se crea un Pedido nuevo e independiente, con
// `pedidoOrigenId` apuntando al Pedido que originó la nueva demanda, para
// trazabilidad. NO es un mecanismo de "pedido-hijo": el nuevo Pedido tiene
// su propio ciclo de vida completo (numero, items, pagos, factura propios),
// no hereda nada del original.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser, createTestCliente, uniqueId } from './setup'
import { CrearPedidoUseCase } from '@/modules/pedidos/application/use-cases/CrearPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository'
import { PrismaClienteRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaClienteRepository'
import { PrismaPricingAdapter } from '@/modules/pedidos/infrastructure/repositories/PrismaPricingAdapter'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'

function buildUseCase() {
  return new CrearPedidoUseCase(
    new PrismaPedidoRepository(),
    new PrismaFacturaRepository(),
    new PrismaPagoRepository(),
    new PrismaClienteRepository(),
    new PrismaPricingAdapter(),
    new PrismaTransactionManager(),
  )
}

describe('G11 — nueva demanda → Pedido nuevo relacionado (pedidoOrigenId)', () => {
  let adminId: string
  let clienteId: string

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await createTestCliente('NuevaDemanda')).id
  })

  afterAll(async () => { await disconnect() })

  it('crea un Pedido nuevo e independiente con pedidoOrigenId apuntando al original', async () => {
    // Fiado (sin pagos) para no depender del precio real resuelto — este
    // test verifica la relación entre pedidos, no montos.
    const { pedido: original } = await buildUseCase().execute({
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }],
      pagos: [],
      createdById: adminId,
      createdByRole: 'ADMIN',
      offlineId: uniqueId('nd-original'),
    })

    // El cliente, después, pide 5 pacas MÁS — no es que se equivocaron al
    // capturar las 10 originales, quiere más.
    const { pedido: nuevo } = await buildUseCase().execute({
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }],
      pagos: [],
      createdById: adminId,
      createdByRole: 'ADMIN',
      pedidoOrigenId: original.id,
      offlineId: uniqueId('nd-nuevo'),
    })

    // Pedido genuinamente independiente: número propio, no el mismo pedido.
    expect(nuevo.id).not.toBe(original.id)
    expect(nuevo.numero).not.toBe(original.numero)

    const row = await testPrisma.pedido.findUniqueOrThrow({ where: { id: nuevo.id } })
    expect(row.pedidoOrigenId).toBe(original.id)

    // El Pedido original queda completamente intacto — la nueva demanda no
    // le modificó nada (a diferencia de una corrección).
    const originalRow = await testPrisma.pedido.findUniqueOrThrow({ where: { id: original.id } })
    expect(originalRow.pedidoOrigenId).toBeNull()
    expect(Number(originalRow.total)).toBe(original.total)

    // El nuevo Pedido tiene su propia Factura, independiente de la original
    // (su total refleja SOLO las 5 unidades nuevas, no las 10 del original).
    const facturaNueva = await testPrisma.factura.findUniqueOrThrow({ where: { pedidoId: nuevo.id } })
    expect(Number(facturaNueva.total)).toBe(nuevo.total)
    expect(nuevo.total).not.toBe(original.total)
  })

  it('rechaza pedidoOrigenId que no existe', async () => {
    await expect(
      buildUseCase().execute({
        clienteId,
        canal: 'DOMICILIO',
        origen: 'PEDIDO',
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 6_500 }],
        createdById: adminId,
        createdByRole: 'ADMIN',
        pedidoOrigenId: 'pedido-inexistente-xyz',
        offlineId: uniqueId('nd-invalido'),
      }),
    ).rejects.toThrow('PEDIDO_ORIGEN_NOT_FOUND')
  })

  it('el Pedido original puede tener MÚLTIPLES pedidos relacionados', async () => {
    const { pedido: original } = await buildUseCase().execute({
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 65_000 }],
      createdById: adminId,
      createdByRole: 'ADMIN',
      offlineId: uniqueId('nd-multi-original'),
    })

    await buildUseCase().execute({
      clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 3 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 19_500 }],
      createdById: adminId, createdByRole: 'ADMIN',
      pedidoOrigenId: original.id,
      offlineId: uniqueId('nd-multi-1'),
    })
    await buildUseCase().execute({
      clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 13_000 }],
      createdById: adminId, createdByRole: 'ADMIN',
      pedidoOrigenId: original.id,
      offlineId: uniqueId('nd-multi-2'),
    })

    const relacionados = await testPrisma.pedido.count({ where: { pedidoOrigenId: original.id } })
    expect(relacionados).toBe(2)
  })
})
