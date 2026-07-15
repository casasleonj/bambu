import { describe, it, expect } from 'vitest'
import {
  normalizarTelefono,
  extraerDigitosLocales,
  formatearTelefonoParaInput,
  formatearDigitosLocales,
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

    it('descarta indicativo 57 malformado en números cortos', () => {
      expect(formatearTelefonoParaInput('573174015')).toBe('317 4015')
    })

    it('devuelve cadena vacía para entrada vacía', () => {
      expect(formatearTelefonoParaInput('')).toBe('')
    })
  })

  describe('extraerDigitosLocales', () => {
    it('quita el indicativo 57 de número internacional', () => {
      expect(extraerDigitosLocales('573102921234')).toBe('3102921234')
    })

    it('limpia espacios, signo + e indicativo 57 al extraer dígitos locales', () => {
      expect(extraerDigitosLocales('+57 310 292 1234')).toBe('3102921234')
      expect(extraerDigitosLocales('+573102921234')).toBe('3102921234')
      expect(extraerDigitosLocales('573174015')).toBe('3174015')
    })

    it('mantiene número nacional de 10 dígitos tal cual', () => {
      expect(extraerDigitosLocales('3102921234')).toBe('3102921234')
    })

    it('mantiene número corto sin indicativo', () => {
      expect(extraerDigitosLocales('1234567')).toBe('1234567')
    })

    it('devuelve cadena vacía para entrada vacía', () => {
      expect(extraerDigitosLocales('')).toBe('')
      expect(extraerDigitosLocales(null)).toBe('')
      expect(extraerDigitosLocales(undefined)).toBe('')
    })
  })

  describe('formatearDigitosLocales', () => {
    it('formatea 10 dígitos locales con espacios', () => {
      expect(formatearDigitosLocales('3102921234')).toBe('310 292 1234')
    })

    it('formatea número corto de 7 dígitos', () => {
      expect(formatearDigitosLocales('1234567')).toBe('123 4567')
    })

    it('formatea número corto de 8 dígitos', () => {
      expect(formatearDigitosLocales('12345678')).toBe('123 456 78')
    })

    it('ignora indicativo 57 si estuviera presente', () => {
      expect(formatearDigitosLocales('573102921234')).toBe('310 292 1234')
      expect(formatearDigitosLocales('573174015')).toBe('317 4015')
    })

    it('devuelve cadena vacía para entrada vacía', () => {
      expect(formatearDigitosLocales('')).toBe('')
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
