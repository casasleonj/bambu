// @tests G6/ventaRapida→origen (decisión PO 2026-09-06) — `origen` y `canal`
// son dimensiones independientes de un Pedido, verificado contra Postgres
// real. `origen` responde a si hay un cliente real detrás de la operación
// (PEDIDO) o no (VENTA_RAPIDA, vía CONSUMIDOR_FINAL) — nunca se deriva de
// `canal`. Antes `ventaRapida: canal === 'PUNTO'` clasificaba como venta
// rápida a un cliente real que recoge en mostrador, y hacía imposible
// `VENTA_RAPIDA + DOMICILIO` (condición explícita del ADR-PEDIDO-ORIGEN-
// CANAL-001, sección "Migración": "CrearPedidoUseCase con origen:
// 'VENTA_RAPIDA' + canal: 'DOMICILIO' → pedido válido").
//
// Cubre las 4 combinaciones origen × canal que el PO pidió explícitamente.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId, getAdminUser, createTestCliente } from './setup'
import { CrearPedidoUseCase } from '@/modules/pedidos/application/use-cases/CrearPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository'
import { PrismaClienteRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaClienteRepository'
import { PrismaPricingAdapter } from '@/modules/pedidos/infrastructure/repositories/PrismaPricingAdapter'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'

describe('CrearPedidoUseCase — origen y canal son independientes (G6/ventaRapida→origen)', () => {
  let useCase: CrearPedidoUseCase
  let adminId: string
  let clienteRealId: string

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteRealId = (await createTestCliente('OrigenCanal')).id
  })

  afterAll(async () => { await disconnect() })

  beforeEach(() => {
    useCase = new CrearPedidoUseCase(
      new PrismaPedidoRepository(),
      new PrismaFacturaRepository(),
      new PrismaPagoRepository(),
      new PrismaClienteRepository(),
      new PrismaPricingAdapter(),
      new PrismaTransactionManager(),
    )
  })

  it('PEDIDO + PUNTO: cliente real, recoge en mostrador', async () => {
    const { pedido } = await useCase.execute({
      clienteId: clienteRealId,
      canal: 'PUNTO',
      origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 6500 }],
      createdById: adminId,
      createdByRole: 'ADMIN',
      offlineId: uniqueId('oc-pedido-punto'),
    })
    expect(pedido.origen).toBe('PEDIDO')
    expect(pedido.canal).toBe('PUNTO')

    const row = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(row.origen).toBe('PEDIDO')
    expect(row.canal).toBe('PUNTO')
    expect(row.clienteId).toBe(clienteRealId)
  })

  it('PEDIDO + DOMICILIO: cliente real, envío a domicilio', async () => {
    const { pedido } = await useCase.execute({
      clienteId: clienteRealId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 9000 }],
      createdById: adminId,
      createdByRole: 'ADMIN',
      offlineId: uniqueId('oc-pedido-domicilio'),
    })
    expect(pedido.origen).toBe('PEDIDO')
    expect(pedido.canal).toBe('DOMICILIO')
  })

  it('VENTA_RAPIDA + PUNTO: cliente anónimo (CONSUMIDOR_FINAL), compra al paso', async () => {
    const { pedido } = await useCase.execute({
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      origen: 'VENTA_RAPIDA',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 6500 }],
      createdById: adminId,
      createdByRole: 'ADMIN',
      offlineId: uniqueId('oc-ventarapida-punto'),
    })
    expect(pedido.origen).toBe('VENTA_RAPIDA')
    expect(pedido.canal).toBe('PUNTO')
    expect(pedido.clienteId).toBe('CONSUMIDOR_FINAL')
  })

  // Caso explícito del ADR (sección "Migración"): VENTA_RAPIDA + DOMICILIO
  // debe ser una combinación válida. Antes de este fix era literalmente
  // inalcanzable (`ventaRapida` se derivaba de `canal === 'PUNTO'`, así que
  // canal=DOMICILIO nunca podía producir VENTA_RAPIDA).
  it('VENTA_RAPIDA + DOMICILIO: cliente anónimo con envío (antes inalcanzable)', async () => {
    const { pedido } = await useCase.execute({
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'DOMICILIO',
      origen: 'VENTA_RAPIDA',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 9000 }],
      createdById: adminId,
      createdByRole: 'ADMIN',
      offlineId: uniqueId('oc-ventarapida-domicilio'),
    })
    expect(pedido.origen).toBe('VENTA_RAPIDA')
    expect(pedido.canal).toBe('DOMICILIO')
    expect(pedido.clienteId).toBe('CONSUMIDOR_FINAL')
  })

  it('sin origen explícito, default a PEDIDO (nunca infiere VENTA_RAPIDA de canal)', async () => {
    const { pedido } = await useCase.execute({
      clienteId: clienteRealId,
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 6500 }],
      createdById: adminId,
      createdByRole: 'ADMIN',
      offlineId: uniqueId('oc-default-origen'),
    })
    expect(pedido.origen).toBe('PEDIDO')
  })
})
