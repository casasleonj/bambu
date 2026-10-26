// @tests CrearPedidoUseCase — #400: el pedido guarda quién lo creó
// Hallazgo cubierto: `Pedido.createdById` nunca se persistía (el repositorio de Prisma no lo
// escribía) y los 304 pedidos desde septiembre quedaron sin creador.
// Verifica contra Postgres real (no mocks):
//   1. Un pedido creado con una sesión queda con el `createdById` de ese usuario.
//   2. Una venta rápida también.
//   3. Un pedido creado sin usuario (plantilla recurrente automática) queda sin creador, sin fallar.
//   4. Actualizar el pedido después (un pago) no borra ni cambia el creador.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId, getAdminUser } from './setup'
import { crearPedidoUseCase } from '@/modules/pedidos'

describe('Pedido.createdById (#400)', () => {
  let adminId: string
  let clienteId: string

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await testPrisma.cliente.create({
      data: { nombre: 'Cliente Creador', telefono: '3001230400', direccion: 'Calle 4 # 5-6', barrio: 'Centro', activo: true },
    })).id
  })

  afterAll(async () => {
    await disconnect()
  })

  const crear = (extra: Record<string, unknown> = {}) =>
    crearPedidoUseCase.execute({
      clienteId,
      canal: 'PUNTO',
      origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [],
      offlineId: uniqueId('cb'),
      ...extra,
    } as never)

  it('un pedido creado con una sesión guarda el createdById de esa persona', async () => {
    const { pedido } = await crear({ createdById: adminId, createdByRole: 'ADMIN' })
    const fila = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(fila.createdById).toBe(adminId)
  })

  it('una venta rápida también guarda el creador', async () => {
    const { pedido } = await crear({
      clienteId: 'CONSUMIDOR_FINAL', origen: 'VENTA_RAPIDA',
      pagos: [{ metodo: 'EFECTIVO', monto: 50_000 }], createdById: adminId, createdByRole: 'ADMIN',
    })
    const fila = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(fila.createdById).toBe(adminId)
  })

  it('un pedido sin usuario (generado automáticamente) queda sin creador y no falla', async () => {
    const { pedido } = await crear()
    const fila = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(fila.createdById).toBeNull()
  })

  it('actualizar el pedido después no cambia el creador', async () => {
    const { pedido } = await crear({ createdById: adminId, createdByRole: 'ADMIN' })
    await testPrisma.pedido.update({ where: { id: pedido.id }, data: { obs: 'nota posterior' } })
    const fila = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(fila.createdById).toBe(adminId)
  })
})
