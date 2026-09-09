import { describe, it, expect } from 'vitest'
import { resolverEntrega, dentroDeCobertura } from '../entrega-suficiencia.service'

const COORDS = { lat: 4.65, lng: -74.05 }

describe('resolverEntrega — matriz de suficiencia (docs/pedidos/entrega-suficiencia-plan.md §6)', () => {
  it('#1 dirección + barrio + ubicación → SUFICIENTE, no re-pedir', () => {
    const r = resolverEntrega({
      canal: 'DOMICILIO',
      cliente: { direccion: 'Cra 1 # 2-3', barrio: 'Centro', lat: COORDS.lat, lng: COORDS.lng, geocodeOrigen: 'MANUAL' },
    })
    expect(r.estado).toBe('SUFICIENTE')
    expect(r.faltaComplementario).toEqual([])
    expect(r.faltaBloqueante).toEqual([])
  })

  it('#2 ubicación válida, sin dirección → SUFICIENTE_COMPLEMENTARIA_FALTANTE (continúa)', () => {
    const r = resolverEntrega({
      canal: 'DOMICILIO',
      cliente: { barrio: 'Centro', lat: COORDS.lat, lng: COORDS.lng, geocodeOrigen: 'GPS_HISTORIAL' },
    })
    expect(r.estado).toBe('SUFICIENTE_COMPLEMENTARIA_FALTANTE')
    expect(r.via).toBe('GEO')
    expect(r.faltaComplementario).toContain('direccion')
  })

  it('#3 ubicación válida, sin barrio → SUFICIENTE_COMPLEMENTARIA_FALTANTE (continúa)', () => {
    const r = resolverEntrega({
      canal: 'DOMICILIO',
      cliente: { direccion: 'Cra 1 # 2-3', lat: COORDS.lat, lng: COORDS.lng, geocodeOrigen: 'MANUAL' },
    })
    expect(r.estado).toBe('SUFICIENTE_COMPLEMENTARIA_FALTANTE')
    expect(r.faltaComplementario).toEqual(['barrio'])
  })

  it('#4 dirección válida sin barrio ni ubicación → SUFICIENTE por vía TEXTO (complementaria: barrio)', () => {
    const r = resolverEntrega({ canal: 'DOMICILIO', cliente: { direccion: 'Calle 45 # 12-30' } })
    expect(r.via).toBe('TEXTO')
    expect(r.estado).toBe('SUFICIENTE_COMPLEMENTARIA_FALTANTE')
    expect(r.faltaComplementario).toEqual(['barrio'])
    expect(r.faltaBloqueante).toEqual([])
  })

  it('#5 solo barrio → INSUFICIENTE', () => {
    const r = resolverEntrega({ canal: 'DOMICILIO', cliente: { barrio: 'Kennedy' } })
    expect(r.estado).toBe('INSUFICIENTE')
    expect(r.via).toBeNull()
    expect(r.faltaBloqueante).toEqual(['direccion', 'ubicacion'])
  })

  it('#6 link Maps resoluble → coords utilizables → SUFICIENTE por vía GEO', () => {
    const r = resolverEntrega({
      canal: 'DOMICILIO',
      cliente: { barrio: 'Centro', linkUbicacion: 'https://maps.app.goo.gl/abc' },
      coordsDeLink: COORDS,
    })
    expect(r.via).toBe('GEO')
    expect(r.coords?.origen).toBe('PARSED_URL')
    expect(r.linkResoluble).toBe(true)
    expect(r.estado).toBe('SUFICIENTE_COMPLEMENTARIA_FALTANTE') // falta direccion
  })

  it('#7 link almacenado NO resoluble → no aporta; estado según el resto (solo barrio → INSUFICIENTE)', () => {
    const r = resolverEntrega({
      canal: 'DOMICILIO',
      cliente: { barrio: 'Centro', linkUbicacion: 'https://maps.app.goo.gl/roto' },
      coordsDeLink: null,
    })
    expect(r.linkResoluble).toBe(false)
    expect(r.coords).toBeNull()
    expect(r.estado).toBe('INSUFICIENTE')
  })

  it('#8 coordenadas inválidas (0,0) / NaN → no son ubicación válida', () => {
    const cero = resolverEntrega({ canal: 'DOMICILIO', cliente: { barrio: 'X', lat: 0, lng: 0 } })
    expect(cero.coords).toBeNull()
    expect(cero.estado).toBe('INSUFICIENTE')
    const nan = resolverEntrega({ canal: 'DOMICILIO', cliente: { barrio: 'X', lat: 'abc', lng: null } })
    expect(nan.coords).toBeNull()
  })

  it('#9 ubicación fuera de cobertura → INSUFICIENTE — PENDIENTE (cobertura no definida)', () => {
    // dentroDeCobertura es un stub que devuelve siempre 'no_evaluada'. Este
    // criterio no es ejecutable hasta que negocio defina la cobertura.
    expect(dentroDeCobertura(COORDS.lat, COORDS.lng)).toBe('no_evaluada')
  })

  it('#10 sin info suficiente → INSUFICIENTE con faltaBloqueante para explicar', () => {
    const r = resolverEntrega({ canal: 'DOMICILIO', cliente: {} })
    expect(r.estado).toBe('INSUFICIENTE')
    expect(r.faltaBloqueante.length).toBeGreaterThan(0)
  })

  it('#11 negocio con info de entrega propia → usa el contexto del negocio', () => {
    const r = resolverEntrega({
      canal: 'DOMICILIO',
      cliente: { direccion: 'Casa del dueño', barrio: 'Norte' },
      negocio: { direccion: 'Local 5, plaza central', barrio: 'Centro', lat: COORDS.lat, lng: COORDS.lng },
    })
    expect(r.direccion).toBe('Local 5, plaza central')
    expect(r.barrio).toBe('Centro')
    expect(r.coords?.origen).toBe('NEGOCIO')
  })

  it('#12 cliente + negocio no se mezclan: el override del pedido gana atómicamente', () => {
    const r = resolverEntrega({
      canal: 'DOMICILIO',
      overrideDireccion: 'Entrega puntual: obra Cra 9',
      cliente: { direccion: 'Cra 1', barrio: 'Centro' },
      negocio: { direccion: 'Local 5', barrio: 'Plaza' },
    })
    expect(r.direccion).toBe('Entrega puntual: obra Cra 9')
    expect(r.barrio).toBeNull() // override no traía barrio → no se hereda del cliente/negocio
  })

  it('#20 ausencia de barrio no bloquea si hay otra info suficiente', () => {
    const r = resolverEntrega({ canal: 'DOMICILIO', cliente: { direccion: 'Cra 1 # 2-3' } })
    expect(['SUFICIENTE', 'SUFICIENTE_COMPLEMENTARIA_FALTANTE']).toContain(r.estado)
    expect(r.faltaBloqueante).toEqual([])
  })

  it('#21 ausencia de dirección no bloquea si hay ubicación geográfica utilizable', () => {
    const r = resolverEntrega({ canal: 'DOMICILIO', cliente: { lat: COORDS.lat, lng: COORDS.lng, geocodeOrigen: 'MANUAL' } })
    expect(r.estado).toBe('SUFICIENTE_COMPLEMENTARIA_FALTANTE')
    expect(r.faltaBloqueante).toEqual([])
  })

  it('#22 ausencia de información suficiente sí bloquea', () => {
    const r = resolverEntrega({ canal: 'DOMICILIO', cliente: null, negocio: null })
    expect(r.estado).toBe('INSUFICIENTE')
  })

  it('PUNTO → siempre SUFICIENTE, via null (retiro en mostrador)', () => {
    const r = resolverEntrega({ canal: 'PUNTO', cliente: {} })
    expect(r.estado).toBe('SUFICIENTE')
    expect(r.via).toBeNull()
  })

  it('coords sin geocodeOrigen conocido → se consideran utilizables (backfill previo), no se inventa rechazo', () => {
    const r = resolverEntrega({ canal: 'DOMICILIO', cliente: { direccion: 'Cra 1', lat: COORDS.lat, lng: COORDS.lng } })
    expect(r.coords?.origen).toBe('DESCONOCIDO')
    expect(r.via).toBe('GEO')
    expect(r.estado).toBe('SUFICIENTE_COMPLEMENTARIA_FALTANTE')
  })

  it('link presente pero SIN intentar resolver (coordsDeLink undefined) y con coords almacenadas → GEO por las almacenadas', () => {
    const r = resolverEntrega({
      canal: 'DOMICILIO',
      cliente: { direccion: 'Cra 1', barrio: 'Centro', linkUbicacion: 'https://maps.app.goo.gl/x', lat: COORDS.lat, lng: COORDS.lng, geocodeOrigen: 'PARSED_URL' },
    })
    expect(r.via).toBe('GEO')
    expect(r.estado).toBe('SUFICIENTE')
  })
})
