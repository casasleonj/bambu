import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { diasFiadoDesde } from '../fiados-table'

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
