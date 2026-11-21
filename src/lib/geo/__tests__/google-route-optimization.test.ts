import { describe, expect, it } from 'vitest'
import { construirSolicitudGoogle, leerOrdenGoogle, RecorridoVialError, type ParadaVial } from '../google-route-optimization'

const p = (pedidoId: string, lat: number, lng: number, tipo: ParadaVial['tipo'] = 'ENTREGA'): ParadaVial =>
  ({ pedidoId, lat, lng, tipo })
const origen = { lat: 10.034, lng: -73.237 }
const salida = new Date('2026-11-20T15:00:00Z')
const paradas = [p('uno', 10.036, -73.24), p('dos', 10.038, -73.25, 'COBRO'), p('tres', 10.04, -73.235, 'ENTREGA_Y_COBRO')]

describe('#930 Google Route Optimization: estructura de solicitud', () => {
  it('optimiza por carreteras, desde GPS, sin dibujar mapa ni volver a base', () => {
    const req = construirSolicitudGoogle({ origen, paradas, salida })
    expect(req.considerRoadTraffic).toBe(true)
    expect(req.useGeodesicDistances).toBe(false)
    expect(req.populatePolylines).toBe(false)
    expect(req.model.vehicles).toHaveLength(1)
    expect(req.model.vehicles[0]).not.toHaveProperty('endLocation')
    expect(req.model.vehicles[0]).not.toHaveProperty('endWaypoint')
    expect(req.model.vehicles[0].startLocation).toEqual({ latitude: origen.lat, longitude: origen.lng })
    expect(req.model.shipments.map(z => z.label)).toEqual(['uno', 'dos', 'tres'])
    expect(req.model.shipments[1]).not.toHaveProperty('loadDemands') // cobro no ocupa carga
  })

  it.each([
    { origen: { lat: 100, lng: -73.2 }, paradas },
    { origen: { lat: 0, lng: 0 }, paradas },
    { origen, paradas: [p('x', NaN, -73.25)] },
  ])('rechaza origen o destino inválidos: %j', datos => {
    expect(() => construirSolicitudGoogle({ ...datos, salida })).toThrow(RecorridoVialError)
  })
  it('no acepta duplicados, cero paradas ni más de 25 para no truncar silenciosamente', () => {
    for (const lista of [[], [paradas[0], paradas[0]],
      Array.from({ length: 26 }, (_, i) => p(String(i), 10.0, -73.2))])
      expect(() => construirSolicitudGoogle({ origen, paradas: lista, salida })).toThrow(RecorridoVialError)
  })
})

describe('#930 Google Route Optimization: respuesta verificada', () => {
  it('conserva exactamente el orden vial devuelto, no reordena por Haversine', () => {
    const r = leerOrdenGoogle({ routes: [{ visits: [
      { shipmentIndex: 2, shipmentLabel: 'tres' },
      { shipmentIndex: 1, shipmentLabel: 'dos' },
      { shipmentLabel: 'uno' }, // proto3 index 0 omitido
    ] }] }, paradas)
    expect(r.ordenPedidoIds).toEqual(['tres', 'dos', 'uno'])
  })
  it('no pierde un pedido por omitted/scheduled/skipped', () => {
    const faltan = { routes: [{ visits: [{ shipmentLabel: 'uno' }] }] }
    const saltados = { routes: [{ visits: [
      { shipmentLabel: 'uno' }, { shipmentIndex: 1 }, { shipmentIndex: 2 },
    ] }], skippedShipments: [{ index: 1 }] }
    expect(() => leerOrdenGoogle(faltan, paradas)).toThrow(RecorridoVialError)
    expect(() => leerOrdenGoogle(saltados, paradas)).toThrow(RecorridoVialError)
  })
  it('rechaza duplicados, índices ajenos, pickups y etiquetas que no coinciden', () => {
    const casos = [
      [0, 0, 2].map(shipmentIndex => ({ shipmentIndex })),
      [0, 1, 20].map(shipmentIndex => ({ shipmentIndex })),
      [{ shipmentIndex: 0, isPickup: true }, { shipmentIndex: 1 }, { shipmentIndex: 2 }],
      [{ shipmentIndex: 0, shipmentLabel: 'dos' }, { shipmentIndex: 1 }, { shipmentIndex: 2 }],
    ]
    for (const visits of casos)
      expect(() => leerOrdenGoogle({ routes: [{ visits }] }, paradas)).toThrow(RecorridoVialError)
  })
  it('el pedido 0 puede omitir su index, incluso cuando solo hay una parada', () => {
    const r = leerOrdenGoogle({ routes: [{ visits: [{}] }] }, [paradas[0]])
    expect(r.ordenPedidoIds).toEqual(['uno'])
  })
})
