import { describe, it, expect } from 'vitest'
import {
  normalizarTelefono,
  formatearTelefonoParaInput,
  formatearTelefonoParaCopiar,
  formatearTelefonoParaLlamar,
  esTelefonoValido,
} from '../telefono'

describe('telefono', () => {
  describe('normalizarTelefono', () => {
    it('convierte número nacional de 10 dígitos a formato internacional sin +', () => {
      expect(normalizarTelefono('3102921234')).toBe('573102921234')
    })

    it('limpia espacios, guiones y paréntesis', () => {
      expect(normalizarTelefono('310 292 1234')).toBe('573102921234')
      expect(normalizarTelefono('310-292-1234')).toBe('573102921234')
      expect(normalizarTelefono('(310) 292-1234')).toBe('573102921234')
    })

    it('mantiene el indicativo 57 si ya está presente', () => {
      expect(normalizarTelefono('573102921234')).toBe('573102921234')
    })

    it('limpia el signo + y el indicativo de país', () => {
      expect(normalizarTelefono('+57 310 292 1234')).toBe('573102921234')
      expect(normalizarTelefono('+573102921234')).toBe('573102921234')
    })

    it('acepta fijos colombianos de 10 dígitos', () => {
      expect(normalizarTelefono('6012345678')).toBe('576012345678')
    })

    it('acepta números cortos agregando el indicativo 57', () => {
      expect(normalizarTelefono('1234567')).toBe('571234567')
    })

    it('no duplica el indicativo cuando el input ya lo tiene', () => {
      expect(normalizarTelefono('+57 300 abc 1234')).toBe('573001234')
    })

    it('devuelve cadena vacía para entrada vacía', () => {
      expect(normalizarTelefono('')).toBe('')
      expect(normalizarTelefono(null)).toBe('')
      expect(normalizarTelefono(undefined)).toBe('')
    })
  })

  describe('formatearTelefonoParaInput', () => {
    it('muestra número colombiano sin indicativo de país', () => {
      expect(formatearTelefonoParaInput('573102921234')).toBe('310 292 1234')
    })

    it('formatea número nacional de 10 dígitos', () => {
      expect(formatearTelefonoParaInput('3102921234')).toBe('310 292 1234')
    })

    it('formatea fijos colombianos', () => {
      expect(formatearTelefonoParaInput('576012345678')).toBe('601 234 5678')
    })

    it('devuelve cadena vacía para entrada vacía', () => {
      expect(formatearTelefonoParaInput('')).toBe('')
    })
  })

  describe('formatearTelefonoParaCopiar', () => {
    it('copia con formato internacional incluyendo +', () => {
      expect(formatearTelefonoParaCopiar('573102921234')).toBe('+57 310 292 1234')
    })

    it('normaliza antes de formatear', () => {
      expect(formatearTelefonoParaCopiar('310 292 1234')).toBe('+57 310 292 1234')
    })
  })

  describe('formatearTelefonoParaLlamar', () => {
    it('genera enlace tel: con +', () => {
      expect(formatearTelefonoParaLlamar('573102921234')).toBe('+573102921234')
    })
  })

  describe('esTelefonoValido', () => {
    it('acepta teléfonos con al menos 7 dígitos', () => {
      expect(esTelefonoValido('3102921234')).toBe(true)
      expect(esTelefonoValido('1234567')).toBe(true)
    })

    it('rechaza teléfonos con menos de 7 dígitos', () => {
      expect(esTelefonoValido('123456')).toBe(false)
    })

    it('rechaza entrada vacía', () => {
      expect(esTelefonoValido('')).toBe(false)
    })
  })
})
