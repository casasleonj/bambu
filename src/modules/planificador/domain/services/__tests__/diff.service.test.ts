import { describe, it, expect } from 'vitest'
import { diffPlanes, type PlanSnapshotLite } from '../diff.service'

function snap(grupos: Array<{ nombre: string; rep?: string | null; pedidos: string[] }>): PlanSnapshotLite {
  return {
    grupos: grupos.map((g) => ({
      nombreLogico: g.nombre,
      trabajadorPropuestoId: g.rep ?? null,
      paradas: g.pedidos.map((p) => ({ clienteId: `c-${p}`, actividades: [{ pedidoIds: [p] }] })),
    })),
  }
}

describe('diffPlanes', () => {
  it('sin cambios', () => {
    const a = snap([{ nombre: 'Norte', pedidos: ['p1', 'p2'] }])
    const d = diffPlanes(a, snap([{ nombre: 'Norte', pedidos: ['p1', 'p2'] }]))
    expect(d.sinCambios).toBe(true)
  })

  it('detecta pedido agregado y quitado', () => {
    const a = snap([{ nombre: 'Norte', pedidos: ['p1', 'p2'] }])
    const b = snap([{ nombre: 'Norte', pedidos: ['p1', 'p3'] }])
    const d = diffPlanes(a, b)
    expect(d.pedidosAgregados).toEqual(['p3'])
    expect(d.pedidosQuitados).toEqual(['p2'])
    expect(d.sinCambios).toBe(false)
  })

  it('detecta pedido movido entre grupos', () => {
    const a = snap([{ nombre: 'Norte', pedidos: ['p1', 'p2'] }, { nombre: 'Sur', pedidos: ['p3'] }])
    const b = snap([{ nombre: 'Norte', pedidos: ['p1'] }, { nombre: 'Sur', pedidos: ['p3', 'p2'] }])
    const d = diffPlanes(a, b)
    expect(d.pedidosMovidos).toEqual([{ pedidoId: 'p2', de: 'Norte', a: 'Sur' }])
    expect(d.pedidosAgregados).toEqual([])
    expect(d.pedidosQuitados).toEqual([])
  })

  it('detecta grupo nuevo / eliminado y cambio de repartidor', () => {
    const a = snap([{ nombre: 'Norte', rep: 't1', pedidos: ['p1'] }, { nombre: 'Sur', pedidos: ['p2'] }])
    const b = snap([{ nombre: 'Norte', rep: 't2', pedidos: ['p1'] }, { nombre: 'Centro', pedidos: ['p2'] }])
    const d = diffPlanes(a, b)
    expect(d.gruposNuevos).toEqual(['Centro'])
    expect(d.gruposEliminados).toEqual(['Sur'])
    expect(d.repartidorCambiado).toEqual([{ grupo: 'Norte', de: 't1', a: 't2' }])
  })
})
