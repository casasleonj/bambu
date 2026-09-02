// @tests CerrarEmbarqueUseCase — conciliación de caja con venta en ruta de
// entrega posterior. ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001 §0: "la custodia del
// dinero sigue al evento de cobro, no al de entrega". Un `Pago` se concilia en
// el cierre del embarque en el que fue recibido (`embarqueOrigenId`),
// independientemente de dónde/cuándo se entregue el pedido.
//
// Verifica contra Postgres real:
//   1. Un pedido con entrega diferida (embarqueId=null, embarqueOrigenId=E) SÍ
//      aporta su Pago EFECTIVO a la caja del cierre de E.
//   2. Un pedido físicamente en E pero originado en OTRO embarque (F) NO aporta
//      su Pago a la caja de E (evita doble conteo / falso faltante de caja).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'

let adminId: string

function buildUseCase() {
  return new CerrarEmbarqueUseCase(
    new PrismaEmbarqueRepository(),
    new PrismaGastoEmbarqueRepository(),
    new PrismaEmbarqueProductoRepository(),
    new PrismaTransactionManager(),
    adminId,
    'ADMIN',
  )
}

async function crearEmbarque(baseDinero: number, estado: 'EN_RUTA' | 'ABIERTO' = 'EN_RUTA') {
  const trabajador = await testPrisma.trabajador.create({
    data: { nombre: `VtaRuta ${Math.random().toString(36).slice(2, 8)}`, rol: 'REPARTIDOR', usaMoto: true },
  })
  const embarque = await testPrisma.embarque.create({
    data: { trabajadorId: trabajador.id, fecha: new Date(), estado, baseDinero },
  })
  return { trabajador, embarque }
}

describe('CerrarEmbarqueUseCase — venta en ruta con entrega posterior (§0 custodia del dinero)', () => {
  let clienteId: string

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await getAdminUser()
    adminId = admin.id
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'Cli VtaRuta',
        telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle 1',
        activo: true,
      },
    })
    clienteId = c.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('un pedido de entrega diferida aporta su Pago EFECTIVO a la caja de su embarque de origen', async () => {
    const { embarque } = await crearEmbarque(30_000)

    // Venta libre cobrada en ruta pero "entregar después": queda PENDIENTE,
    // sin embarque asignado, con el origen apuntando a este embarque.
    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId,
        canal: 'DOMICILIO',
        origen: 'VENTA_LIBRE',
        total: 20_000,
        totalPagado: 20_000,
        saldo: 0,
        estadoEntrega: 'PENDIENTE',
        estado: 'PENDIENTE',
        estadoPago: 'ANTICIPADO',
        embarqueId: null,
        embarqueOrigenId: embarque.id,
      },
    })
    await testPrisma.pago.create({
      data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: 20_000, confirmacion: 'CONFIRMADO' },
    })

    const result = await buildUseCase().execute({
      id: embarque.id,
      pedidos: [],
      gastos: [],
      dineroEntregado: 50_000,
      dryRun: true,
    })

    // base 30k + efectivo diferido 20k - gastos 0 = 50k
    expect(result.caja.efectivoEsperado).toBe(20_000)
    expect(result.caja.efectivoReal).toBe(50_000)
    expect(result.caja.sobranteFaltante).toBe(0)

    await testPrisma.pago.deleteMany({ where: { pedidoId: pedido.id } })
    await testPrisma.pedido.delete({ where: { id: pedido.id } })
    await testPrisma.embarque.delete({ where: { id: embarque.id } })
    await testPrisma.trabajador.delete({ where: { id: embarque.trabajadorId } })
  })

  it('un pedido físicamente en el embarque pero originado en OTRO no aporta su Pago (evita doble conteo)', async () => {
    const origen = await crearEmbarque(0, 'ABIERTO')
    const { embarque } = await crearEmbarque(30_000)

    // Pedido que nació en `origen` (su dinero se concilia allá) y ahora viaja
    // físicamente en `embarque` para ser entregado.
    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId,
        canal: 'DOMICILIO',
        origen: 'VENTA_LIBRE',
        total: 15_000,
        totalPagado: 15_000,
        saldo: 0,
        estadoEntrega: 'PENDIENTE',
        estado: 'PENDIENTE',
        estadoPago: 'ANTICIPADO',
        embarqueId: embarque.id,
        embarqueOrigenId: origen.embarque.id,
      },
    })
    await testPrisma.pago.create({
      data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: 15_000, confirmacion: 'CONFIRMADO' },
    })

    const result = await buildUseCase().execute({
      id: embarque.id,
      pedidos: [],
      gastos: [],
      dineroEntregado: 30_000,
      dryRun: true,
    })

    // El Pago del pedido foráneo NO cuenta: efectivoEsperado sigue en 0.
    expect(result.caja.efectivoEsperado).toBe(0)
    expect(result.caja.efectivoReal).toBe(30_000)

    await testPrisma.pago.deleteMany({ where: { pedidoId: pedido.id } })
    await testPrisma.pedido.delete({ where: { id: pedido.id } })
    await testPrisma.embarque.delete({ where: { id: embarque.id } })
    await testPrisma.trabajador.delete({ where: { id: embarque.trabajadorId } })
    await testPrisma.embarque.delete({ where: { id: origen.embarque.id } })
    await testPrisma.trabajador.delete({ where: { id: origen.embarque.trabajadorId } })
  })
})
