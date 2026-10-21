import { describe, it, expect } from 'vitest'
import { accionesDetalle, lineaDeTiempo, linksContacto, porcentajePagado, telefonoWhatsapp } from '../derive-detalle'
import type { Pedido } from '../../pedidos-client/types'

const base = (o: Partial<Pedido>) => ({ fecha: '2026-10-20T14:00:00.000Z', estadoEntrega: 'PENDIENTE', ...o }) as Pedido

describe('accionesDetalle', () => {
  it('PENDIENTE: Enviar primaria; Editar y Cancelar secundarias', () => {
    const a = accionesDetalle('PENDIENTE')
    expect(a.primaria?.label).toBe('🚚 Enviar')
    expect(a.secundarias.map((x) => x.label)).toEqual(['✏️ Editar', 'Cancelar'])
  })
  it('EN_RUTA: Marcar Entregado + Volver a Pendiente', () => {
    const a = accionesDetalle('EN_RUTA')
    expect(a.primaria?.key).toBe('entregar')
    expect(a.secundarias.map((x) => x.key)).toEqual(['volver-pendiente'])
  })
  it('ENTREGADO: solo Anular Pedido', () => {
    const a = accionesDetalle('ENTREGADO')
    expect(a.primaria).toBeNull()
    expect(a.secundarias.map((x) => x.label)).toEqual(['Anular Pedido'])
  })
  it('CANCELADO/ANULADO: sin acciones y con mensaje', () => {
    expect(accionesDetalle('CANCELADO').sinAcciones).toContain('cancelado')
    expect(accionesDetalle('ANULADO').sinAcciones).toContain('anulado')
    expect(accionesDetalle('ANULADO').secundarias).toEqual([])
  })
})

describe('lineaDeTiempo', () => {
  it('pendiente: creado actual, resto pendiente y sin fechas inventadas', () => {
    const t = lineaDeTiempo(base({ creadoPor: 'Laura' }))
    expect(t.map((x) => x.estado)).toEqual(['actual', 'pendiente', 'pendiente'])
    expect(t[0].detalle).toBe('por Laura')
    expect(t[1].fecha).toBeNull()
    expect(t[2].fecha).toBeNull()
  })
  it('en ruta: usa hora de salida y repartidor del embarque', () => {
    const t = lineaDeTiempo(base({
      estadoEntrega: 'EN_RUTA',
      embarqueResumen: { id: 'e1', numeroDia: 3, estado: 'EN_RUTA', repartidor: 'Pedro', horaSalida: '2026-10-20T15:00:00.000Z' },
    }))
    expect(t[1]).toMatchObject({ estado: 'actual', fecha: '2026-10-20T15:00:00.000Z', detalle: 'Embarque #3 · Pedro' })
  })
  it('entregado: fecha de entregaResumen gana sobre entregadoAt', () => {
    const t = lineaDeTiempo(base({
      estadoEntrega: 'ENTREGADO',
      entregadoAt: '2026-10-20T17:00:00.000Z',
      entregaResumen: { fecha: '2026-10-20T16:30:00.000Z', gpsLat: null, gpsLng: null, fotoUrl: null },
    }))
    expect(t.map((x) => x.estado)).toEqual(['hecho', 'hecho', 'hecho'])
    expect(t[2].fecha).toBe('2026-10-20T16:30:00.000Z')
  })
  it('cancelado: pasos siguientes cerrados', () => {
    const t = lineaDeTiempo(base({ estadoEntrega: 'CANCELADO' }))
    expect(t.map((x) => x.estado)).toEqual(['hecho', 'cerrado', 'cerrado'])
  })
})

describe('linksContacto', () => {
  it('arma tel, whatsapp 57 y mapa por coords', () => {
    const l = linksContacto({ telefonoCli: '300 123 4567', lat: 4.6, lng: -74.1, zonaCli: '', barrioCli: '' })
    expect(l.llamar).toBe('tel:3001234567')
    expect(l.whatsapp).toBe('https://wa.me/573001234567')
    expect(l.mapa).toContain('destination=4.6,-74.1')
  })
  it('sin coords usa la dirección de texto; sin nada → null', () => {
    expect(linksContacto({ telefonoCli: '', zonaCli: 'Calle 1', barrioCli: 'Centro' }).mapa).toContain('query=Calle%201%2C%20Centro')
    const vacio = linksContacto({ telefonoCli: '', zonaCli: '', barrioCli: '' })
    expect(vacio).toEqual({ llamar: null, whatsapp: null, mapa: null })
  })
  it('no confunde coords 0 / null', () => {
    expect(linksContacto({ telefonoCli: '', lat: null, lng: null, zonaCli: '', barrioCli: '' }).mapa).toBeNull()
  })
})

describe('utilidades', () => {
  it('telefonoWhatsapp respeta números con prefijo', () => {
    expect(telefonoWhatsapp('573001234567')).toBe('573001234567')
    expect(telefonoWhatsapp('123')).toBeNull()
  })
  it('porcentajePagado acota 0–100 y evita división por cero', () => {
    expect(porcentajePagado(0, 10)).toBe(0)
    expect(porcentajePagado(100, 50)).toBe(50)
    expect(porcentajePagado(100, 250)).toBe(100)
  })
})
