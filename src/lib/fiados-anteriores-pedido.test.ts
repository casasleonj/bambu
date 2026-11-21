import { describe, expect, it } from 'vitest'
import { resumirFiadosAnteriores, type DeudaParaAviso } from './fiados-anteriores-pedido'

const fecha = (dia: number) => new Date(`2026-11-${String(dia).padStart(2, '0')}T12:00:00.000Z`)
const deuda = (id: string, clienteId: string, dia: number, exigible: number,
  productos: DeudaParaAviso['productos'] = [{ producto: 'PACA_AGUA', cantidadEntregada: 5 }],
  negocioNombre: string | null = null): DeudaParaAviso =>
  ({ id, clienteId, createdAt: fecha(dia), exigible, productos, negocioNombre })

describe('#932 aviso de fiados de pedidos anteriores', () => {
  it('muestra deuda previa aunque el pedido actual esté pagado y no incluye el pedido propio', () => {
    const visibles = [{ id: 'nuevo', clienteId: 'c1', createdAt: fecha(20) }]
    const datos = [
      deuda('antiguo', 'c1', 10, 9000),
      deuda('nuevo', 'c1', 20, 3000),
      deuda('posterior', 'c1', 21, 4500),
    ]
    expect(resumirFiadosAnteriores(visibles, datos).get('nuevo')).toEqual({
      total: 9000, pedidos: 1, productos: [{ producto: 'PACA_AGUA', cantidad: 5 }], negocios: [],
    })
  })
  it('no cruza clientes homónimos, aunque tengan nombres y negocios parecidos', () => {
    const visibles = [{ id: 'nuevo', clienteId: 'c1', createdAt: fecha(20) }]
    expect(resumirFiadosAnteriores(visibles, [deuda('otro', 'c2', 10, 9000)]).size).toBe(0)
  })
  it('suma en centavos pedidos previos, mantiene origen del negocio y cantidades entregadas, sin imputar unidades impagas', () => {
    const r = resumirFiadosAnteriores([{ id: 'nuevo', clienteId: 'c1', createdAt: fecha(20) }], [
      deuda('a', 'c1', 10, 2500.25, [{ producto: 'PACA_AGUA', cantidadEntregada: 5 }], 'Tienda A'),
      deuda('b', 'c1', 11, 4500.35, [{ producto: 'PACA_AGUA', cantidadEntregada: 3 }, { producto: 'PACA_HIELO', cantidadEntregada: 1 }], 'Tienda B'),
    ]).get('nuevo')
    expect(r).toEqual({ total: 7000.6, pedidos: 2,
      productos: [{ producto: 'PACA_AGUA', cantidad: 8 }, { producto: 'PACA_HIELO', cantidad: 1 }],
      negocios: ['Tienda A', 'Tienda B'] })
  })
  it('no considera deuda cero o negativa ni presenta deudas de CONSUMIDOR_FINAL', () => {
    const r = resumirFiadosAnteriores([
      { id: 'n', clienteId: 'c1', createdAt: fecha(20) },
      { id: 'anon', clienteId: 'CONSUMIDOR_FINAL', createdAt: fecha(20) },
    ], [
      deuda('a', 'c1', 10, 0),
      deuda('b', 'c1', 11, -100),
      deuda('c', 'CONSUMIDOR_FINAL', 10, 30000),
    ])
    expect(r.size).toBe(0)
  })
  it('desempata timestamps idénticos por id y no repite cada cliente en el total', () => {
    const visibles = [{ id: 'b', clienteId: 'c1', createdAt: fecha(20) },
      { id: 'c', clienteId: 'c1', createdAt: fecha(20) }]
    const r = resumirFiadosAnteriores(visibles, [
      deuda('a', 'c1', 20, 1000),
      deuda('b', 'c1', 20, 2000),
    ])
    expect(r.get('b')?.total).toBe(1000)
    expect(r.get('c')?.total).toBe(3000)
  })
  it('ignora líneas con cantidades no verificables sin ocultar deuda monetaria válida', () => {
    const r = resumirFiadosAnteriores([{ id: 'n', clienteId: 'c1', createdAt: fecha(20) }], [
      deuda('a', 'c1', 10, 9000, [
        { producto: 'PACA_AGUA', cantidadEntregada: 2 },
        { producto: 'PACA_HIELO', cantidadEntregada: -1 },
      ]),
    ])
    expect(r.get('n')?.total).toBe(9000)
    expect(r.get('n')?.productos).toEqual([{ producto: 'PACA_AGUA', cantidad: 2 }])
  })
})
