import { describe, expect, it } from 'vitest'
import { construirSolicitudVroom, leerOrdenVroom } from '../heigit-vroom'
import { RecorridoVialError, type ParadaVial } from '../google-route-optimization'

const parada = (pedidoId: string, lat: number, lng: number, tipo: ParadaVial['tipo'] = 'ENTREGA'): ParadaVial =>
  ({ pedidoId, lat, lng, tipo })
const paradas = [
  parada('pedido-A', 10.035, -73.234),
  parada('pedido-B', 10.038, -73.239, 'COBRO'),
  parada('pedido-C', 10.041, -73.240, 'ENTREGA_Y_COBRO'),
]
const salida = new Date('2026-11-21T15:00:00.000Z')
const origen = { lat: 10.034, lng: -73.237 }
const ok = (steps: Array<Record<string, unknown>>) => ({
  code: 0, summary: { unassigned: 0 },
  unassigned: [], routes: [{ vehicle: 1, steps }],
})

describe('#930 HeiGIT VROOM: contrato de solicitud', () => {
  it('envía jobs numéricos sin identidades y utiliza LONGITUD/LATITUD sobre vías', () => {
    const req = construirSolicitudVroom({ origen, paradas, salida })
    expect(req.vehicles).toEqual([{ id: 1, profile: 'car', start: [-73.237, 10.034] }])
    expect(req.jobs).toEqual([
      { id: 1, location: [-73.234, 10.035] },
      { id: 2, location: [-73.239, 10.038] },
      { id: 3, location: [-73.240, 10.041] },
    ])
    expect(JSON.stringify(req)).not.toContain('pedido-')
    expect(JSON.stringify(req)).not.toContain('geometry')
    expect(req.vehicles[0]).not.toHaveProperty('end')
  })
  it('rechaza ubicaciones inválidas, ids repetidos, vacío y más de 25', () => {
    const entradas = [
      { origen: { lat: 0, lng: 0 }, paradas },
      { origen, paradas: [] },
      { origen, paradas: [paradas[0], paradas[0]] },
      { origen, paradas: [parada('x', 91, 2)] },
      { origen, paradas: Array.from({ length: 26 }, (_, i) => parada(String(i), 10.04, -73.23)) },
    ]
    for (const t of entradas)
      expect(() => construirSolicitudVroom({ ...t, salida })).toThrow(RecorridoVialError)
  })
})

describe('#930 HeiGIT VROOM: salida vial adversarial', () => {
  it('conserva el orden devuelto, sin recalcularlo por distancia recta', () => {
    const result = leerOrdenVroom(ok([
      { type: 'start' },
      { type: 'job', id: 3 }, { type: 'job', id: 1 },
      { type: 'job', id: 2 }, { type: 'end' },
    ]), paradas)
    expect(result).toEqual({
      ordenPedidoIds: ['pedido-C', 'pedido-A', 'pedido-B'],
      totalParadas: 3, proveedor: 'HEIGIT_VROOM', modoVial: 'DRIVING',
    })
  })
  it('rechaza omisiones incluso si VROOM responde HTTP 200', () => {
    expect(() => leerOrdenVroom(ok([{ type: 'job', id: 1 }]), paradas))
      .toThrow(RecorridoVialError)
    expect(() => leerOrdenVroom({ ...ok([]), unassigned: [{ id: 2 }] }, paradas))
      .toThrow(RecorridoVialError)
    expect(() => leerOrdenVroom({ ...ok([]), summary: { unassigned: 1 } }, paradas))
      .toThrow(RecorridoVialError)
  })
  it('rechaza duplicados, ID ajeno, rutas múltiples, vehículo incorrecto y código de error', () => {
    const casos = [
      ok([{ type: 'job', id: 1 }, { type: 'job', id: 1 }, { type: 'job', id: 3 }]),
      ok([{ type: 'job', id: 1 }, { type: 'job', id: 2 }, { type: 'job', id: 999 }]),
      { ...ok([]), routes: [{ vehicle: 1, steps: [] }, { vehicle: 2, steps: [] }] },
      { ...ok([]), routes: [{ vehicle: 2, steps: [] }] },
      { ...ok([]), code: 3 },
      ok([{ type: 'pickup', id: 1 }, { type: 'job', id: 2 }, { type: 'job', id: 3 }]),
    ]
    for (const response of casos)
      expect(() => leerOrdenVroom(response, paradas)).toThrow(RecorridoVialError)
  })
  it('permite una sola parada, siempre con la misma identidad original', () => {
    const result = leerOrdenVroom(ok([{ type: 'start' }, { type: 'job', id: 1 }]), [paradas[0]])
    expect(result.ordenPedidoIds).toEqual(['pedido-A'])
  })
})
