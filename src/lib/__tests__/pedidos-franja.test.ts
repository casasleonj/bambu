// @tests #836 F2b: franjas «Ya toca / Normales / Más tarde» por tiempo restante, con el reloj inyectado.
import { describe, it, expect } from 'vitest'
import { clasificarFranja, ordenarPorFranja, minutosDelDiaBogota, textoTiempoRestante, esHoraValida, YA_TOCA_MIN, MAS_TARDE_MIN } from '../pedidos-franja'

// 2026-11-18 a las H:MM de Bogotá (UTC-5)
const bog = (hhmm: string, dia = '2026-11-18') => new Date(`${dia}T${hhmm}:00-05:00`)
const p = (hora: string | null, extra: Partial<{ estadoEntrega: string; fechaEntrega: Date | null }> = {}) => ({
  estadoEntrega: 'PENDIENTE', fechaEntrega: bog('12:00'), entregaNoAntesDe: hora, ...extra,
})

describe('minutosDelDiaBogota', () => {
  it('usa la hora de Bogotá, no la UTC', () => {
    expect(minutosDelDiaBogota(new Date('2026-11-18T11:10:00Z'))).toBe(6 * 60 + 10)
    expect(minutosDelDiaBogota(new Date('2026-11-18T04:59:00Z'))).toBe(23 * 60 + 59) // 23:59 del día anterior en Bogotá
  })
})

describe('clasificarFranja', () => {
  it('límites: ≤60 min = ya toca; 61–180 = normal; >180 = más tarde', () => {
    expect(YA_TOCA_MIN).toBe(60); expect(MAS_TARDE_MIN).toBe(180)
    const ahora = bog('06:10')
    expect(clasificarFranja(p('07:10'), ahora)).toEqual({ franja: 'ya_toca', minutosFaltantes: 60 })
    expect(clasificarFranja(p('07:11'), ahora).franja).toBe('normal')
    expect(clasificarFranja(p('09:10'), ahora)).toEqual({ franja: 'normal', minutosFaltantes: 180 })
    expect(clasificarFranja(p('09:11'), ahora).franja).toBe('mas_tarde')
  })
  it('hora llegada o pasada y pendiente → ya toca (negativo)', () => {
    expect(clasificarFranja(p('06:00'), bog('06:10'))).toEqual({ franja: 'ya_toca', minutosFaltantes: -10 })
  })
  it('sin hora, otro día, cerrado o sin fecha → normal y sin minutos (no se afirma nada)', () => {
    const ahora = bog('06:10')
    expect(clasificarFranja(p(null), ahora)).toEqual({ franja: 'normal', minutosFaltantes: null })
    expect(clasificarFranja(p('16:00', { fechaEntrega: bog('12:00', '2026-11-19') }), ahora).franja).toBe('normal') // mañana
    expect(clasificarFranja(p('16:00', { fechaEntrega: bog('12:00', '2026-11-17') }), ahora).minutosFaltantes).toBeNull() // arrastrado
    expect(clasificarFranja(p('16:00', { estadoEntrega: 'ENTREGADO' }), ahora).minutosFaltantes).toBeNull()
    expect(clasificarFranja(p('16:00', { fechaEntrega: null }), ahora).minutosFaltantes).toBeNull()
  })
  it('hora mal formada se ignora', () => {
    expect(clasificarFranja(p('25:00'), bog('06:10')).minutosFaltantes).toBeNull()
    expect(esHoraValida('06:00')).toBe(true); expect(esHoraValida('6:00')).toBe(false); expect(esHoraValida(null)).toBe(false)
  })
  it('el día se compara por Bogotá: 2026-11-19T03:00Z es 22:00 del 18 en Bogotá, o sea hoy', () => {
    expect(clasificarFranja(p('23:30', { fechaEntrega: new Date('2026-11-19T03:00:00Z') }), bog('23:00'))).toEqual({ franja: 'ya_toca', minutosFaltantes: 30 })
    expect(clasificarFranja(p('23:30', { fechaEntrega: new Date('2026-11-19T06:00:00Z') }), bog('23:00')).minutosFaltantes).toBeNull() // 01:00 del 19: mañana
  })
})

describe('ordenarPorFranja', () => {
  const ped = (id: string, hora: string | null) => ({ id, ...p(hora) })
  const ids = (a: Array<{ id: string }>) => a.map((x) => x.id)
  it('6:10: ya toca arriba, normales (sin hora y 1–3 h), más tarde al final', () => {
    const lista = [ped('sh1', null), ped('t16', '16:00'), ped('a0630', '06:30'), ped('sh2', null), ped('t0800', '08:00'), ped('t1730', '17:30')]
    expect(ids(ordenarPorFranja(lista, bog('06:10'), (x) => x))).toEqual(['a0630', 'sh1', 'sh2', 't0800', 't16', 't1730'])
  })
  it('conforme avanza el reloj, el de las 16:00 sube', () => {
    const lista = [ped('sh', null), ped('t16', '16:00'), ped('t1730', '17:30')]
    expect(ids(ordenarPorFranja(lista, bog('06:10'), (x) => x))).toEqual(['sh', 't16', 't1730'])
    expect(ids(ordenarPorFranja(lista, bog('14:30'), (x) => x))).toEqual(['sh', 't16', 't1730']) // t16 normal (90 min), t1730 normal (180)
    expect(ids(ordenarPorFranja(lista, bog('15:20'), (x) => x))).toEqual(['t16', 'sh', 't1730']) // t16 ya toca → primero
  })
  it('estable: sin horas conserva el orden de entrada y no muta la entrada', () => {
    const lista = [ped('c', null), ped('a', null), ped('b', null)]
    const copia = [...lista]
    expect(ids(ordenarPorFranja(lista, bog('06:10'), (x) => x))).toEqual(['c', 'a', 'b'])
    expect(lista).toEqual(copia)
  })
  it('lista vacía y adjunta la franja a cada elemento', () => {
    expect(ordenarPorFranja([], bog('06:10'), (x) => x as never)).toEqual([])
    expect(ordenarPorFranja([ped('x', '06:30')], bog('06:10'), (x) => x)[0]._franja).toEqual({ franja: 'ya_toca', minutosFaltantes: 20 })
  })
})

describe('textoTiempoRestante', () => {
  it('formatea', () => {
    expect(textoTiempoRestante(null)).toBeNull()
    expect(textoTiempoRestante(20)).toBe('En 20 min')
    expect(textoTiempoRestante(110)).toBe('En 1 h 50 min')
    expect(textoTiempoRestante(590)).toBe('Faltan 9 h 50 min')
    expect(textoTiempoRestante(0)).toBe('Ya es la hora')
    expect(textoTiempoRestante(-10)).toBe('Hora pasada hace 10 min')
  })
})
