// @tests #712 — pedidos corregidos a la baja después de la salida del embarque
import { describe, it, expect, vi } from 'vitest'
import { agregarCorreccionesALaBaja, leerCorreccionesALaBaja } from '../correcciones-a-la-baja.service'

describe('agregarCorreccionesALaBaja', () => {
  it('cuenta pedidos distintos y suma lo que bajó', () => {
    expect(
      agregarCorreccionesALaBaja([
        { pedidoId: 'a', baja: 1000 },
        { pedidoId: 'a', baja: 500 },
        { pedidoId: 'b', baja: 2000 },
      ]),
    ).toEqual({ pedidos: 2, monto: 3500 })
  })

  it('ignora lo que no baja (cero o al alza)', () => {
    expect(agregarCorreccionesALaBaja([{ pedidoId: 'a', baja: 0 }, { pedidoId: 'b', baja: -300 }])).toEqual({
      pedidos: 0,
      monto: 0,
    })
  })
})

describe('leerCorreccionesALaBaja', () => {
  it('une reducciones y correcciones de precio (delta negativo → baja positiva)', async () => {
    const desde = new Date('2026-11-08T10:00:00Z')
    const reduccion = vi.fn().mockResolvedValue([{ pedidoId: 'p1', monto: '2300.00' }])
    const precio = vi.fn().mockResolvedValue([{ pedidoId: 'p2', delta: '-1500.00' }])
    const r = await leerCorreccionesALaBaja(
      { pedidoReduccionComercial: { findMany: reduccion }, pedidoCorreccionPrecio: { findMany: precio } },
      'emb1',
      desde,
    )
    expect(r).toEqual({ pedidos: 2, monto: 3800 })
    expect(reduccion.mock.calls[0][0].where).toMatchObject({
      estado: 'APLICADA',
      resueltoAt: { gte: desde },
      pedido: { embarqueId: 'emb1' },
    })
    expect(precio.mock.calls[0][0].where.delta).toEqual({ lt: 0 })
  })
})
