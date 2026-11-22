import { describe, expect, it } from 'vitest'
import { resumirFiadosAnteriores, type DeudaParaAviso } from './fiados-anteriores-pedido'

const deuda = (id: string, clienteId: string, numero: number, exigible: number,
  productos: DeudaParaAviso['productos'] = [{ producto: 'PACA_AGUA', cantidadEntregada: 5 }],
  negocioNombre: string | null = null): DeudaParaAviso =>
  ({ id, numero, clienteId, exigible, productos, negocioNombre })

describe('#932: cobros pendientes de OTROS pedidos del mismo cliente', () => {
  it('incluye deuda posterior aunque el pedido visible sea anterior y esté pagado', () => {
    const r = resumirFiadosAnteriores([{ id: 'viejo', clienteId: 'c1' }], [
      deuda('viejo', 'c1', 150, 0),
      deuda('nuevo', 'c1', 170, 5500),
    ])
    expect(r.get('viejo')).toMatchObject({ total: 5500, propio: 0, totalCliente: 5500, pedidos: 1,
      origenes: [{ numero: 170, negocio: null, importe: 5500 }] })
  })

  it('desglosa propio, ajeno y total sin duplicar importes', () => {
    const r = resumirFiadosAnteriores([
      { id: 'a', clienteId: 'c1' }, { id: 'b', clienteId: 'c1' },
    ], [deuda('a', 'c1', 150, 15000), deuda('b', 'c1', 170, 5000)])
    expect(r.get('a')).toMatchObject({ total: 5000, propio: 15000, totalCliente: 20000 })
    expect(r.get('b')).toMatchObject({ total: 15000, propio: 5000, totalCliente: 20000 })
  })

  it('sin otras deudas no crea badge, incluso si el pedido propio está fiado', () => {
    expect(resumirFiadosAnteriores([{ id: 'a', clienteId: 'c1' }],
      [deuda('a', 'c1', 150, 15000)]).size).toBe(0)
  })

  it('no cruza clientes homónimos, negocios diferentes ni consumidor final', () => {
    const r = resumirFiadosAnteriores([
      { id: 'n', clienteId: 'c1' }, { id: 'anon', clienteId: 'CONSUMIDOR_FINAL' },
    ], [
      deuda('a', 'c2', 100, 20000),
      deuda('b', 'c1', 101, 2000, [], 'Tienda B'),
      deuda('c', 'CONSUMIDOR_FINAL', 102, 90000),
    ])
    expect(r.size).toBe(1)
    expect(r.get('n')).toMatchObject({ total: 2000,
      negocios: ['Tienda B'], origenes: [{ numero: 101, negocio: 'Tienda B', importe: 2000 }] })
  })

  it('suma centavos, productos físicos y negocios sin atribuir unidades impagas', () => {
    const r = resumirFiadosAnteriores([{ id: 'nuevo', clienteId: 'c1' }], [
      deuda('a', 'c1', 150, 2500.25, [{ producto: 'PACA_AGUA', cantidadEntregada: 5 }], 'Tienda A'),
      deuda('b', 'c1', 151, 4500.35, [
        { producto: 'PACA_AGUA', cantidadEntregada: 3 }, { producto: 'PACA_HIELO', cantidadEntregada: 1 },
      ], 'Tienda B'),
    ])
    expect(r.get('nuevo')).toMatchObject({ total: 7000.6, totalCliente: 7000.6, pedidos: 2,
      productos: [{ producto: 'PACA_AGUA', cantidad: 8 }, { producto: 'PACA_HIELO', cantidad: 1 }],
      negocios: ['Tienda A', 'Tienda B'] })
  })

  it('no duplica filas de deuda, ignora importes no válidos y cantidades incorrectas', () => {
    const r = resumirFiadosAnteriores([{ id: 'n', clienteId: 'c1' }], [
      deuda('a', 'c1', 100, 2000, [{ producto: 'PACA_AGUA', cantidadEntregada: 2 },
        { producto: 'PACA_HIELO', cantidadEntregada: -1 }]),
      deuda('a', 'c1', 100, 2000),
      deuda('b', 'c1', 101, Number.NaN),
      deuda('c', 'c1', 102, -100),
    ])
    expect(r.get('n')).toMatchObject({ total: 2000, pedidos: 1,
      productos: [{ producto: 'PACA_AGUA', cantidad: 2 }] })
  })

  it('mantiene aviso de cobro reportado por confirmar sin inflar el saldo', () => {
    const pendiente = { ...deuda('a', 'c1', 50, 8000), pagoPorConfirmar: true }
    const r = resumirFiadosAnteriores([{ id: 'actual', clienteId: 'c1' }], [pendiente])
    expect(r.get('actual')).toMatchObject({ total: 8000, pagoPorConfirmar: true })
  })

  it('sin exigibles ajenos no afirma deuda aun cuando otros pedidos tienen saldo contractual', () => {
    expect(resumirFiadosAnteriores([{ id: 'n', clienteId: 'c1' }],
      [deuda('programado', 'c1', 50, 0)]).size).toBe(0)
  })
})
