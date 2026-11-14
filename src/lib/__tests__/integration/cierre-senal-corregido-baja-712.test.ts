// @tests ADR-CIERRE-002 §5 (#712) — el cierre avisa si, después de que el embarque salió,
// se bajó el total de un pedido (reducción comercial o corrección de precio). Solo aviso. Postgres real.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser, getSeededCliente, uniqueId } from './setup'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'

let adminId: string
let clienteId: string

const uc = () => new CerrarEmbarqueUseCase(
  new PrismaEmbarqueRepository(), new PrismaGastoEmbarqueRepository(), new PrismaEmbarqueProductoRepository(),
  new PrismaTransactionManager(), adminId, 'ADMIN',
)

const CODIGO = 'PEDIDO_CORREGIDO_A_LA_BAJA'

async function embarqueConPedido(horaSalida: Date) {
  const t = await testPrisma.trabajador.create({ data: { nombre: `Baja ${uniqueId('t')}`, rol: 'REPARTIDOR', usaMoto: true } })
  const e = await testPrisma.embarque.create({
    data: { trabajadorId: t.id, fecha: new Date(), horaSalida, estado: 'EN_RUTA', baseDinero: 0, productos: { create: [{ producto: 'PACA_AGUA', cargadas: 0 }] } },
  })
  const p = await testPrisma.pedido.create({
    data: {
      clienteId, embarqueId: e.id, canal: 'DOMICILIO', origen: 'PEDIDO', estadoEntrega: 'PENDIENTE', estado: 'PENDIENTE',
      estadoPago: 'PENDIENTE', total: 25000, totalPagado: 0, saldo: 25000, cPacaAguaPed: 10, cPacaAguaEnt: 0, precioPacaAgua: 2500,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 0, precio: 2500, subtotal: 25000 }] },
    },
  })
  return { e, p }
}

const cerrar = (id: string, pedidoId: string) =>
  uc().execute({ id, pedidos: [{ pedidoId, entregado: 'NO_ENTREGADO', pagos: [] }], dineroEntregado: 0, dryRun: true })

describe('Cierre — pedido corregido a la baja (#712)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await getSeededCliente()).id
  })
  afterAll(async () => { await disconnect() })

  it('sin correcciones: sin señal', async () => {
    const { e, p } = await embarqueConPedido(new Date(Date.now() - 3600_000))
    const r = await cerrar(e.id, p.id)
    expect(r.senales?.map((s) => s.codigo) ?? []).not.toContain(CODIGO)
  })

  it('reducción comercial aplicada después de la salida → señal con pedido y monto; el cierre no se bloquea', async () => {
    const { e, p } = await embarqueConPedido(new Date(Date.now() - 3600_000))
    await testPrisma.pedidoReduccionComercial.create({
      data: {
        pedidoId: p.id, producto: 'PACA_AGUA', cantidadReducida: 2, cantPedidoAntes: 10, cantPedidoDespues: 8,
        precio: 2500, monto: 5000, motivo: 'cliente recibió menos', aceptadoPor: 'cliente', medio: 'LLAMADA',
        estado: 'APLICADA', solicitadoPorId: adminId, resueltoPorId: adminId, resueltoAt: new Date(),
      },
    })
    const r = await cerrar(e.id, p.id)
    const s = r.senales?.find((x) => x.codigo === CODIGO)
    expect(s?.mensaje).toContain('1 pedido')
    expect(s?.mensaje).toContain('5')
  })

  it('corrección de precio a la baja aplicada → señal; al alza o pendiente → no', async () => {
    const { e, p } = await embarqueConPedido(new Date(Date.now() - 3600_000))
    const base = {
      pedidoId: p.id, producto: 'PACA_AGUA', cantidad: 10, motivo: 'precio mal digitado',
      solicitadoPorId: adminId,
    }
    await testPrisma.pedidoCorreccionPrecio.create({ data: { ...base, precioAnterior: 2500, precioNuevo: 2700, delta: 2000, estado: 'APLICADA', resueltoPorId: adminId, resueltoAt: new Date() } })
    await testPrisma.pedidoCorreccionPrecio.create({ data: { ...base, precioAnterior: 2500, precioNuevo: 2000, delta: -5000, estado: 'PENDIENTE' } })
    expect((await cerrar(e.id, p.id)).senales?.map((s) => s.codigo) ?? []).not.toContain(CODIGO)
    await testPrisma.pedidoCorreccionPrecio.create({ data: { ...base, precioAnterior: 2500, precioNuevo: 2300, delta: -2000, estado: 'APLICADA', resueltoPorId: adminId, resueltoAt: new Date() } })
    expect((await cerrar(e.id, p.id)).senales?.map((s) => s.codigo)).toContain(CODIGO)
  })

  it('corregido ANTES de que el embarque saliera → no avisa', async () => {
    const { e, p } = await embarqueConPedido(new Date(Date.now() + 3600_000))
    await testPrisma.pedidoReduccionComercial.create({
      data: {
        pedidoId: p.id, producto: 'PACA_AGUA', cantidadReducida: 1, cantPedidoAntes: 10, cantPedidoDespues: 9,
        precio: 2500, monto: 2500, motivo: 'ajuste previo', aceptadoPor: 'cliente', medio: 'LLAMADA',
        estado: 'APLICADA', solicitadoPorId: adminId, resueltoPorId: adminId, resueltoAt: new Date(),
      },
    })
    expect((await cerrar(e.id, p.id)).senales?.map((s) => s.codigo) ?? []).not.toContain(CODIGO)
  })
})
