import { describe, expect, it } from 'vitest'
import {
  elegibleRiesgoOperativo, evaluarRiesgoPorTiempo, riesgoPorEmbarques,
  textoRiesgoOperativo, type PedidoRiesgoCandidato,
} from '../pedidos-riesgo-operativo'
import type { Turno } from '../business-hours'

const TURNOS: Turno[] = [
  { inicio: '05:30', fin: '12:00' },
  { inicio: '14:00', fin: '17:00' },
]
const hora = (s: string) => new Date(`2026-11-13T${s}:00-05:00`)
const creado = new Date('2026-11-12T17:40:00-05:00')

function pedido(cambios: Partial<PedidoRiesgoCandidato> = {}): PedidoRiesgoCandidato {
  return {
    estadoEntrega: 'PENDIENTE', embarqueId: null,
    createdAt: creado, fechaEntrega: null, items: [],
    ...cambios,
  }
}
const riesgo = (p: PedidoRiesgoCandidato, now: Date, umbral = 2) =>
  evaluarRiesgoPorTiempo(p, now, TURNOS, umbral)

describe('#929 riesgo operacional del servidor', () => {
  it('caso #1084 simulado: ayer 17:40, hoy 07:29 aún no, 07:30 sí, 07:31 sí', () => {
    expect(riesgo(pedido(), hora('07:29'))).toBeNull()
    expect(riesgo(pedido(), hora('07:30'))).toEqual({
      tipo: 'sin_gestionar', causa: 'tiempo', minutosHabiles: 120,
    })
    expect(riesgo(pedido(), hora('07:31'))?.minutosHabiles).toBe(121)
  })
  it('hoy: 119/120/121 minutos y umbral inclusivo', () => {
    const actual = pedido({ createdAt: hora('05:30') })
    expect(riesgo(actual, hora('07:29'))).toBeNull()
    expect(riesgo(actual, hora('07:30'))?.minutosHabiles).toBe(120)
    expect(riesgo(actual, hora('07:31'))?.minutosHabiles).toBe(121)
  })
  it('días anteriores y cambio de fecha no reinician el reloj', () => {
    const ayer = pedido({ createdAt: new Date('2026-11-12T15:30:00-05:00') })
    const anteayer = pedido({ createdAt: new Date('2026-11-11T16:30:00-05:00') })
    expect(riesgo(ayer, hora('06:30'))?.minutosHabiles).toBe(150)
    expect(riesgo(anteayer, hora('06:30'))?.minutosHabiles).toBeGreaterThan(150)
  })
  it('solo suma tramos hábiles: almuerzo, noche y medianoche quedan fuera', () => {
    const p = pedido({ createdAt: new Date('2026-11-13T11:00:00-05:00') })
    expect(riesgo(p, new Date('2026-11-13T13:59:00-05:00'))).toBeNull()
    expect(riesgo(p, new Date('2026-11-13T15:00:00-05:00'))?.minutosHabiles).toBe(120)
  })
  it('día futuro prometido: sin alerta ni riesgo por embarques anticipado', () => {
    const programado = pedido({ fechaEntrega: new Date('2026-11-14T05:00:00-05:00') })
    expect(elegibleRiesgoOperativo(programado, hora('07:30'))).toBe(false)
    expect(riesgo(programado, hora('07:30'))).toBeNull()
  })
  it('programado para hoy: el conteo empieza al abrir hoy, no ayer', () => {
    const programado = pedido({ fechaEntrega: new Date('2026-11-13T00:00:00-05:00') })
    expect(riesgo(programado, hora('07:29'))).toBeNull()
    expect(riesgo(programado, hora('07:30'))?.minutosHabiles).toBe(120)
  })
  it('se usa createdAt y no la fecha operativa, sin falsos positivos por desfase', () => {
    const nuevo = pedido({ createdAt: hora('07:00') })
    expect(riesgo(nuevo, hora('07:30'))).toBeNull()
  })
  it('entrega parcial es gestión documentada: sin alarma desde su creación', () => {
    const parcial = pedido({ items: [{ cantEntrega: 3, cantRegaloEntrega: 0 }] })
    expect(elegibleRiesgoOperativo(parcial, hora('07:30'))).toBe(false)
    expect(riesgo(parcial, hora('07:30'))).toBeNull()
    const legacy = pedido({ items: [], cPacaAguaEnt: 1 })
    expect(riesgo(legacy, hora('07:30'))).toBeNull()
    const regalo = pedido({ items: [{ cantEntrega: 0, cantRegaloEntrega: 1 }] })
    expect(riesgo(regalo, hora('07:30'))).toBeNull()
  })
  it.each(['ENTREGADO', 'ANULADO', 'CANCELADO'])('%s no dispara señales', estadoEntrega => {
    expect(riesgo(pedido({ estadoEntrega }), hora('07:30'))).toBeNull()
  })
  it('asignado sin salir no es un pedido sin gestionar', () => {
    expect(riesgo(pedido({ embarqueId: 'emb1' }), hora('07:30'))).toBeNull()
  })
  it('NO_ENTREGADO y EN_RUTA tienen etiquetas que no atribuyen ausencia de gestión', () => {
    expect(riesgo(pedido({ estadoEntrega: 'NO_ENTREGADO' }), hora('07:30'))?.tipo).toBe('sin_reasignar')
    expect(riesgo(pedido({ estadoEntrega: 'EN_RUTA', embarqueId: 'emb1' }), hora('07:30'))?.tipo).toBe('en_ruta')
    expect(textoRiesgoOperativo(riesgo(pedido({ estadoEntrega: 'NO_ENTREGADO' }), hora('07:30'))!)).toBe('Sin reasignar · revisar')
  })
  it('un reloj inválido, futuro o configuración inválida no genera falsas alarmas', () => {
    expect(riesgo(pedido({ createdAt: new Date('invalid') }), hora('07:30'))).toBeNull()
    expect(riesgo(pedido({ createdAt: hora('09:00') }), hora('07:30'))).toBeNull()
    expect(riesgo(pedido(), hora('07:30'), 0)).toBeNull()
    expect(riesgo(pedido(), hora('07:30'), Number.NaN)).toBeNull()
  })
  it('etiqueta la causa de riesgo por ciclos sin inventar duración', () => {
    expect(textoRiesgoOperativo(riesgo(pedido(), hora('07:30'))!))
      .toBe('Sin gestionar · 2 h hábiles')
    expect(textoRiesgoOperativo(riesgoPorEmbarques(pedido())))
      .toBe('Sin asignar · revisar')
  })
})
