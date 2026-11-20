import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testPrisma as db, resetAndSeed, disconnect, getAdminUser } from './setup'
import { Pedido } from '@/modules/pedidos/domain/entities/Pedido'
import { PedidoItem } from '@/modules/pedidos/domain/entities/PedidoItem'
import { PedidoId } from '@/modules/pedidos/domain/value-objects/PedidoId'
import { CanalVO } from '@/modules/pedidos/domain/value-objects/Canal'
import { OrigenPedidoVO } from '@/modules/pedidos/domain/value-objects/OrigenPedido'
import { EstadoEntregaVO } from '@/modules/pedidos/domain/value-objects/EstadoEntrega'
import { EstadoPagoVO } from '@/modules/pedidos/domain/value-objects/EstadoPago'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { Money, UnitPrice } from '@/shared/domain'
import { consultarPedidos } from '@/lib/pedidos-consulta.repository'
import { leerFiltrosConsulta } from '@/lib/pedidos-consulta'

describe('#795 · PostgreSQL conserva cantidades y autorización de regalo', () => {
  let adminId: string, clienteId: string, numero = 1_000_000
  const repo = new PrismaPedidoRepository()
  const autorizadoEn = new Date('2026-11-18T10:00:00Z')
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await db.cliente.create({ data: { nombre: 'Prueba persistencia regalos', telefono: randomUUID() } })).id
  })
  afterAll(disconnect)
  function crear(conRegalo = true, destino = clienteId) {
    return Pedido.create({ id: PedidoId.from(randomUUID()), numero: ++numero, clienteId: destino,
      canal: CanalVO.create('DOMICILIO'), origen: OrigenPedidoVO.create('PEDIDO'),
      estadoEntrega: EstadoEntregaVO.create('EN_RUTA'), estadoPago: EstadoPagoVO.create('PENDIENTE'),
      items: [new PedidoItem('PACA_AGUA', 60, UnitPrice.fromDecimal(2300), 'manual', 0,
        conRegalo ? { cantidad: 3, autorizadoPorId: adminId, autorizadoEn, motivo: 'Regalo acordado' } : undefined)],
      total: Money.fromDecimal(138000), totalPagado: Money.fromDecimal(0), pagos: [], fecha: new Date() })
  }
  it('guarda y reabre 60 con precio + 3 gratuitas sin cambiar el importe', async () => {
    const original = await repo.save(crear())
    const recargado = await repo.findById(original.id)
    expect(recargado?.items[0].cantidadFisicaPedida).toBe(63)
    expect(recargado?.total.toDecimal()).toBe(138000)
    expect(recargado?.items[0].regalo).toEqual({ cantidad: 3, entregada: 0, autorizadoPorId: adminId, autorizadoEn, motivo: 'Regalo acordado' })
  })
  it('una parcial conserva ID de línea y la autorización de precio independiente', async () => {
    const original = await repo.save(crear())
    const linea = await db.pedidoItem.findFirstOrThrow({ where: { pedidoId: original.id.get() } })
    await db.pedidoItem.update({ where: { id: linea.id }, data: { autorizadoPorAdmin: true, autorizadoPorId: adminId, autorizadoEn } })
    original.entregar([{ producto: 'PACA_AGUA', cantidad: 10, cantidadRegalo: 1 }])
    await repo.update(original)
    const recargado = await repo.findById(original.id)
    const fila = await db.pedidoItem.findUniqueOrThrow({ where: { id: linea.id } })
    expect(fila.autorizadoPorAdmin).toBe(true)
    expect(fila.autorizadoPorId).toBe(adminId)
    expect(fila.regaloAutorizadoPorId).toBe(adminId)
    expect([fila.cantEntrega, fila.cantRegaloEntrega]).toEqual([10, 1])
    expect(recargado?.items[0].cantidadFisicaEntregada).toBe(11)
    expect(recargado?.items[0].subtotalEntregado.toDecimal()).toBe(23000)
    expect(await db.pedidoItem.count({ where: { pedidoId: original.id.get() } })).toBe(1)
  })
  it('constraints rechazan exceso, ausencia de evidencia y autorizador inexistente', async () => {
    const p = await repo.save(crear())
    const linea = await db.pedidoItem.findFirstOrThrow({ where: { pedidoId: p.id.get() } })
    await expect(db.pedidoItem.update({ where: { id: linea.id }, data: { cantRegaloEntrega: 4 } })).rejects.toThrow()
    await expect(db.pedidoItem.update({ where: { id: linea.id }, data: { regaloMotivo: ' ' } })).rejects.toThrow()
    await expect(db.pedidoItem.update({ where: { id: linea.id }, data: { regaloAutorizadoEn: null } })).rejects.toThrow()
    await expect(db.pedidoItem.update({ where: { id: linea.id }, data: { regaloAutorizadoPorId: randomUUID() } })).rejects.toThrow()
    const recargado = await repo.findById(p.id)
    expect(recargado?.items[0].cantRegaloEntrega).toBe(0)
    expect(recargado?.items[0].regalo?.motivo).toBe('Regalo acordado')
  })
  it('pedidos sin regalos conservan cero y su importe al guardar/recargar', async () => {
    const p = await repo.save(crear(false))
    const r = await repo.findById(p.id)
    expect(r?.items[0].cantRegaloPedido).toBe(0)
    expect(r?.items[0].regalo).toBeUndefined()
    expect(r?.total.toDecimal()).toBe(138000)
  })
  it('el barrio cuenta 63 físicas, luego 52, luego solo 2 regalos, hasta completar sin cambiar dinero', async () => {
    const nombre = `Barrio regalos ${randomUUID()}`
    const c = await db.cliente.create({ data: { nombre, telefono: randomUUID(), barrio: nombre } })
    const original = await repo.save(crear(true, c.id))
    const leer = async () => {
      const filtros = leerFiltrosConsulta(new URLSearchParams({ all: 'true', agrupar: 'barrio', search: nombre }))
      const r = await consultarPedidos(filtros, 'ADMIN')
      expect(r.total).toBe(1)
      expect(r.grupos).toHaveLength(1)
      return r.grupos![0]
    }
    expect((await leer()).unidadesPendientes).toBe(63)
    original.entregar([{ producto: 'PACA_AGUA', cantidad: 10, cantidadRegalo: 1 }])
    await repo.update(original)
    expect((await leer()).remanentes).toEqual({ PACA_AGUA: 52 })
    original.entregar([{ producto: 'PACA_AGUA', cantidad: 50, cantidadRegalo: 0 }], { desdeOficina: true })
    await repo.update(original)
    expect((await leer()).unidadesPendientes).toBe(2)
    original.entregar([{ producto: 'PACA_AGUA', cantidad: 0, cantidadRegalo: 2 }], { desdeOficina: true })
    await repo.update(original)
    expect((await leer()).unidadesPendientes).toBe(0)
    const actual = await db.pedido.findUniqueOrThrow({ where: { id: original.id.get() } })
    expect([Number(actual.total), Number(actual.totalPagado)]).toEqual([138000, 0])
  })
})
