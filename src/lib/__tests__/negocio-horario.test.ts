import { describe, it, expect } from 'vitest'
import {
  validarHorario, estadoDia, negocioCerradoEseDia, resumenHorario, diaSemanaDeFecha, normalizarHorario,
} from '@/lib/negocio-horario'

const partido = (d: number) => [{ diaSemana: d, desde: '06:00', hasta: '12:00' }, { diaSemana: d, desde: '14:00', hasta: '20:00' }]
const lunAVie = [1, 2, 3, 4, 5].flatMap(partido)
const sab = [{ diaSemana: 6, desde: '06:00', hasta: '13:00' }]

describe('validarHorario (#836 F2)', () => {
  it('acepta turnos partidos y días sin tramos', () => {
    expect(validarHorario([...lunAVie, ...sab])).toEqual([])
    expect(validarHorario([])).toEqual([])
  })
  it('rechaza un tramo que termina antes de empezar, con el mensaje del diseño', () => {
    const e = validarHorario([{ diaSemana: 1, desde: '14:00', hasta: '12:00' }])
    expect(e[0]).toMatch(/Lunes: el tramo 14:00–12:00 termina antes de empezar/)
  })
  it('rechaza horas inválidas, días inexistentes, cruces y más de 4 tramos', () => {
    expect(validarHorario([{ diaSemana: 1, desde: '25:00', hasta: '26:00' }])[0]).toMatch(/horas válidas/)
    expect(validarHorario([{ diaSemana: 9, desde: '06:00', hasta: '07:00' }])[0]).toMatch(/día que no existe/)
    expect(validarHorario([{ diaSemana: 2, desde: '06:00', hasta: '12:00' }, { diaSemana: 2, desde: '11:00', hasta: '15:00' }])[0]).toMatch(/Martes: .* se cruzan/)
    const cinco = [0, 1, 2, 3, 4].map((i) => ({ diaSemana: 3, desde: `0${i}:00`, hasta: `0${i}:30` }))
    expect(validarHorario(cinco).join(' ')).toMatch(/máximo 4 tramos/)
  })
  it('tramos pegados (12:00 con 12:00) no se cruzan', () => {
    expect(validarHorario([{ diaSemana: 1, desde: '06:00', hasta: '12:00' }, { diaSemana: 1, desde: '12:00', hasta: '18:00' }])).toEqual([])
  })
})

describe('estado del día y «negocio cerrado ese día» (A09, A11, A29)', () => {
  const h = [...lunAVie, ...sab]
  it('sin horario configurado NO afirma que esté cerrado', () => {
    expect(estadoDia([], 0)).toBe('sin_horario')
    expect(estadoDia(null, 3)).toBe('sin_horario')
    expect(negocioCerradoEseDia([], '2026-11-22T17:00:00Z')).toBe(false)
  })
  it('con horario, un día sin tramos está cerrado y uno con tramos abierto', () => {
    expect(estadoDia(h, 0)).toBe('cerrado')
    expect(estadoDia(h, 6)).toBe('abierto')
  })
  it('usa el día de BOGOTÁ, no el de UTC (A27)', () => {
    // 2026-11-23 es lunes; 03:00 UTC del lunes es domingo 22:00 en Bogotá
    expect(diaSemanaDeFecha('2026-11-23')).toBe(1)
    expect(negocioCerradoEseDia(h, '2026-11-23T03:00:00Z')).toBe(true) // domingo en Bogotá → cerrado
    expect(negocioCerradoEseDia(h, '2026-11-23T15:00:00Z')).toBe(false) // lunes → abierto
  })
  it('fecha vacía → no hay aviso', () => {
    expect(negocioCerradoEseDia(h, null)).toBe(false)
  })
})

describe('resumenHorario', () => {
  it('agrupa días consecutivos iguales y dice «cerrado»', () => {
    expect(resumenHorario([...lunAVie, ...sab])).toEqual(['Lun–Vie 06:00–12:00 y 14:00–20:00', 'Sáb 06:00–13:00', 'Dom cerrado'])
  })
  it('sin horario → sin líneas', () => {
    expect(resumenHorario([])).toEqual([])
  })
  it('normalizarHorario ordena por día y hora', () => {
    const o = normalizarHorario([{ diaSemana: 2, desde: '14:00', hasta: '15:00' }, { diaSemana: 1, desde: '08:00', hasta: '09:00' }, { diaSemana: 2, desde: '06:00', hasta: '07:00' }])
    expect(o.map((t) => `${t.diaSemana}${t.desde}`)).toEqual(['108:00', '206:00', '214:00'])
  })
})
