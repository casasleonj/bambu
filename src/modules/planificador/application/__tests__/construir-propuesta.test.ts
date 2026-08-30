import { describe, it, expect } from 'vitest'
import { construirPropuesta, type CandidatoPedido } from '../construir-propuesta'

function candidato(over: Partial<CandidatoPedido> & { pedidoId: string; clienteId: string }): CandidatoPedido {
  return {
    negocioId: null,
    cantidades: { cPacaAguaPed: 2 },
    rutaId: null,
    clienteNombre: over.clienteId,
    geo: {
      pedidoId: over.pedidoId,
      clienteId: over.clienteId,
      negocioId: null,
      cliente: { lat: null, lng: null, barrio: 'Centro' },
      negocio: null,
    },
    ...over,
  }
}

const REPARTIDORES = [
  { id: 't1', nombre: 'Carlos', rutaIdsPreferidas: [] },
  { id: 't2', nombre: 'Ana', rutaIdsPreferidas: [] },
]

describe('construirPropuesta', () => {
  it('E1 — día normal: 5 pedidos cercanos con coords → 1 grupo, sin excepciones bloqueantes', () => {
    const candidatos = [0, 1, 2, 3, 4].map((i) =>
      candidato({
        pedidoId: `p${i}`,
        clienteId: `c${i}`,
        geo: {
          pedidoId: `p${i}`,
          clienteId: `c${i}`,
          negocioId: null,
          cliente: {
            lat: 10.03 + i * 0.001,
            lng: -73.24 + i * 0.001,
            barrio: 'Centro',
            geocodeOrigen: 'PARSED_URL',
            geocodeAt: '2026-08-15',
          },
          negocio: null,
        },
      }),
    )
    const p = construirPropuesta({
      fecha: '2026-08-30',
      candidatos,
      repartidoresDisponibles: REPARTIDORES,
      maxUnidades: 70,
      nombresRuta: {},
    })
    expect(p.grupos).toHaveLength(1)
    expect(p.grupos[0].paradas).toHaveLength(5)
    expect(p.grupos[0].trabajadorPropuestoId).toBe('t1')
    expect(p.grupos[0].distanciaKm).toBeGreaterThan(0)
    expect(p.resumen.pedidos).toBe(5)
    expect(p.resumen.unidades).toBe(10)
    expect(p.excepciones.filter((e) => e.severidad === 'ALTA')).toHaveLength(0)
  })

  it('E3 — sin GPS: cliente sin coords ni barrio → excepción MISSING_DATA, no bloquea el resto', () => {
    const p = construirPropuesta({
      fecha: '2026-08-30',
      candidatos: [
        candidato({
          pedidoId: 'ok',
          clienteId: 'cok',
          geo: {
            pedidoId: 'ok', clienteId: 'cok', negocioId: null,
            cliente: { lat: 10.03, lng: -73.24, barrio: 'Centro', geocodeOrigen: 'MANUAL', geocodeAt: null },
            negocio: null,
          },
        }),
        candidato({
          pedidoId: 'malo',
          clienteId: 'cmalo',
          geo: {
            pedidoId: 'malo', clienteId: 'cmalo', negocioId: null,
            cliente: { lat: null, lng: null, barrio: null },
            negocio: null,
          },
        }),
      ],
      repartidoresDisponibles: REPARTIDORES,
      maxUnidades: 70,
      nombresRuta: {},
    })
    expect(p.excepciones.some((e) => e.tipo === 'MISSING_DATA')).toBe(true)
    // el pedido 'ok' igual se planificó
    expect(p.grupos.some((g) => g.paradas.some((par) => par.clienteId === 'cok'))).toBe(true)
  })

  it('E4 — capacidad excedida: se divide en sub-grupos', () => {
    const candidatos = [0, 1, 2].map((i) =>
      candidato({
        pedidoId: `p${i}`,
        clienteId: `c${i}`,
        cantidades: { cPacaAguaPed: 30 }, // 90 total > 70
        geo: {
          pedidoId: `p${i}`, clienteId: `c${i}`, negocioId: null,
          cliente: { lat: 10.03 + i * 0.001, lng: -73.24, barrio: 'Centro', geocodeOrigen: 'MANUAL' },
          negocio: null,
        },
      }),
    )
    const p = construirPropuesta({
      fecha: '2026-08-30', candidatos, repartidoresDisponibles: REPARTIDORES, maxUnidades: 70, nombresRuta: {},
    })
    expect(p.grupos.length).toBeGreaterThanOrEqual(2)
    expect(p.grupos.every((g) => g.capacidadUnidades <= 70 || g.paradas.length === 1)).toBe(true)
  })

  it('determinista: mismos inputs → misma propuesta', () => {
    const mk = () =>
      [0, 1, 2, 3].map((i) =>
        candidato({
          pedidoId: `p${i}`, clienteId: `c${i}`,
          geo: {
            pedidoId: `p${i}`, clienteId: `c${i}`, negocioId: null,
            cliente: { lat: 10.03 + i * 0.001, lng: -73.24, barrio: 'X', geocodeOrigen: 'MANUAL' },
            negocio: null,
          },
        }),
      )
    const a = construirPropuesta({ fecha: '2026-08-30', candidatos: mk(), repartidoresDisponibles: REPARTIDORES, maxUnidades: 70, nombresRuta: {} })
    const b = construirPropuesta({ fecha: '2026-08-30', candidatos: mk(), repartidoresDisponibles: REPARTIDORES, maxUnidades: 70, nombresRuta: {} })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('sin repartidores → excepción RESOURCE_CONFLICT', () => {
    const p = construirPropuesta({
      fecha: '2026-08-30',
      candidatos: [
        candidato({
          pedidoId: 'p0', clienteId: 'c0',
          geo: { pedidoId: 'p0', clienteId: 'c0', negocioId: null, cliente: { lat: 10.03, lng: -73.24, barrio: 'X', geocodeOrigen: 'MANUAL' }, negocio: null },
        }),
      ],
      repartidoresDisponibles: [],
      maxUnidades: 70,
      nombresRuta: {},
    })
    expect(p.excepciones.some((e) => e.tipo === 'RESOURCE_CONFLICT')).toBe(true)
  })
})
