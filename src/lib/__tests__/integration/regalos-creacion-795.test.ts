import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testPrisma as db, resetAndSeed, disconnect, getAdminUser } from './setup'
import { crearPedidoUseCase, previewPedidoUseCase, actualizarPedidoUseCase } from '@/modules/pedidos'
import { leerEntregasConsulta } from '@/lib/entregas-consulta'
import { calcularComisionRepartidor } from '@/lib/comision-repartidor'
import { startOfDayBogota, endOfDayBogota, todayStringBogota } from '@/lib/dates'

vi.mock('next/cache', () => ({
  unstable_cache: <Args extends unknown[], Result>(fn: (...args: Args) => Result) => fn,
}))

describe('#795 · creación y edición con regalos en PostgreSQL', () => {
  let adminId: string
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  afterAll(disconnect)
  const items = [{ producto: 'PACA_AGUA' as const, cantidad: 60, cantidadRegalo: 3, precioManual: 2300, motivoRegalo: 'Regalo acordado' }]
  async function cliente() {
    return (await db.cliente.create({ data: { nombre: 'Prueba creación regalos', telefono: randomUUID() } })).id
  }
  it.each(['PEDIDO', 'VENTA_RAPIDA'] as const)('%s conserva 138000 y entrega físicamente 63 solo cuando corresponde', async origen => {
    const clienteId = await cliente(), offlineId = randomUUID()
    const preview = await previewPedidoUseCase.execute({ clienteId, canal: 'PUNTO', origen, items, actorId: adminId, actorRol: 'ADMIN' })
    expect(preview.permissions.canCreate).toBe(true)
    expect(preview.calculation.items[0].cantidadRegalo).toBe(3)
    expect(preview.calculation.total).toBe(138000)
    const comando = { clienteId, canal: 'PUNTO' as const, origen, items, offlineId, createdById: adminId, createdByRole: 'ADMIN' }
    const { pedido } = await crearPedidoUseCase.execute(comando)
    const fila = await db.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true, factura: true } })
    expect([fila.items[0].cantPedido, fila.items[0].cantRegaloPedido]).toEqual([60, 3])
    expect([fila.items[0].cantEntrega, fila.items[0].cantRegaloEntrega]).toEqual(origen === 'VENTA_RAPIDA' ? [60, 3] : [0, 0])
    expect(fila.items[0].regaloAutorizadoPorId).toBe(adminId)
    expect(Number(fila.total)).toBe(138000)
    expect(Number(fila.factura?.total)).toBe(138000)
    expect(fila.cPacaAguaPed).toBe(60) // Contrato legado sigue comercial, no 63×2300.
    expect((await crearPedidoUseCase.execute(comando)).deduped).toBe(true)
    expect(await db.pedido.count({ where: { offlineId } })).toBe(1)
    const audit = await db.historial.findMany({ where: { entidad: 'Pedido', registroId: pedido.id, accion: 'CREATE' } })
    expect(audit).toHaveLength(1)
    expect(JSON.stringify(audit)).toContain('Regalo acordado')
    const hechos = await leerEntregasConsulta(db, { ids: [pedido.id] })
    if (origen === 'VENTA_RAPIDA') {
      expect(hechos).toHaveLength(1)
      expect(hechos[0]).toMatchObject({ fuente: 'AUDITORIA', regalosPedido: true,
        cantidades: [{ producto: 'PACA_AGUA', cantidad: 63, cantidadRegalo: 3 }] })
      expect(hechos[0].incompleto).not.toBe(true)
    } else expect(hechos).toHaveLength(0)
  })
  it('rechaza autorización de asistente/repartidor sin crear cliente, pedido, factura o pagos', async () => {
    for (const createdByRole of ['ASISTENTE', 'REPARTIDOR']) {
      const offlineId = randomUUID(), telefono = randomUUID()
      const antes = await db.factura.count()
      await expect(crearPedidoUseCase.execute({ clienteId: '', clienteNuevo: { nombre: 'No debe persistir', telefono },
        canal: 'PUNTO', items, offlineId, createdById: adminId, createdByRole })).rejects.toThrow('REGALO_REQUIERE_ADMIN')
      expect(await db.pedido.count({ where: { offlineId } })).toBe(0)
      expect(await db.cliente.count({ where: { telefono } })).toBe(0)
      expect(await db.factura.count()).toBe(antes)
    }
  })
  it('venta en ruta conserva el hecho atribuido y comisiona 63 una sola vez al reintentar', async () => {
    await db.config.upsert({ where: { clave: 'GESTION_ADMIN_SIN_EMBARQUE' },
      create: { clave: 'GESTION_ADMIN_SIN_EMBARQUE', valor: 'true' }, update: { valor: 'true' } })
    const repartidor = await db.trabajador.create({ data: { nombre: 'Repartidor sintético de regalos', rol: 'REPARTIDOR', usaMoto: true } })
    const comando = { clienteId: await cliente(), canal: 'DOMICILIO' as const, origen: 'VENTA_RAPIDA' as const,
      items, offlineId: randomUUID(), createdById: adminId, createdByRole: 'ADMIN', vendidoPorId: repartidor.id,
      pagos: [{ metodo: 'EFECTIVO', monto: 138000 }] }
    const { pedido } = await crearPedidoUseCase.execute(comando)
    expect((await crearPedidoUseCase.execute(comando)).deduped).toBe(true)
    const hechos = await leerEntregasConsulta(db, { ids: [pedido.id] })
    expect(hechos).toHaveLength(1)
    expect(hechos[0]).toMatchObject({ repartidorId: repartidor.id, fuente: 'AUDITORIA',
      cantidades: [{ producto: 'PACA_AGUA', cantidad: 63, cantidadRegalo: 3 }] })
    const dia = todayStringBogota()
    const comision = await calcularComisionRepartidor(db, repartidor.id, startOfDayBogota(dia), endOfDayBogota(dia),
      { agua: 200, hielo: 200, botellon: 200 })
    expect(comision.entregasAgua).toBe(63)
    expect(comision.total).toBe(12600)
    expect(comision.revisiones).toEqual([])
    expect(await db.pago.count({ where: { pedidoId: pedido.id } })).toBe(1)
  })
  it('edición y relectura conservan autorización, y otra concesión audita ambas versiones', async () => {
    const { pedido } = await crearPedidoUseCase.execute({ clienteId: await cliente(), canal: 'PUNTO', items, createdById: adminId, createdByRole: 'ADMIN' })
    const original = await db.pedidoItem.findFirstOrThrow({ where: { pedidoId: pedido.id } })
    await actualizarPedidoUseCase.execute({ pedidoId: pedido.id, usuarioId: adminId, usuarioRol: 'ASISTENTE',
      items: [{ producto: 'PACA_AGUA', cantidad: 60, precioManual: 2300 }], obs: 'Una nota' })
    let fila = await db.pedidoItem.findUniqueOrThrow({ where: { id: original.id } })
    expect(fila.regaloAutorizadoEn).toEqual(original.regaloAutorizadoEn)
    expect(fila.cantRegaloPedido).toBe(3)
    await actualizarPedidoUseCase.execute({ pedidoId: pedido.id, usuarioId: adminId, usuarioRol: 'ADMIN',
      items: [{ ...items[0], cantidadRegalo: 4, motivoRegalo: 'Ampliación autorizada' }] })
    fila = await db.pedidoItem.findUniqueOrThrow({ where: { id: original.id } })
    expect(fila.cantRegaloPedido).toBe(4)
    expect(Number((await db.factura.findFirstOrThrow({ where: { pedidoId: pedido.id } })).total)).toBe(138000)
    const audit = await db.historial.findMany({ where: { entidad: 'Pedido', registroId: pedido.id, accion: 'UPDATE' } })
    expect(JSON.stringify(audit)).toContain('Regalo acordado')
    expect(JSON.stringify(audit)).toContain('Ampliación autorizada')
  })
})
