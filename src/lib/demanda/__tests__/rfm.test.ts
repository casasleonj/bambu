// @tests rfm — Bloque 3 (predicción de demanda)

import { describe, it, expect } from 'vitest'
import { calcularIntervaloMediano, calcularFrecuenciaCliente } from '../rfm'

describe('calcularIntervaloMediano', () => {
  it('0 pedidos → null', () => {
    expect(calcularIntervaloMediano([])).toBeNull()
  })

  it('1 pedido → null (no hay intervalo)', () => {
    expect(calcularIntervaloMediano([new Date('2024-01-01')])).toBeNull()
  })

  it('2 pedidos a 7 días exactos → 7', () => {
    const r = calcularIntervaloMediano([
      new Date('2024-01-01'),
      new Date('2024-01-08'),
    ])
    expect(r).toBe(7)
  })

  it('5 pedidos a 7±0 días → 7', () => {
    const fechas = [
      new Date('2024-01-01'),
      new Date('2024-01-08'),
      new Date('2024-01-15'),
      new Date('2024-01-22'),
      new Date('2024-01-29'),
    ]
    expect(calcularIntervaloMediano(fechas)).toBe(7)
  })

  it('5 pedidos a 7±2 días → 7 (mediana robusta)', () => {
    const fechas = [
      new Date('2024-01-01'),
      new Date('2024-01-09'), // 8
      new Date('2024-01-16'), // 7
      new Date('2024-01-23'), // 7
      new Date('2024-01-30'), // 7
    ]
    // intervalos: 8, 7, 7, 7 → mediana 7
    expect(calcularIntervaloMediano(fechas)).toBe(7)
  })

  it('12 pedidos a 7 días + 1 outlier de 90 días → mediana 7 (no se rompe)', () => {
    const fechas: Date[] = []
    for (let i = 0; i < 12; i++) {
      fechas.push(new Date(`2024-01-${(i * 7 + 1).toString().padStart(2, '0')}`))
    }
    // Insertar outlier entre el 6 y el 7
    fechas.push(new Date('2024-04-15')) // outlier de ~90 días
    expect(calcularIntervaloMediano(fechas)).toBe(7)
  })

  it('acepta strings ISO y devuelve Date', () => {
    const r = calcularIntervaloMediano(['2024-01-01', '2024-01-08'])
    expect(r).toBe(7)
  })

  it('filtra intervalos <1 día (mismo día, error de tipeo)', () => {
    const fechas = [
      new Date('2024-01-01T08:00:00'),
      new Date('2024-01-01T20:00:00'), // mismo día, 0.5 días
      new Date('2024-01-08T08:00:00'), // 7 días del primero
    ]
    // El intervalo <1 día se filtra. Quedan 1 intervalo: 7 días.
    expect(calcularIntervaloMediano(fechas)).toBe(7)
  })

  it('incluye intervalos = 365 días (límite, no filtra)', () => {
    // 365 días exactos es el límite: pasa. >365 no.
    // Con 2 intervalos [365, 7], la mediana es 186 — eso es comportamiento correcto.
    const fechas = [
      new Date('2023-01-01'),
      new Date('2024-01-01'), // 365 días
      new Date('2024-01-08'), // 7 días del anterior
    ]
    expect(calcularIntervaloMediano(fechas)).toBe(186)
  })
})

describe('calcularFrecuenciaCliente', () => {
  it('0 pedidos → nulls + atraso 0', () => {
    const r = calcularFrecuenciaCliente([])
    expect(r.ultEntrega).toBeNull()
    expect(r.intervaloMediano).toBeNull()
    expect(r.proxEsperada).toBeNull()
    expect(r.diasAtraso).toBe(0)
  })

  it('último pedido hace 5 días, intervalo 7 → diasAtraso = -2 (no debe aún)', () => {
    const ahora = new Date('2024-06-01')
    const fechas = [
      new Date('2024-05-27'), // 5 días atrás
      new Date('2024-05-20'),
      new Date('2024-05-13'),
    ]
    const r = calcularFrecuenciaCliente(fechas, ahora)
    expect(r.intervaloMediano).toBe(7)
    expect(r.diasAtraso).toBe(-2)
  })

  it('último pedido hace 11 días, intervalo 7 → diasAtraso = 4 (llamar)', () => {
    const ahora = new Date('2024-06-01')
    const fechas = [
      new Date('2024-05-21'), // 11 días atrás
      new Date('2024-05-14'),
      new Date('2024-05-07'),
    ]
    const r = calcularFrecuenciaCliente(fechas, ahora)
    expect(r.diasAtraso).toBe(4)
  })

  it('último pedido hace 1 día, intervalo 30 → diasAtraso = -29', () => {
    const ahora = new Date('2024-06-01')
    const fechas = [
      new Date('2024-05-31'),
      new Date('2024-05-01'),
      new Date('2024-04-01'),
    ]
    const r = calcularFrecuenciaCliente(fechas, ahora)
    expect(r.diasAtraso).toBe(-29)
  })
})
