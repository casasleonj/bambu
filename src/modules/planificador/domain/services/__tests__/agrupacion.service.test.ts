import { describe, it, expect } from 'vitest'
import { agrupar, type ParadaAgrupable } from '../agrupacion.service'

function parada(over: Partial<ParadaAgrupable> & { key: string }): ParadaAgrupable {
  return {
    clienteId: over.key,
    negocioId: null,
    lat: null,
    lng: null,
    ubicable: false,
    barrio: null,
    rutaId: null,
    ...over,
  }
}

// Codazzi ≈ 10.03, -73.24
const near = (i: number) => ({ lat: 10.03 + i * 0.001, lng: -73.24 + i * 0.001 })

describe('agrupar', () => {
  it('degradación a bajo volumen: 3 paradas ubicables → 1 solo grupo (sin clusterizar)', () => {
    const paradas = [0, 1, 2].map((i) =>
      parada({ key: `p${i}`, ...near(i), ubicable: true, barrio: 'Centro' }),
    )
    const { grupos } = agrupar(paradas)
    expect(grupos).toHaveLength(1)
    expect(grupos[0].tipo).toBe('PROXIMIDAD')
    expect(grupos[0].keys.sort()).toEqual(['p0', 'p1', 'p2'])
  })

  it('a escala: dos racimos separados → dos grupos de proximidad', () => {
    const racimoA = [0, 1, 2, 3].map((i) =>
      parada({ key: `a${i}`, lat: 10.03 + i * 0.0005, lng: -73.24 + i * 0.0005, ubicable: true, barrio: 'Norte' }),
    )
    const racimoB = [0, 1, 2, 3].map((i) =>
      parada({ key: `b${i}`, lat: 10.06 + i * 0.0005, lng: -73.20 + i * 0.0005, ubicable: true, barrio: 'Sur' }),
    )
    const { grupos } = agrupar([...racimoA, ...racimoB], { minParadasParaClusterizar: 4, epsKm: 1, minPts: 2 })
    expect(grupos.length).toBeGreaterThanOrEqual(2)
    const norte = grupos.find((g) => g.nombre === 'Norte')
    const sur = grupos.find((g) => g.nombre === 'Sur')
    expect(norte?.keys.every((k) => k.startsWith('a'))).toBe(true)
    expect(sur?.keys.every((k) => k.startsWith('b'))).toBe(true)
  })

  it('paradas sin coords se agrupan por barrio', () => {
    const paradas = [
      parada({ key: 'x1', barrio: 'El Prado' }),
      parada({ key: 'x2', barrio: 'El Prado' }),
      parada({ key: 'x3', barrio: 'La Loma' }),
    ]
    const { grupos, sinAgrupar } = agrupar(paradas)
    expect(sinAgrupar).toHaveLength(0)
    expect(grupos.find((g) => g.nombre === 'El Prado')?.keys.sort()).toEqual(['x1', 'x2'])
    expect(grupos.find((g) => g.nombre === 'La Loma')?.keys).toEqual(['x3'])
    expect(grupos.every((g) => g.tipo === 'BARRIO')).toBe(true)
  })

  it('parada sin coords y sin barrio → sinAgrupar', () => {
    const { grupos, sinAgrupar } = agrupar([parada({ key: 'z1' })])
    expect(grupos).toHaveLength(0)
    expect(sinAgrupar).toEqual(['z1'])
  })

  it('nombra el grupo con la ruta habitual dominante si hay nombresRuta', () => {
    const paradas = [0, 1, 2].map((i) =>
      parada({ key: `p${i}`, ...near(i), ubicable: true, rutaId: 'r1' }),
    )
    const { grupos } = agrupar(paradas, { nombresRuta: { r1: 'Ruta Centro' } })
    expect(grupos[0].nombre).toBe('Ruta Centro')
    expect(grupos[0].rutaId).toBe('r1')
  })

  it('determinista: mismos inputs → mismo resultado', () => {
    const mk = () =>
      [0, 1, 2, 3, 4].map((i) => parada({ key: `p${i}`, ...near(i), ubicable: true, barrio: 'X' }))
    const a = agrupar(mk())
    const b = agrupar(mk())
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
