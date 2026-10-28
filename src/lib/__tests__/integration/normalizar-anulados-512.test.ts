import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sqlNormalizarAnulados512 } from '../../../../scripts/lib/normalizar-anulados-512'
import { disconnect, getSeededCliente, resetAndSeed, testPrisma } from './setup'

let clienteId: string
const fuente = 'https://github.com/casasleonj/bambu/issues/512'
const commit = '866265e71eb09bc827dfd3435da1f614117251b2'

async function anulado() {
  return testPrisma.pedido.create({ data: {
    clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
    estado: 'ANULADO', estadoEntrega: 'ANULADO', estadoPago: 'ANULADO',
    total: 20000, saldo: 20000, totalPagado: 0,
  } })
}

function ejecutar(sql: string) {
  // Un solo DO, misma transacción, sin depender de psql ni instalar herramientas.
  return testPrisma.$executeRawUnsafe(sql)
}

describe('#512 — reparación histórica acotada y auditada', () => {
  beforeAll(async () => { await resetAndSeed(); clienteId = (await getSeededCliente()).id })
  afterAll(disconnect)

  it('respalda antes de poner en cero, preserva pagos/notas/facturas y se puede repetir', async () => {
    const p = await anulado()
    const fuera = await anulado()
    await testPrisma.pago.create({ data: { pedidoId: p.id, metodo: 'EFECTIVO', monto: 5000 } })
    await testPrisma.notaCredito.create({ data: { numero: `NC-${p.id}`, pedidoId: p.id, monto: 5000, motivo: 'Sintético' } })
    const factura = await testPrisma.factura.create({ data: {
      numero: `F-${p.id}`, pedidoId: p.id, clienteId, total: 20000, subtotal: 20000, saldo: 0, estado: 'ANULADA', montoPagado: 5000,
    } })
    const sql = sqlNormalizarAnulados512({ fuente, commit, pedidos: [{ id: p.id, numero: p.numero, total: '20000.00', saldo: '20000.00', totalPagado: '0.00' }] })
    await ejecutar(sql)
    await ejecutar(sql)
    const post = await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id } })
    expect([Number(post.total), Number(post.saldo), Number(post.totalPagado)]).toEqual([0, 0, 0])
    expect(Number((await testPrisma.pedido.findUniqueOrThrow({ where: { id: fuera.id } })).total)).toBe(20000)
    const registros = await testPrisma.historial.findMany({ where: { registroId: p.id, entidad: 'Pedido' } })
    expect(registros).toHaveLength(1)
    expect(JSON.parse(registros[0].datos!)).toMatchObject({
      issue: 512, fuente, commit,
      antes: { total: '20000.00', saldo: '20000.00', totalPagado: '0.00' },
      despues: { total: '0.00', saldo: '0.00', totalPagado: '0.00' },
    })
    expect(await testPrisma.factura.findUniqueOrThrow({ where: { id: factura.id } })).toEqual(factura)
    expect(await testPrisma.pago.count({ where: { pedidoId: p.id } })).toBe(1)
    expect(Number((await testPrisma.notaCredito.findFirstOrThrow({ where: { pedidoId: p.id } })).monto)).toBe(5000)
  })

  it('si una fila cambió, revierte toda la reparación y no deja respaldos parciales', async () => {
    const a = await anulado()
    const b = await anulado()
    const sql = sqlNormalizarAnulados512({ fuente, commit, pedidos: [a, b].map(p => ({
      id: p.id, numero: p.numero, total: '20000.00', saldo: '20000.00', totalPagado: '0.00',
    })) })
    await testPrisma.pedido.update({ where: { id: b.id }, data: { total: 15000, saldo: 15000 } })
    await expect(ejecutar(sql)).rejects.toThrow('FIX512_MANIFIESTO_NO_COINCIDE')
    expect(Number((await testPrisma.pedido.findUniqueOrThrow({ where: { id: a.id } })).total)).toBe(20000)
    expect(await testPrisma.historial.count({ where: { registroId: { in: [a.id, b.id] } } })).toBe(0)
  })

  it('rechaza manifiestos vacíos o duplicados', async () => {
    expect(() => sqlNormalizarAnulados512({ fuente, commit, pedidos: [] })).toThrow()
    const p = await anulado()
    const e = { id: p.id, numero: p.numero, total: '20000.00', saldo: '20000.00', totalPagado: '0.00' }
    expect(() => sqlNormalizarAnulados512({ fuente, commit, pedidos: [e, e] })).toThrow('identidades únicas')
  })
})
