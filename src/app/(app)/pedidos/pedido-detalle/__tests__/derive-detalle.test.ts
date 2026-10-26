import { describe, it, expect } from 'vitest'
import { accionesDetalle, lineaDeTiempo, linksContacto, origenPrecio, porcentajePagado, puedeVerAlertaPrecioManual, telefonoWhatsapp } from '../derive-detalle'
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
  it('EN_RUTA con embarque que ya salió: el botón se divide en «Entregó el repartidor» / «Cliente retiró»', () => {
    const a = accionesDetalle('EN_RUTA', 'EN_RUTA')
    expect(a.primaria?.key).toBe('entregar')
    expect(a.primaria?.label).toBe('🚚 Entregó el repartidor')
    expect(a.secundarias.map((x) => x.key)).toEqual(['entregar-retiro', 'volver-pendiente'])
  })
  it('EN_RUTA con embarque ABIERTO o sin embarque: un solo botón «Marcar Entregado»', () => {
    for (const e of ['ABIERTO', null, undefined]) {
      const a = accionesDetalle('EN_RUTA', e)
      expect(a.primaria?.label).toBe('✅ Marcar Entregado')
      expect(a.secundarias.map((x) => x.key)).toEqual(['volver-pendiente'])
    }
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

describe('puedeVerAlertaPrecioManual', () => {
  it('solo ADMIN y CONTADOR', () => {
    expect(puedeVerAlertaPrecioManual('ADMIN')).toBe(true)
    expect(puedeVerAlertaPrecioManual('CONTADOR')).toBe(true)
    expect(puedeVerAlertaPrecioManual('ASISTENTE')).toBe(false)
    expect(puedeVerAlertaPrecioManual(undefined)).toBe(false)
  })
})

describe('origenPrecio', () => {
  it('base y desconocido no llevan insignia', () => {
    expect(origenPrecio({ precioOrigen: 'base' })).toBeNull()
    expect(origenPrecio({})).toBeNull()
  })
  it('volumen y especial (cliente/negocio)', () => {
    expect(origenPrecio({ precioOrigen: 'volumen' })).toMatchObject({ label: 'volumen', tone: 'info' })
    expect(origenPrecio({ precioOrigen: 'cliente' })).toMatchObject({ label: 'especial', tone: 'info' })
  })
  it('volumen con tramo confirmado lo muestra', () => {
    expect(origenPrecio({ precioOrigen: 'volumen', tramoVolumen: { cantMin: 4, cantMax: 9 } })?.label).toBe('volumen 4–9 und')
    expect(origenPrecio({ precioOrigen: 'volumen', tramoVolumen: { cantMin: 10, cantMax: null } })?.label).toBe('volumen 10 o más und')
  })
  it('manual autorizado se ve verde para todos', () => {
    for (const rol of ['ADMIN', 'ASISTENTE', 'REPARTIDOR', null]) {
      expect(origenPrecio({ precioOrigen: 'manual', autorizadoPorAdmin: true }, rol)).toMatchObject({ label: 'manual ✓ autorizado', tone: 'ok' })
    }
  })
  it('manual sin autorizar: advertencia solo para ADMIN y CONTADOR; el resto lo ve neutro', () => {
    for (const rol of ['ADMIN', 'CONTADOR']) {
      expect(origenPrecio({ precioOrigen: 'manual', autorizadoPorAdmin: false }, rol)).toMatchObject({ label: 'manual · sin autorizar', tone: 'warn' })
    }
    for (const rol of ['ASISTENTE', 'REPARTIDOR', null, undefined]) {
      expect(origenPrecio({ precioOrigen: 'manual' }, rol)).toMatchObject({ label: 'manual', tone: 'neutral' })
    }
  })
  it('toda insignia trae una explicación', () => {
    for (const origen of ['volumen', 'cliente', 'manual']) expect(origenPrecio({ precioOrigen: origen }, 'ADMIN')?.ayuda.length).toBeGreaterThan(10)
  })
})

// TEMPORAL-SIN-EMBARQUE(#472)
describe('accionesDetalle con gestión de administrador sin embarque', () => {
  it('sin la opción, todo queda exactamente como antes', () => {
    for (const e of ['PENDIENTE', 'EN_RUTA', 'NO_ENTREGADO', 'ENTREGADO', 'CANCELADO', 'ANULADO']) {
      expect(accionesDetalle(e, null, {})).toEqual(accionesDetalle(e))
      expect(accionesDetalle(e, null, { gestionAdmin: false })).toEqual(accionesDetalle(e))
    }
  })
  it('PENDIENTE: «Registrar entrega» es la primaria y Enviar sigue disponible', () => {
    const a = accionesDetalle('PENDIENTE', null, { gestionAdmin: true })
    expect(a.primaria?.key).toBe('registrar-entrega')
    expect(a.secundarias.map((x) => x.key)).toEqual(['enviar', 'corregir-canal', 'editar', 'cancelar'])
  })
  it('NO_ENTREGADO: puede registrarse la entrega y corregirse el canal', () => {
    const a = accionesDetalle('NO_ENTREGADO', null, { gestionAdmin: true })
    expect(a.primaria?.key).toBe('registrar-entrega')
    expect(a.secundarias.map((x) => x.key)).toEqual(['corregir-canal'])
  })
  it('EN_RUTA: se conservan las acciones de siempre y se agrega «Registrar entrega»', () => {
    const base = accionesDetalle('EN_RUTA', 'EN_RUTA')
    const a = accionesDetalle('EN_RUTA', 'EN_RUTA', { gestionAdmin: true })
    expect(a.primaria).toEqual(base.primaria)
    expect(a.secundarias.map((x) => x.key)).toEqual(['registrar-entrega', ...base.secundarias.map((x) => x.key)])
  })
  it('un pedido cerrado no ofrece registrar entrega ni corregir el canal', () => {
    for (const e of ['ENTREGADO', 'CANCELADO', 'ANULADO']) {
      const claves = [accionesDetalle(e, null, { gestionAdmin: true }).primaria, ...accionesDetalle(e, null, { gestionAdmin: true }).secundarias].map((x) => x?.key)
      expect(claves).not.toContain('registrar-entrega')
      expect(claves).not.toContain('corregir-canal')
    }
  })
  it('un pedido EN_RUTA (dentro de un embarque) no ofrece corregir el canal', () => {
    const claves = [accionesDetalle('EN_RUTA', 'EN_RUTA', { gestionAdmin: true }).primaria, ...accionesDetalle('EN_RUTA', 'EN_RUTA', { gestionAdmin: true }).secundarias].map((x) => x?.key)
    expect(claves).not.toContain('corregir-canal')
  })
  it('sin la opción nunca aparece «Corregir canal»', () => {
    for (const e of ['PENDIENTE', 'EN_RUTA', 'NO_ENTREGADO', 'ENTREGADO']) {
      const a = accionesDetalle(e, null, {})
      expect([a.primaria, ...a.secundarias].map((x) => x?.key)).not.toContain('corregir-canal')
    }
  })
})
