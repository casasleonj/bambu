// @tests CerrarEmbarqueUseCase — conciliación de caja con venta en ruta de
// entrega posterior. ADR-PAGO-EMBARQUE-CAPTURA-001 §5: "cobrado en la misión"
// del embarque `E` = efecto neto de los `Pago` CAPTURADOS en `E`
// (`Pago.embarqueId = E`), independientemente de dónde/cuándo se entregue el
// pedido y de a qué embarque esté asignado físicamente. `embarqueOrigenId` ya
// NO participa en la conciliación.
//
// Verifica contra Postgres real:
//   1. Un pedido de entrega diferida (embarqueId=null, PENDIENTE) cuyo `Pago`
//      fue capturado en `E` SÍ aporta ese efectivo a la caja del cierre de `E`.
//   2. Ese mismo pedido, si queda ANULADO, NO aporta su `Pago` (dinero devuelto
//      → efecto neto $0 — regla A1).
//   3. Un pedido físicamente asignado a `E` pero cuyo `Pago` se capturó en OTRO
//      embarque (`F`) NO aporta su `Pago` a la caja de `E` (evita doble conteo).
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

describe('CerrarEmbarqueUseCase — venta en ruta con entrega posterior (§5 contexto de captura)', () => {
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

  it('un pedido de entrega diferida aporta a la caja el Pago capturado en ESE embarque', async () => {
    const { embarque } = await crearEmbarque(30_000)

    // Venta libre cobrada en ruta pero "entregar después": queda PENDIENTE,
    // sin embarque asignado. El `Pago` declara `embarqueId = E` (contexto real
    // de captura).
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
      data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: 20_000, confirmacion: 'CONFIRMADO', embarqueId: embarque.id },
    })

    const result = await buildUseCase().execute({
      id: embarque.id,
      pedidos: [],
      gastos: [],
      dineroEntregado: 50_000,
      dryRun: true,
    })

    // base 30k + efectivo capturado 20k - gastos 0 = 50k
    expect(result.caja.efectivoEsperado).toBe(20_000)
    expect(result.caja.efectivoReal).toBe(50_000)
    expect(result.caja.sobranteFaltante).toBe(0)

    await testPrisma.pago.deleteMany({ where: { pedidoId: pedido.id } })
    await testPrisma.pedido.delete({ where: { id: pedido.id } })
    await testPrisma.embarque.delete({ where: { id: embarque.id } })
    await testPrisma.trabajador.delete({ where: { id: embarque.trabajadorId } })
  })

  it('un pedido diferido ANULADO no aporta su Pago al cierre (efecto neto $0 — A1)', async () => {
    const { embarque } = await crearEmbarque(30_000)

    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId,
        canal: 'DOMICILIO',
        origen: 'VENTA_LIBRE',
        total: 18_000,
        totalPagado: 0, // AnularPedidoUseCase pone totalPagado=0
        saldo: 18_000, // chk_pedido_saldo_calc: saldo = total - totalPagado
        estadoEntrega: 'ANULADO',
        estado: 'ANULADO',
        estadoPago: 'ANULADO',
        embarqueId: null,
        embarqueOrigenId: embarque.id,
      },
    })
    // AnularPedidoUseCase NO borra las filas Pago; `Pago.embarqueId` es inmutable.
    await testPrisma.pago.create({
      data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: 18_000, confirmacion: 'CONFIRMADO', embarqueId: embarque.id },
    })

    const result = await buildUseCase().execute({
      id: embarque.id,
      pedidos: [],
      gastos: [],
      dineroEntregado: 30_000,
      dryRun: true,
    })

    // El Pago se excluye por el estado del pedido (ANULADO).
    expect(result.caja.efectivoEsperado).toBe(0)
    expect(result.caja.efectivoReal).toBe(30_000)

    await testPrisma.pago.deleteMany({ where: { pedidoId: pedido.id } })
    await testPrisma.pedido.delete({ where: { id: pedido.id } })
    await testPrisma.embarque.delete({ where: { id: embarque.id } })
    await testPrisma.trabajador.delete({ where: { id: embarque.trabajadorId } })
  })

  it('un pedido físicamente en el embarque pero con el Pago capturado en OTRO no aporta a esta caja', async () => {
    const origen = await crearEmbarque(0, 'EN_RUTA')
    const { embarque } = await crearEmbarque(30_000)

    // Pedido cuyo dinero se capturó en `origen` y ahora viaja físicamente en
    // `embarque` para ser entregado.
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
      data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: 15_000, confirmacion: 'CONFIRMADO', embarqueId: origen.embarque.id },
    })

    const result = await buildUseCase().execute({
      id: embarque.id,
      pedidos: [],
      gastos: [],
      dineroEntregado: 30_000,
      dryRun: true,
    })

    // El Pago capturado en `origen` NO cuenta acá: efectivoEsperado sigue en 0.
    expect(result.caja.efectivoEsperado).toBe(0)
    expect(result.caja.efectivoReal).toBe(30_000)

    // ...y SÍ cuenta en el cierre de `origen`.
    const resultOrigen = await buildUseCase().execute({
      id: origen.embarque.id,
      pedidos: [],
      gastos: [],
      dineroEntregado: 15_000,
      dryRun: true,
    })
    expect(resultOrigen.caja.efectivoEsperado).toBe(15_000)

    await testPrisma.pago.deleteMany({ where: { pedidoId: pedido.id } })
    await testPrisma.pedido.delete({ where: { id: pedido.id } })
    await testPrisma.embarque.delete({ where: { id: embarque.id } })
    await testPrisma.trabajador.delete({ where: { id: embarque.trabajadorId } })
    await testPrisma.embarque.delete({ where: { id: origen.embarque.id } })
    await testPrisma.trabajador.delete({ where: { id: origen.embarque.trabajadorId } })
  })
})
