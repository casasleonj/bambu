import { describe, it, expect } from 'vitest'
import {
  METODOS_REQUIEREN_CONFIRMACION_DEFAULT,
  parseMetodosRequierenConfirmacion,
  confirmacionInicial,
  datosConfirmacionInicial,
} from '@/lib/pago-confirmacion'

describe('pago-confirmacion — ADR-PAGO-REPORTADO-CONFIRMADO-001', () => {
  describe('confirmacionInicial (default = tabla del ADR §2)', () => {
    it('NEQUI / TRANSFERENCIA / DAVIPLATA → REPORTADO', () => {
      expect(confirmacionInicial('NEQUI')).toBe('REPORTADO')
      expect(confirmacionInicial('TRANSFERENCIA')).toBe('REPORTADO')
      expect(confirmacionInicial('DAVIPLATA')).toBe('REPORTADO')
    })

    it('EFECTIVO / BONO → CONFIRMADO', () => {
      expect(confirmacionInicial('EFECTIVO')).toBe('CONFIRMADO')
      expect(confirmacionInicial('BONO')).toBe('CONFIRMADO')
    })

    it('es case-insensitive en el método', () => {
      expect(confirmacionInicial('nequi')).toBe('REPORTADO')
      expect(confirmacionInicial('Efectivo')).toBe('CONFIRMADO')
    })

    it('un método desconocido → CONFIRMADO (no bloquea la operación)', () => {
      expect(confirmacionInicial('CRIPTO')).toBe('CONFIRMADO')
    })

    it('respeta una lista custom', () => {
      expect(confirmacionInicial('EFECTIVO', ['EFECTIVO'])).toBe('REPORTADO')
      expect(confirmacionInicial('NEQUI', ['EFECTIVO'])).toBe('CONFIRMADO')
    })
  })

  describe('parseMetodosRequierenConfirmacion', () => {
    it('null / vacío / whitespace → default del ADR', () => {
      expect(parseMetodosRequierenConfirmacion(null)).toEqual([...METODOS_REQUIEREN_CONFIRMACION_DEFAULT])
      expect(parseMetodosRequierenConfirmacion('')).toEqual([...METODOS_REQUIEREN_CONFIRMACION_DEFAULT])
      expect(parseMetodosRequierenConfirmacion('   ')).toEqual([...METODOS_REQUIEREN_CONFIRMACION_DEFAULT])
    })

    it('CSV → lista normalizada a MAYÚSCULAS, sin vacíos', () => {
      expect(parseMetodosRequierenConfirmacion('nequi, transferencia ,,')).toEqual(['NEQUI', 'TRANSFERENCIA'])
    })

    it('CSV que solo tiene comas → default (no lista vacía)', () => {
      expect(parseMetodosRequierenConfirmacion(',,')).toEqual([...METODOS_REQUIEREN_CONFIRMACION_DEFAULT])
    })

    it('se compone con confirmacionInicial', () => {
      const metodos = parseMetodosRequierenConfirmacion('EFECTIVO')
      expect(confirmacionInicial('EFECTIVO', metodos)).toBe('REPORTADO')
      expect(confirmacionInicial('NEQUI', metodos)).toBe('CONFIRMADO')
    })
  })

  describe('datosConfirmacionInicial (coherente con el backfill de la migración)', () => {
    it('CONFIRMADO lleva confirmadoAt seteado (como las filas históricas)', () => {
      const datos = datosConfirmacionInicial('EFECTIVO')
      expect(datos.confirmacion).toBe('CONFIRMADO')
      expect(datos.confirmadoAt).toBeInstanceOf(Date)
    })

    it('REPORTADO NO lleva confirmadoAt', () => {
      const datos = datosConfirmacionInicial('NEQUI')
      expect(datos.confirmacion).toBe('REPORTADO')
      expect(datos.confirmadoAt).toBeUndefined()
    })

    it('nunca setea confirmadoPorId (eso solo lo hace el endpoint de confirmación)', () => {
      expect(datosConfirmacionInicial('EFECTIVO')).not.toHaveProperty('confirmadoPorId')
      expect(datosConfirmacionInicial('NEQUI')).not.toHaveProperty('confirmadoPorId')
    })

    it('respeta la lista custom', () => {
      expect(datosConfirmacionInicial('EFECTIVO', ['EFECTIVO']).confirmacion).toBe('REPORTADO')
    })
  })
})
