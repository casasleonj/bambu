// @tests lib/comisiones.ts — vector: cálculo de dinero
// Cubre: calcComSellador y calcComRepartidor
// Por qué: una comisión mal calculada se paga en nóminas; un error de redondeo
// se acumula mes a mes. Es el cálculo más caro de equivocarse en una
// empresa de distribución.
import { describe, it, expect } from 'vitest'
import { calcComSellador, calcComRepartidor } from '@/lib/comisiones'
import type { Trabajador } from '@prisma/client'

// Helpers para fabricar un Trabajador mínimo (solo los campos que la
// función usa). Si añadimos un campo nuevo a la función, este cast
// seguirá funcionando porque Trabajador del Prisma client tiene defaults.
function makeTrabajador(overrides: Partial<Trabajador> = {}): Trabajador {
  return {
    id: 't1',
    createdById: null,
    userId: null,
    nombre: 'Test',
    rol: 'SELLADOR',
    tipoPago: 'COMISION' as Trabajador['tipoPago'],
    usaMoto: false,
    capacidadKg: 500,
    comPacaAgua: 200 as unknown as Trabajador['comPacaAgua'],
    comPacaHielo: 200 as unknown as Trabajador['comPacaHielo'],
    comBotellon: 0 as unknown as Trabajador['comBotellon'],
    comRepartAgua: 0 as unknown as Trabajador['comRepartAgua'],
    comRepartHielo: 0 as unknown as Trabajador['comRepartHielo'],
    comRepartBotellon: 0 as unknown as Trabajador['comRepartBotellon'],
    salarioFijo: 0 as unknown as Trabajador['salarioFijo'],
    deudaReposAgua: 0 as unknown as Trabajador['deudaReposAgua'],
    deudaReposHielo: 0 as unknown as Trabajador['deudaReposHielo'],
    telefono: null,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Trabajador
}

describe('calcComSellador', () => {
  it('retorna 0 cuando no hay producción', () => {
    const t = makeTrabajador()
    const r = calcComSellador(0, 0, t)
    expect(r).toEqual({ comAgua: 0, comHielo: 0, total: 0 })
  })

  it('multiplica pacas de agua por comPacaAgua', () => {
    const t = makeTrabajador({ comPacaAgua: 250 as any })
    const r = calcComSellador(10, 0, t)
    expect(r.comAgua).toBe(2500)
    expect(r.comHielo).toBe(0)
    expect(r.total).toBe(2500)
  })

  it('multiplica pacas de hielo por comPacaHielo', () => {
    const t = makeTrabajador({ comPacaHielo: 300 as any })
    const r = calcComSellador(0, 5, t)
    expect(r.comAgua).toBe(0)
    expect(r.comHielo).toBe(1500)
    expect(r.total).toBe(1500)
  })

  it('suma agua + hielo independientemente', () => {
    const t = makeTrabajador({
      comPacaAgua: 200 as any,
      comPacaHielo: 250 as any,
    })
    const r = calcComSellador(7, 4, t)
    expect(r.comAgua).toBe(1400)
    expect(r.comHielo).toBe(1000)
    expect(r.total).toBe(2400)
  })

  it('tolera producción negativa (devoluciones) sin explotar', () => {
    const t = makeTrabajador({ comPacaAgua: 200 as any })
    const r = calcComSellador(5, 0, t)
    expect(r.comAgua).toBe(1000)
    // Función no valida — solo verifica que la multiplicación funcione
    const r2 = calcComSellador(-2, -1, t)
    expect(r2.comAgua).toBe(-400)
    expect(r2.comHielo).toBe(-200)
  })

  it('maneja comisión cero explícita', () => {
    const t = makeTrabajador({
      comPacaAgua: 0 as any,
      comPacaHielo: 0 as any,
    })
    const r = calcComSellador(100, 50, t)
    expect(r.total).toBe(0)
  })

  it('preserva precisión para producción grande (1000 pacas)', () => {
    const t = makeTrabajador({ comPacaAgua: 350.5 as any })
    const r = calcComSellador(1000, 1000, t)
    // 1000 * 350.5 = 350500
    expect(r.comAgua).toBe(350500)
    // 1000 * 200 = 200000 (default)
    expect(r.comHielo).toBe(200000)
    expect(r.total).toBe(550500)
  })
})

describe('calcComRepartidor', () => {
  it('retorna 0 cuando no hay repartidores con moto', () => {
    const r = calcComRepartidor(50, 30, [
      makeTrabajador({ usaMoto: false, comRepartAgua: 100 as any }),
    ])
    expect(r).toEqual({ comAgua: 0, comHielo: 0, total: 0 })
  })

  it('retorna 0 cuando la lista está vacía', () => {
    const r = calcComRepartidor(10, 5, [])
    expect(r.total).toBe(0)
  })

  it('usa comRepartAgua si está presente, sino fallback a comPacaAgua', () => {
    const t = makeTrabajador({
      usaMoto: true,
      comRepartAgua: 150 as any,
      comPacaAgua: 200 as any, // no debe usarse
    })
    const r = calcComRepartidor(10, 0, [t])
    // 10 ventas * 150 = 1500
    expect(r.comAgua).toBe(1500)
  })

  it('hace fallback a comPacaAgua cuando comRepartAgua es 0 (truthy check)', () => {
    // comRepartAgua = 0 → Number(0 || 200) = 200 (código actual usa ||)
    const t = makeTrabajador({
      usaMoto: true,
      comRepartAgua: 0 as any,
      comPacaAgua: 200 as any,
    })
    const r = calcComRepartidor(5, 0, [t])
    // 5 * 200 = 1000 (fallback al comPacaAgua)
    expect(r.comAgua).toBe(1000)
  })

  it('promedia comisiones entre repartidores activos con moto', () => {
    const t1 = makeTrabajador({
      id: 'r1',
      usaMoto: true,
      comRepartAgua: 100 as any,
    })
    const t2 = makeTrabajador({
      id: 'r2',
      usaMoto: true,
      comRepartAgua: 200 as any,
    })
    // Promedio = (100 + 200) / 2 = 150
    // 20 ventas * 150 = 3000
    const r = calcComRepartidor(20, 0, [t1, t2])
    expect(r.comAgua).toBe(3000)
  })

  it('ignora repartidores sin moto del promedio', () => {
    const moto = makeTrabajador({
      id: 'r1',
      usaMoto: true,
      comRepartAgua: 100 as any,
    })
    const sinMoto = makeTrabajador({
      id: 'r2',
      usaMoto: false,
      comRepartAgua: 500 as any, // no debe contar
    })
    // Solo el primero cuenta: promedio = 100
    const r = calcComRepartidor(10, 0, [moto, sinMoto])
    expect(r.comAgua).toBe(1000)
  })

  it('calcula total = comAgua + comHielo', () => {
    const t = makeTrabajador({
      usaMoto: true,
      comRepartAgua: 100 as any,
      comRepartHielo: 150 as any,
    })
    const r = calcComRepartidor(10, 5, [t])
    expect(r.comAgua).toBe(1000)
    expect(r.comHielo).toBe(750)
    expect(r.total).toBe(1750)
  })

  it('maneja ventas cero (retorna 0 total)', () => {
    const t = makeTrabajador({
      usaMoto: true,
      comRepartAgua: 500 as any,
    })
    const r = calcComRepartidor(0, 0, [t])
    expect(r).toEqual({ comAgua: 0, comHielo: 0, total: 0 })
  })
})
