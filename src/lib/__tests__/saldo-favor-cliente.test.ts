// @tests #696 — origen del saldo a favor de un cliente: lectura defensiva de la auditoría del cobro y armado
// de los movimientos (entradas por cobro de fiados + correcciones, reducciones y anulaciones).
import { describe, it, expect } from 'vitest'
import { armarMovimientosSaldoFavor, leerCobroDeAuditoria, type EntradaArmado } from '../saldo-favor-cliente'

const auditoria = (extra: Record<string, unknown> = {}, resultado: Record<string, unknown> = {}) =>
  JSON.stringify({
    operacion: 'COBRO_FIADO_V2',
    resultado: {
      montoRecibido: 14000,
      montoAplicado: 10000,
      pagosAplicados: [{ pedidoId: 'p1', numero: 1285, facturaNumero: 'F-00231', montoAplicado: 10000 }],
      ...resultado,
    },
    ...extra,
  })

describe('leerCobroDeAuditoria', () => {
  it('lee pedidos, montos y quién recibió el dinero', () => {
    const c = leerCobroDeAuditoria(auditoria({}, { recepcion: { quien: 'REPARTIDOR', nombre: 'Carlos Mejía', fecha: '2026-11-08T18:05:00.000Z' } }))
    expect(c).toEqual({
      montoRecibido: 14000,
      montoAplicado: 10000,
      pedidos: [{ pedidoId: 'p1', numero: 1285, facturaNumero: 'F-00231', montoAplicado: 10000 }],
      recibio: { quien: 'REPARTIDOR', nombre: 'Carlos Mejía', fecha: '2026-11-08T18:05:00.000Z' },
    })
  })

  it('sin recepción registrada no inventa quién recibió', () => {
    expect(leerCobroDeAuditoria(auditoria())?.recibio).toBeNull()
  })

  it('una factura ausente queda en null, no en texto inventado', () => {
    const c = leerCobroDeAuditoria(auditoria({}, { pagosAplicados: [{ pedidoId: 'p1', numero: 7, montoAplicado: 5 }] }))
    expect(c?.pedidos[0].facturaNumero).toBeNull()
  })

  it.each([
    ['no es JSON', 'esto no es json'],
    ['no es un objeto', '42'],
    ['otra operación', JSON.stringify({ operacion: 'OTRA', resultado: {} })],
    ['sin resultado', JSON.stringify({ operacion: 'COBRO_FIADO_V2' })],
    ['número de pedido inválido', auditoria({}, { pagosAplicados: [{ pedidoId: 'p1', numero: 'x', montoAplicado: 1 }] })],
    ['recepción con quien desconocido', auditoria({}, { recepcion: { quien: 'ALGUIEN', nombre: 'X', fecha: 'y' } })],
  ])('devuelve null si %s (sin dato, nunca un valor inventado)', (_n, datos) => {
    expect(leerCobroDeAuditoria(datos)).toBeNull()
  })
})

const base = (): EntradaArmado => ({
  ingresos: [],
  auditorias: new Map(),
  movimientos: [],
  usuarios: new Map(),
  pedidos: new Map(),
  limite: 50,
})

describe('armarMovimientosSaldoFavor', () => {
  it('une entradas por cobro y movimientos de pedido, del más reciente al más antiguo, con su signo', () => {
    const e = base()
    e.usuarios.set('u1', { nombre: 'Ana', apellido: 'Ruiz', rol: 'ASISTENTE' })
    e.pedidos.set('p1', { id: 'p1', numero: 1285, factura: 'F-00231', negocio: 'Tienda Don Pedro' })
    e.pedidos.set('p2', { id: 'p2', numero: 1271, factura: 'F-00212', negocio: 'Tienda Don Pedro' })
    e.ingresos.push({ id: 'i1', metodo: 'EFECTIVO', monto: 4000, createdAt: new Date('2026-11-08T19:20:00Z'), createdById: 'u1', auditoriaId: 'a1', offlineId: 'cobro-1' })
    e.auditorias.set('a1', auditoria())
    e.movimientos.push({
      id: 'm1', tipo: 'ACREDITACION', monto: 1500, origenTipo: 'CORRECCION_PRECIO', motivo: 'Precio acordado distinto',
      createdAt: new Date('2026-11-02T21:30:00Z'), autorId: 'u1', pedidoId: 'p2',
    })
    e.movimientos.push({
      id: 'm2', tipo: 'REVERSION_ANULACION', monto: 500, origenTipo: 'ANULACION', motivo: 'Pedido anulado',
      createdAt: new Date('2026-11-05T15:00:00Z'), autorId: 'u1', pedidoId: 'p2',
    })
    const { movimientos, hayMas } = armarMovimientosSaldoFavor(e)
    expect(hayMas).toBe(false)
    expect(movimientos.map((m) => [m.id, m.tipo, m.signo, m.monto])).toEqual([
      ['i1', 'ENTRADA_COBRO', 1, 4000],
      ['m2', 'REVERSION_ANULACION', -1, 500],
      ['m1', 'ACREDITACION', 1, 1500],
    ])
    expect(movimientos[0]).toMatchObject({
      metodo: 'EFECTIVO',
      registro: { nombre: 'Ana Ruiz', rol: 'ASISTENTE' },
      cobro: { montoRecibido: 14000, pedidos: [{ numero: 1285, factura: 'F-00231', negocio: 'Tienda Don Pedro', montoAplicado: 10000 }] },
    })
    expect(movimientos[2]).toMatchObject({ motivo: 'Precio acordado distinto', pedido: { numero: 1271, factura: 'F-00212' } })
  })

  it('una reaplicación resta y una acreditación suma', () => {
    const e = base()
    e.movimientos.push({ id: 'a', tipo: 'REAPLICACION', monto: 10, origenTipo: 'CORRECCION_PRECIO', motivo: '', createdAt: new Date('2026-01-01'), autorId: 'x', pedidoId: 'p' })
    expect(armarMovimientosSaldoFavor(e).movimientos[0].signo).toBe(-1)
  })

  it('un pedido que no es de este cliente se descarta del cobro (no se muestra lo que no se puede comprobar)', () => {
    const e = base()
    e.ingresos.push({ id: 'i1', metodo: 'NEQUI', monto: 100, createdAt: new Date('2026-11-08'), createdById: null, auditoriaId: 'a1', offlineId: null })
    e.auditorias.set('a1', auditoria()) // el pedido p1 no está en `e.pedidos` (no es de este cliente)
    const m = armarMovimientosSaldoFavor(e).movimientos[0]
    expect(m.cobro?.pedidos).toEqual([])
    expect(m.registro).toBeNull()
  })

  it('sin auditoría legible el cobro queda en null y el resto del movimiento se conserva', () => {
    const e = base()
    e.ingresos.push({ id: 'i1', metodo: 'EFECTIVO', monto: 4000, createdAt: new Date('2026-11-08'), createdById: null, auditoriaId: 'a1', offlineId: null })
    e.auditorias.set('a1', 'basura')
    const m = armarMovimientosSaldoFavor(e).movimientos[0]
    expect(m.cobro).toBeNull()
    expect(m).toMatchObject({ tipo: 'ENTRADA_COBRO', monto: 4000, metodo: 'EFECTIVO' })
  })

  it('sin auditoría enlazada (ingreso sin auditoriaId) tampoco inventa el cobro', () => {
    const e = base()
    e.ingresos.push({ id: 'i1', metodo: 'EFECTIVO', monto: 4000, createdAt: new Date('2026-11-08'), createdById: null, auditoriaId: null, offlineId: null })
    expect(armarMovimientosSaldoFavor(e).movimientos[0].cobro).toBeNull()
  })

  it('respeta el límite y avisa que hay más', () => {
    const e = base()
    e.limite = 2
    for (let i = 0; i < 3; i++) {
      e.ingresos.push({ id: `i${i}`, metodo: 'EFECTIVO', monto: 1, createdAt: new Date(2026, 10, 1 + i), createdById: null, auditoriaId: null, offlineId: null })
    }
    const r = armarMovimientosSaldoFavor(e)
    expect(r.movimientos.map((m) => m.id)).toEqual(['i2', 'i1'])
    expect(r.hayMas).toBe(true)
  })

  it('con la misma fecha el orden es estable (por id)', () => {
    const e = base()
    const f = new Date('2026-11-08T10:00:00Z')
    e.ingresos.push({ id: 'b', metodo: 'EFECTIVO', monto: 1, createdAt: f, createdById: null, auditoriaId: null, offlineId: null })
    e.ingresos.push({ id: 'a', metodo: 'NEQUI', monto: 1, createdAt: f, createdById: null, auditoriaId: null, offlineId: null })
    expect(armarMovimientosSaldoFavor(e).movimientos.map((m) => m.id)).toEqual(['b', 'a'])
  })
})
