// @tests #326 — regla pura de corrección de precio en el cierre.
import { describe, it, expect } from 'vitest'
import { resolverCorreccionPrecio, type PedidoParaCorreccion } from '../correccion-precio.service'

const CEROS = { pacaAgua: 0, pacaHielo: 0, botellonFab: 0, botellonDom: 0, bolsaAgua: 0, bolsaHielo: 0 }
const pedido = (over: Partial<PedidoParaCorreccion> = {}): PedidoParaCorreccion => ({
  numero: 7,
  total: 10_000,
  totalPagado: 0,
  precios: { ...CEROS, pacaAgua: 1_000 },
  cantidades: { ...CEROS, pacaAgua: 10 },
  ...over,
})
const MOTIVO = 'Acuerdo en la puerta'

describe('resolverCorreccionPrecio (#326)', () => {
  it('sube el precio: total = total + Δ × cantidad PEDIDA', () => {
    const r = resolverCorreccionPrecio({ pedido: pedido(), preciosReales: { pacaAgua: 1_100 }, motivo: MOTIVO, esAdmin: true })
    expect(r).toMatchObject({ hayCorreccion: true, totalAntes: 10_000, totalDespues: 11_000, motivo: MOTIVO })
    expect(r.precios.pacaAgua).toBe(1_100)
    expect(r.cambios).toEqual([{ clave: 'pacaAgua', antes: 1_000, despues: 1_100, cantidad: 10 }])
  })

  it('respeta ajustes previos del total: suma el delta, no recalcula Σ líneas', () => {
    const r = resolverCorreccionPrecio({ pedido: pedido({ total: 10_500 }), preciosReales: { pacaAgua: 900 }, motivo: MOTIVO, esAdmin: true })
    expect(r.totalDespues).toBe(9_500)
  })

  it('un precio vacío, 0, negativo o NaN no es una corrección', () => {
    for (const v of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = resolverCorreccionPrecio({ pedido: pedido(), preciosReales: { pacaAgua: v }, motivo: null, esAdmin: true })
      expect(r.hayCorreccion).toBe(false)
      expect(r.precios.pacaAgua).toBe(1_000)
      expect(r.totalDespues).toBe(10_000)
    }
  })

  it('un precio igual al actual, o de una línea que no se pidió, no cambia nada', () => {
    const r = resolverCorreccionPrecio({ pedido: pedido(), preciosReales: { pacaAgua: 1_000, pacaHielo: 500 }, motivo: null, esAdmin: true })
    expect(r.hayCorreccion).toBe(false)
  })

  it('quien no es ADMIN no corrige', () => {
    const r = resolverCorreccionPrecio({ pedido: pedido(), preciosReales: { pacaAgua: 1_100 }, motivo: MOTIVO, esAdmin: false })
    expect(r.hayCorreccion).toBe(false)
  })

  it('exige motivo cuando la corrección es real', () => {
    expect(() => resolverCorreccionPrecio({ pedido: pedido(), preciosReales: { pacaAgua: 1_100 }, motivo: '  ', esAdmin: true })).toThrow(/PRECIO_SIN_MOTIVO/)
    expect(() => resolverCorreccionPrecio({ pedido: pedido(), preciosReales: { pacaAgua: 1_100 }, motivo: 'ok', esAdmin: true })).toThrow(/PRECIO_SIN_MOTIVO/)
  })

  it('rechaza si el cliente ya pagó más que el nuevo total, y acepta justo igual', () => {
    expect(() => resolverCorreccionPrecio({ pedido: pedido({ totalPagado: 10_000 }), preciosReales: { pacaAgua: 900 }, motivo: MOTIVO, esAdmin: true }))
      .toThrow(/PRECIO_GENERARIA_SOBREPAGO/)
    const r = resolverCorreccionPrecio({ pedido: pedido({ totalPagado: 9_000 }), preciosReales: { pacaAgua: 900 }, motivo: MOTIVO, esAdmin: true })
    expect(r.totalDespues).toBe(9_000)
  })

  it('varias líneas suman sus deltas', () => {
    const r = resolverCorreccionPrecio({
      pedido: pedido({
        total: 10_000 + 4_000,
        precios: { ...CEROS, pacaAgua: 1_000, pacaHielo: 800 },
        cantidades: { ...CEROS, pacaAgua: 10, pacaHielo: 5 },
      }),
      preciosReales: { pacaAgua: 1_100, pacaHielo: 700 },
      motivo: MOTIVO,
      esAdmin: true,
    })
    expect(r.totalDespues).toBe(14_000 + 1_000 - 500)
  })

  it('no acumula error de punto flotante en centavos', () => {
    const r = resolverCorreccionPrecio({
      pedido: pedido({ total: 3, precios: { ...CEROS, pacaAgua: 0.1 }, cantidades: { ...CEROS, pacaAgua: 30 } }),
      preciosReales: { pacaAgua: 0.2 },
      motivo: MOTIVO,
      esAdmin: true,
    })
    expect(r.totalDespues).toBe(6)
  })
})
