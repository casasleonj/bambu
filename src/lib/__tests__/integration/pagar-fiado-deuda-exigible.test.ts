// @tests #514 — `pagar-fiado` reparte únicamente sobre deuda ENTREGADA.
// No convierte un cobro de cartera en un anticipo no elegido. El excedente conserva
// el tratamiento de saldo a favor aprobado en ADR-CORRECCION-MONETARIA-001 D.6.
// Nunca sobre anulados ni cancelados. Postgres real, handler REAL; cada
// prueba mira la base de datos.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST as pagarFiado } from '@/app/api/pedidos/pagar-fiado/route'
import { crearPedidoUseCase } from '@/modules/pedidos'
import { AnularPedidoUseCase } from '@/modules/pedidos/application/use-cases/AnularPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaNotaCreditoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaNotaCreditoRepository'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'

let adminId: string
let contador = 0
const unico = () => `df-${randomUUID()}`

type Estado = 'ENTREGADO' | 'PENDIENTE' | 'EN_RUTA' | 'NO_ENTREGADO' | 'CANCELADO' | 'ANULADO'

async function nuevoCliente() {
  contador += 1
  return testPrisma.cliente.create({
    data: { nombre: `Cliente Exigible ${contador}`, telefono: `33000${String(contador).padStart(5, '0')}`, direccion: 'Calle 1', barrio: 'Centro', limitePedidosFiados: 20, activo: true },
  })
}

/** Un pedido de 10 pacas debido por completo, con el estado de entrega y la antigüedad pedidos. */
async function pedidoDebido(clienteId: string, estado: Estado, diasAtras: number) {
  const { pedido } = await crearPedidoUseCase.execute({
    clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad: 10 }], pagos: [], createdById: adminId, createdByRole: 'ADMIN', offlineId: unico(),
  })
  await testPrisma.pedido.update({
    where: { id: pedido.id },
    data: {
      estadoEntrega: estado,
      estado,
      // La base exige estadoPago ANULADO en pedidos anulados/cancelados (chk_pedido_estadopago_proyectado).
      ...(estado === 'ANULADO' || estado === 'CANCELADO' ? { estadoPago: 'ANULADO' as const } : {}),
      fecha: new Date(Date.now() - diasAtras * 86_400_000),
    },
  })
  return pedido.id
}

async function cobrar(clienteId: string, monto: number, offlineId = unico()) {
  const req = new NextRequest('http://localhost/api/pedidos/pagar-fiado', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clienteId, monto, metodo: 'EFECTIVO', offlineId }),
  })
  const res = await pagarFiado(req)
  expect(res.status).toBe(200)
  return (await res.json()) as Record<string, unknown>
}

const saldoDe = async (id: string) => Number((await testPrisma.pedido.findUniqueOrThrow({ where: { id } })).saldo)
const totalDe = async (id: string) => Number((await testPrisma.pedido.findUniqueOrThrow({ where: { id } })).total)

describe('#514 — pagar-fiado cobra únicamente deuda exigible (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
  })

  it('un abono parcial paga la deuda entregada aunque haya un pedido más viejo sin entregar', async () => {
    const c = await nuevoCliente()
    const sinEntregar = await pedidoDebido(c.id, 'PENDIENTE', 5) // el más viejo, aún no se entrega
    const entregado = await pedidoDebido(c.id, 'ENTREGADO', 2)
    const total = await totalDe(entregado)

    await cobrar(c.id, 10000)

    expect(await saldoDe(entregado)).toBe(total - 10000)
    expect(await saldoDe(sinEntregar)).toBe(await totalDe(sinEntregar)) // intacto
  })

  it('el sobrante queda a favor del cliente sin adelantar un pedido sin entregar', async () => {
    const c = await nuevoCliente()
    const sinEntregar = await pedidoDebido(c.id, 'PENDIENTE', 5)
    const entregado = await pedidoDebido(c.id, 'ENTREGADO', 2)
    const total = await totalDe(entregado)

    const resultado = await cobrar(c.id, total + 4000)

    expect(await saldoDe(entregado)).toBe(0)
    expect(await saldoDe(sinEntregar)).toBe(await totalDe(sinEntregar))
    expect(await testPrisma.pago.count({ where: { pedidoId: sinEntregar } })).toBe(0)
    expect(Number((await testPrisma.cliente.findUniqueOrThrow({ where: { id: c.id } })).saldoFavor)).toBe(4000)
    expect(resultado).toMatchObject({ montoAplicado: total, montoSobrante: 4000, saldoFavorAcreditado: 4000 })
  })

  it.each(['PENDIENTE', 'EN_RUTA', 'NO_ENTREGADO'] as const)('sin entregados, no cobra un pedido %s ni acredita dinero', async estado => {
    const c = await nuevoCliente()
    const id = await pedidoDebido(c.id, estado, 3)
    const res = await pagarFiado(new NextRequest('http://localhost/api/pedidos/pagar-fiado', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: c.id, monto: 5000, metodo: 'EFECTIVO', offlineId: unico() }),
    }))
    expect(res.status).toBe(400)
    expect(await saldoDe(id)).toBe(await totalDe(id))
    expect(await testPrisma.pago.count({ where: { pedidoId: id } })).toBe(0)
    expect(await testPrisma.abono.count({ where: { clienteId: c.id } })).toBe(0)
    expect(Number((await testPrisma.cliente.findUniqueOrThrow({ where: { id: c.id } })).saldoFavor)).toBe(0)
  })

  it('repetir el cobro con sobrante no duplica pagos, espejos ni saldo a favor', async () => {
    const c = await nuevoCliente()
    const entregado = await pedidoDebido(c.id, 'ENTREGADO', 2)
    const pendiente = await pedidoDebido(c.id, 'PENDIENTE', 4)
    const total = await totalDe(entregado)
    const clave = unico()
    await cobrar(c.id, total + 4000, clave)
    const replay = await cobrar(c.id, total + 4000, clave)
    expect(replay).toMatchObject({ deduped: true, montoAplicado: total, montoSobrante: 4000 })
    expect(Number((await testPrisma.cliente.findUniqueOrThrow({ where: { id: c.id } })).saldoFavor)).toBe(4000)
    expect(await saldoDe(pendiente)).toBe(await totalDe(pendiente))
    const pagos = await testPrisma.pago.findMany({ where: { pedidoId: entregado } })
    expect(pagos).toHaveLength(1)
    const espejos = await testPrisma.abono.findMany({ where: { pedidoId: entregado } })
    expect(espejos).toHaveLength(1)
    expect(espejos[0]).toMatchObject({ origenCobro: 'ESPEJO_PAGO', pagoOrigenId: pagos[0].id })
  })

  it('la misma fecha se desempata por número de pedido', async () => {
    const c = await nuevoCliente()
    const primeroFisico = await pedidoDebido(c.id, 'ENTREGADO', 2)
    const menorNumero = await pedidoDebido(c.id, 'ENTREGADO', 2)
    const fecha = new Date('2026-01-05T12:00:00-05:00')
    await testPrisma.pedido.update({ where: { id: primeroFisico }, data: { fecha, numero: 90001 } })
    await testPrisma.pedido.update({ where: { id: menorNumero }, data: { fecha, numero: 90000 } })
    await cobrar(c.id, 3000)
    expect(await saldoDe(menorNumero)).toBe((await totalDe(menorNumero)) - 3000)
    expect(await saldoDe(primeroFisico)).toBe(await totalDe(primeroFisico))
  })

  it('entre dos entregados sigue el más viejo primero', async () => {
    const c = await nuevoCliente()
    const nuevo = await pedidoDebido(c.id, 'ENTREGADO', 1)
    const viejo = await pedidoDebido(c.id, 'ENTREGADO', 6)

    await cobrar(c.id, 3000)

    expect(await saldoDe(viejo)).toBe((await totalDe(viejo)) - 3000)
    expect(await saldoDe(nuevo)).toBe(await totalDe(nuevo))
  })

  it('un pedido cancelado o anulado nunca recibe dinero', async () => {
    const c = await nuevoCliente()
    const cancelado = await pedidoDebido(c.id, 'CANCELADO', 9)
    const anulado = await pedidoDebido(c.id, 'ANULADO', 8)
    const entregado = await pedidoDebido(c.id, 'ENTREGADO', 1)
    const total = await totalDe(entregado)

    await cobrar(c.id, total)

    expect(await saldoDe(entregado)).toBe(0)
    expect(await testPrisma.pago.count({ where: { pedidoId: { in: [cancelado, anulado] } } })).toBe(0)
    expect(await saldoDe(cancelado)).toBe(await totalDe(cancelado))
    expect(await saldoDe(anulado)).toBe(await totalDe(anulado))
  })

  it('si solo hay pedidos cancelados/anulados con saldo, no hay deuda que cobrar', async () => {
    const c = await nuevoCliente()
    await pedidoDebido(c.id, 'ANULADO', 3)
    await pedidoDebido(c.id, 'CANCELADO', 2)
    const req = new NextRequest('http://localhost/api/pedidos/pagar-fiado', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: c.id, monto: 5000, metodo: 'EFECTIVO', offlineId: unico() }),
    })
    const res = await pagarFiado(req)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await testPrisma.pago.count({ where: { pedido: { clienteId: c.id } } })).toBe(0)
  })

  it('cobros en varios días, parcial y luego el resto: queda en cero sin pagar de más', async () => {
    const c = await nuevoCliente()
    const entregado = await pedidoDebido(c.id, 'ENTREGADO', 3)
    const total = await totalDe(entregado)

    await cobrar(c.id, 10000)
    await testPrisma.pago.updateMany({ where: { pedidoId: entregado }, data: { createdAt: new Date(Date.now() - 86_400_000) } })
    await cobrar(c.id, total - 10000)

    expect(await saldoDe(entregado)).toBe(0)
    const pagos = await testPrisma.pago.findMany({ where: { pedidoId: entregado } })
    expect(pagos.reduce((s, p) => s + Number(p.monto), 0)).toBe(total)
  })

  it('tras cobrar parcialmente y anular una deuda, el siguiente cobro paga solo la deuda que sigue vigente', async () => {
    const c = await nuevoCliente()
    const anterior = await pedidoDebido(c.id, 'ENTREGADO', 5)
    const vigente = await pedidoDebido(c.id, 'ENTREGADO', 1)
    const pendiente = await pedidoDebido(c.id, 'PENDIENTE', 6)
    await cobrar(c.id, 10000)
    const anular = new AnularPedidoUseCase(
      new PrismaPedidoRepository(), new PrismaFacturaRepository(),
      new PrismaNotaCreditoRepository(), new PrismaTransactionManager(),
    )
    await anular.execute({ pedidoId: anterior, motivo: 'Prueba sintética', offlineId: unico() })
    const resultado = await cobrar(c.id, 6000)
    expect(resultado.pagosAplicados).toEqual([expect.objectContaining({ pedidoId: vigente, montoAplicado: 6000 })])
    expect(await saldoDe(anterior)).toBe(0)
    expect(await saldoDe(vigente)).toBe((await totalDe(vigente)) - 6000)
    expect(await saldoDe(pendiente)).toBe(await totalDe(pendiente))
    const nota = await testPrisma.notaCredito.findFirstOrThrow({ where: { pedidoId: anterior } })
    expect(Number(nota.monto)).toBe(10000)
    expect(await testPrisma.pago.count({ where: { pedidoId: anterior } })).toBe(1)
    expect(await testPrisma.pago.count({ where: { pedidoId: pendiente } })).toBe(0)
  })
})
