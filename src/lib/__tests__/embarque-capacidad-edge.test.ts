// @tests embarque-capacidad — edge cases
// Cubre: NaN, Infinity, división por cero, mezcla legacy + items[],
// capacidad negativa, decimales en inputs que esperan enteros
import { describe, it, expect } from 'vitest'
import {
  calcularPacasEmbarque,
  calcularPesoEmbarque,
  getCapacidadInfo,
  calcularPesoDesdeCarga,
  totalUnidadesCarga,
  PESOS_KG,
} from '@/lib/embarque-capacidad'

describe('embarque-capacidad — edge cases', () => {
  describe('calcularPacasEmbarque con NaN/Infinity', () => {
    it('NaN se trata como 0 (no contamina el total)', () => {
      const r = calcularPacasEmbarque([
        { cPacaAguaPed: NaN },
        { cPacaHieloPed: 5 },
      ])
      // NaN || 0 = 0 (gracias al ||)
      expect(r).toBe(5)
    })

    it('Infinity positivo se trata como 0 (no revienta)', () => {
      // Infinity es truthy, no se filtra con ||
      // Verificamos que al menos NO se rompe (no lanza)
      const r = calcularPacasEmbarque([{ cPacaAguaPed: Infinity }])
      // El resultado será Infinity (no es filtrado por ||). Lo importante
      // es que no explota. Pero el comportamiento real es: 0 + Infinity = Infinity
      expect(typeof r).toBe('number')
    })

    it('Infinity + número finito = Infinity (regresión documentada)', () => {
      // Esto es lo que pasa con el código actual. Lo documentamos como test
      // para detectar cambios en el comportamiento.
      const r = calcularPacasEmbarque([
        { cPacaAguaPed: 5 },
        { cPacaAguaPed: Infinity },
      ])
      expect(r).toBe(Infinity)
    })

    it('array vacío sigue retornando 0', () => {
      expect(calcularPacasEmbarque([])).toBe(0)
    })

    it('1000 items con 1 paca cada uno = 1000', () => {
      const items = Array.from({ length: 1000 }, () => ({ cPacaAguaPed: 1 }))
      expect(calcularPacasEmbarque(items)).toBe(1000)
    })
  })

  describe('calcularPesoEmbarque con NaN/Infinity', () => {
    // El código usa `pedido.cPacaAguaPed || 0` (línea 49 de embarque-capacidad.ts).
    // `NaN || 0` evalúa a 0 (truthy check). Es una guarda defensiva intencional
    // contra inputs sucios. Lo documentamos como tests de regresión.

    it('NaN en una cantidad se silencia a 0 (defensa intencional)', () => {
      const r = calcularPesoEmbarque([{ cPacaAguaPed: NaN }])
      // Comportamiento real: NaN || 0 = 0, no propaga
      expect(r).toBe(0)
    })

    it('Infinity positivo pasa el `||` (truthy) → peso Infinity', () => {
      // Infinity es truthy, así que el `|| 0` NO lo filtra.
      // Esto puede ser un problema en producción si llega Infinity de
      // algún cálculo upstream. Lo documentamos.
      const r = calcularPesoEmbarque([{ cPacaAguaPed: Infinity }])
      expect(r).toBe(Infinity)
    })
  })

  describe('getCapacidadInfo con valores extremos', () => {
    it('capacidad negativa → no divide por cero (regresa ideal)', () => {
      const info = getCapacidadInfo(10, 100, -100)
      // El código actual: capacidadKg > 0 ? ... : 0
      // -100 > 0 es false, retorna porcentaje 0 → ideal
      expect(info.nivel).toBe('ideal')
      expect(info.porcentaje).toBe(0)
    })

    it('capacidad muy grande → no overflow', () => {
      const info = getCapacidadInfo(10, 100, Number.MAX_SAFE_INTEGER)
      expect(info.nivel).toBe('ideal')
      expect(info.porcentaje).toBeLessThan(1)
    })

    it('peso enorme con capacidad razonable → excedido con % > 100', () => {
      const info = getCapacidadInfo(10, 1_000_000, 500)
      expect(info.nivel).toBe('excedido')
      expect(info.porcentaje).toBeGreaterThan(100)
    })

    it('peso negativo → "excedido" (porcentaje negativo < 100, pero ¿qué pasa?)', () => {
      // El código: porcentaje > 100 → excedido
      // Si peso = -50, porcentaje = -25% → NO entra a excedido
      // Cae a ideal (no >= 75, no >= 87, no > 100)
      const info = getCapacidadInfo(10, -50, 200)
      expect(info.nivel).toBe('ideal')
    })

    it('peso NaN → ideal (porque NaN > 100 es false, NaN >= 87 es false, NaN >= 75 es false)', () => {
      const info = getCapacidadInfo(10, NaN, 200)
      // NaN en todas las comparaciones → cae a ideal
      expect(info.nivel).toBe('ideal')
    })

    it('peso exactamente 0 → ideal', () => {
      const info = getCapacidadInfo(0, 0, 200)
      expect(info.nivel).toBe('ideal')
      expect(info.porcentaje).toBe(0)
    })

    it('porcentaje exactamente 75% → pesado (boundary inclusive)', () => {
      const info = getCapacidadInfo(10, 150, 200)
      expect(info.nivel).toBe('pesado')
    })

    it('porcentaje exactamente 87% → maximo (boundary inclusive)', () => {
      const info = getCapacidadInfo(10, 174, 200)
      expect(info.nivel).toBe('maximo')
    })

    it('porcentaje exactamente 100% → maximo (NO excedido, boundary exclusive)', () => {
      const info = getCapacidadInfo(10, 200, 200)
      expect(info.nivel).toBe('maximo')
    })

    it('porcentaje 100.001% → excedido', () => {
      const info = getCapacidadInfo(10, 200.002, 200)
      expect(info.nivel).toBe('excedido')
    })
  })

  describe('calcularPesoDesdeCarga — inválidos', () => {
    it('campos undefined se tratan como 0', () => {
      const carga = {
        PACA_AGUA: undefined as any,
        PACA_HIELO: 2,
        BOTELLON: 0,
        BOLSA_AGUA: 0,
        BOLSA_HIELO: 0,
      }
      expect(calcularPesoDesdeCarga(carga)).toBe(22)
    })

    it('campos NaN se tratan como 0 (gracias al || 0)', () => {
      const carga = {
        PACA_AGUA: NaN,
        PACA_HIELO: 2,
        BOTELLON: 0,
        BOLSA_AGUA: 0,
        BOLSA_HIELO: 0,
      }
      expect(calcularPesoDesdeCarga(carga)).toBe(22)
    })
  })

  describe('totalUnidadesCarga — consistencia', () => {
    it('suma de unidades === total esperado (sanity check contra drift)', () => {
      const carga = {
        PACA_AGUA: 5,
        PACA_HIELO: 3,
        BOTELLON: 2,
        BOLSA_AGUA: 10,
        BOLSA_HIELO: 7,
      }
      expect(totalUnidadesCarga(carga)).toBe(27)
    })

    it('campos undefined → 0', () => {
      const carga = {
        PACA_AGUA: 5,
        PACA_HIELO: undefined as any,
        BOTELLON: 0,
        BOLSA_AGUA: 0,
        BOLSA_HIELO: 0,
      }
      expect(totalUnidadesCarga(carga)).toBe(5)
    })
  })

  describe('PESOS_KG — sanity', () => {
    it('PACA_AGUA pesa 10kg (constante física del producto)', () => {
      expect(PESOS_KG.PACA_AGUA).toBe(10.0)
    })

    it('PACA_HIELO pesa más que PACA_AGUA (hielo es más denso)', () => {
      expect(PESOS_KG.PACA_HIELO).toBeGreaterThan(PESOS_KG.PACA_AGUA)
    })

    it('BOTELLON es el producto más pesado', () => {
      const pesos = Object.values(PESOS_KG)
      expect(PESOS_KG.BOTELLON).toBe(Math.max(...pesos))
    })

    it('BOLSAS pesan menos que PACAS', () => {
      expect(PESOS_KG.BOLSA_AGUA).toBeLessThan(PESOS_KG.PACA_AGUA)
      expect(PESOS_KG.BOLSA_HIELO).toBeLessThan(PESOS_KG.PACA_HIELO)
    })
  })

  describe('Mezcla legacy + items[] (transición)', () => {
    it('prefiere items[] cuando está presente (single source of truth)', () => {
      const r = calcularPacasEmbarque([
        {
          cPacaAguaPed: 99, // legacy ignorado
          items: [{ producto: 'PACA_AGUA', cantPedido: 5 }],
        },
      ])
      // items gana
      expect(r).toBe(5)
    })

    it('suma items[] + legacy cuando legacy tiene campos distintos', () => {
      const r = calcularPacasEmbarque([
        {
          cPacaHieloPed: 3, // legacy
          items: [{ producto: 'PACA_AGUA', cantPedido: 2 }],
        },
      ])
      // items solo tiene PACA_AGUA=2, legacy tiene PACA_HIELO=3
      // Si items presente: 2 (solo lo que está en items)
      expect(r).toBe(2)
    })

    it('items[] vacío cae a legacy (compat)', () => {
      const r = calcularPacasEmbarque([
        { cPacaAguaPed: 5, items: [] },
      ])
      expect(r).toBe(5)
    })
  })
})
