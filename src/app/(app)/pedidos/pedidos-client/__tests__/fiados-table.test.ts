import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { diasFiadoDesde, filasFiados, pedidosPorClasificar, clienteTieneCartera } from '../fiados-table'
import type { Pedido } from '../types'

// @tests diasFiadoDesde: antes se calculaba una vez dentro de un useMemo
// dependiente solo de los pedidos (Date.now() dentro del factory), así que
// el valor quedaba congelado mientras la pestaña seguía abierta sin que
// pedidosFiltrados cambiara -- un fiado de "5 días" seguía mostrando "5
// días" indefinidamente aunque pasaran semanas. Ahora se calcula fuera del
// memo, en cada render, así que siempre refleja el tiempo real transcurrido.
describe('diasFiadoDesde', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calcula días transcurridos redondeando hacia abajo', () => {
    const ahora = new Date('2026-08-20T12:00:00Z')
    vi.setSystemTime(ahora)
    const hace5Dias = new Date(ahora.getTime() - 5 * 86_400_000)
    expect(diasFiadoDesde(hace5Dias)).toBe(5)
  })

  it('0 si la fecha es de hoy', () => {
    const ahora = new Date('2026-08-20T12:00:00Z')
    vi.setSystemTime(ahora)
    expect(diasFiadoDesde(ahora)).toBe(0)
  })

  it('el resultado avanza con el tiempo real (no queda congelado)', () => {
    const inicio = new Date('2026-08-20T00:00:00Z')
    vi.setSystemTime(inicio)
    const fechaFiado = new Date('2026-08-15T00:00:00Z')

    const primero = diasFiadoDesde(fechaFiado)
    expect(primero).toBe(5)

    // Avanza el reloj 3 días sin tocar fechaFiado -- simula la pestaña
    // quedando abierta. El valor debe reflejar el nuevo tiempo transcurrido.
    vi.setSystemTime(new Date('2026-08-23T00:00:00Z'))
    const despues = diasFiadoDesde(fechaFiado)
    expect(despues).toBe(8)
  })
})

describe('resumenFiados (#613)', () => {
  it('suma exacta de las filas visibles, sin errores de coma flotante', async () => {
    const { resumenFiados } = await import('../fiados-table')
    expect(resumenFiados([{ deuda: 0.1, pedidos: [1] }, { deuda: 0.2, pedidos: [1, 2] }])).toEqual({ total: 0.3, clientes: 2, pedidos: 3 })
  })
  it('sin filas = cero', async () => {
    const { resumenFiados } = await import('../fiados-table')
    expect(resumenFiados([])).toEqual({ total: 0, clientes: 0, pedidos: 0 })
  })
})

describe('#1002 y #1001: por clasificar y cartera del cliente', () => {
  const ped = (id: string, clienteId: string, corte: { fiado: number; sinClasificar: number; pendiente?: number }): Pedido => ({
    id, numero: 1, clienteId, nombreCli: clienteId, telefonoCli: '', estadoEntrega: 'ENTREGADO', fecha: '2026-11-10T15:00:00.000Z',
    total: 10, saldo: 10, totalPagado: 0, exigible: 10,
    corteOperativo: { fiado: corte.fiado, sinClasificar: corte.sinClasificar, pendiente: corte.pendiente ?? 0, exigible: 10 },
  } as unknown as Pedido)
  it('pedidosPorClasificar cuenta solo los pedidos con importe sin clasificar', () => {
    const [row] = filasFiados([ped('a', 'c1', { fiado: 10, sinClasificar: 0 }), ped('b', 'c1', { fiado: 0, sinClasificar: 10 })], 'todos')
    expect(pedidosPorClasificar(row)).toBe(1)
  })
  it('cliente con fiado o por clasificar tiene cartera; con solo pendiente del día, no', () => {
    const lista = [ped('a', 'conFiado', { fiado: 10, sinClasificar: 0 }), ped('b', 'sinClasificar', { fiado: 0, sinClasificar: 10 }), ped('c', 'soloHoy', { fiado: 0, sinClasificar: 0, pendiente: 10 })]
    expect(clienteTieneCartera(lista, 'conFiado')).toBe(true)
    expect(clienteTieneCartera(lista, 'sinClasificar')).toBe(true)
    expect(clienteTieneCartera(lista, 'soloHoy')).toBe(false)
    expect(clienteTieneCartera(lista, 'nadie')).toBe(false)
  })
})
