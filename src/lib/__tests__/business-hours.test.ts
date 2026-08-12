import { describe, it, expect } from 'vitest'
import { minutosHabilesTranscurridos, horasHabilesTranscurridas, type Turno } from '../business-hours'

const TURNOS: Turno[] = [
  { inicio: '06:00', fin: '12:00' },
  { inicio: '14:00', fin: '17:00' },
]

function bogota(hhmm: string, dateStr = '2026-08-12'): Date {
  return new Date(`${dateStr}T${hhmm}:00-05:00`)
}

describe('minutosHabilesTranscurridos', () => {
  it('0 si hasta <= desde', () => {
    expect(minutosHabilesTranscurridos(bogota('10:00'), bogota('09:00'), TURNOS)).toBe(0)
    expect(minutosHabilesTranscurridos(bogota('10:00'), bogota('10:00'), TURNOS)).toBe(0)
  })

  it('0 si no hay turnos configurados', () => {
    expect(minutosHabilesTranscurridos(bogota('06:00'), bogota('12:00'), [])).toBe(0)
  })

  it('cuenta minutos dentro de un solo turno', () => {
    expect(minutosHabilesTranscurridos(bogota('06:00'), bogota('07:30'), TURNOS)).toBe(90)
  })

  it('salta la hora de almuerzo (12-2pm no cuenta)', () => {
    // 11:00 -> 15:00: 1h de mañana (11-12) + 1h de tarde (14-15) = 2h, sin contar 12-14
    expect(minutosHabilesTranscurridos(bogota('11:00'), bogota('15:00'), TURNOS)).toBe(120)
  })

  it('ejemplo del reporte: pedido de las 6am, ahora son las 4:40pm', () => {
    // 6:00-12:00 = 360min, 14:00-16:40 = 160min => 520min = 8.67h
    const minutos = minutosHabilesTranscurridos(bogota('06:00'), bogota('16:40'), TURNOS)
    expect(minutos).toBe(520)
    expect(horasHabilesTranscurridas(bogota('06:00'), bogota('16:40'), TURNOS)).toBeCloseTo(520 / 60)
  })

  it('pedido creado antes de abrir: el reloj empieza a las 6am, no antes', () => {
    // Creado 5:00am, ahora 6:30am -> solo cuenta 6:00-6:30 = 30min
    expect(minutosHabilesTranscurridos(bogota('05:00'), bogota('06:30'), TURNOS)).toBe(30)
  })

  it('pedido creado después de cerrar: no acumula hasta el turno del día siguiente', () => {
    // Creado 6:00pm, "ahora" 7:00pm mismo día -> 0 (fuera de ambos turnos)
    expect(minutosHabilesTranscurridos(bogota('18:00'), bogota('19:00'), TURNOS)).toBe(0)
  })

  it('pedido de un día anterior sigue acumulando al día siguiente', () => {
    // Creado ayer 16:00 (1h del turno tarde: 16-17), hoy hasta las 07:00 (1h del turno mañana: 6-7)
    const desde = bogota('16:00', '2026-08-11')
    const hasta = bogota('07:00', '2026-08-12')
    expect(minutosHabilesTranscurridos(desde, hasta, TURNOS)).toBe(120)
  })

  it('cubre completamente ambos turnos de un día', () => {
    const desde = bogota('00:00')
    const hasta = bogota('23:59')
    // 6h (mañana) + 3h (tarde) = 9h = 540min
    expect(minutosHabilesTranscurridos(desde, hasta, TURNOS)).toBe(540)
  })
})
