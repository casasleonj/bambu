// @tests #789 - regresión: el indicativo 57 devolvía la agenda entera
import { describe, it, expect } from 'vitest'
import { evaluarBusqueda } from '@/lib/busqueda-fuzzy'

describe('teléfono: el indicativo no es un comodín', () => {
  const t = (telefono: string) => ({ textos: [], telefonos: [telefono] })

  it('el indicativo solo no coincide con ningún teléfono', () => {
    // Antes: ('57'+real).includes('57') era cierto para TODOS los números,
    // así que buscar "57" devolvía la agenda entera.
    expect(evaluarBusqueda(t('3001234567'), '57')).toBeNull()
    expect(evaluarBusqueda(t('3001234567'), '+57')).toBeNull()
    expect(evaluarBusqueda(t('3001234567'), '573')).toBeNull()
  })

  it('buscar 57 contra muchos teléfonos no devuelve ninguno', () => {
    const agenda = Array.from({ length: 20 }, (_, i) => `300123${String(i).padStart(4, '0')}`)
    const hits = agenda.filter((tel) => evaluarBusqueda(t(tel), '57') !== null)
    expect(hits).toEqual([])
  })

  it('el fragmento de dígitos reales sigue funcionando', () => {
    expect(evaluarBusqueda(t('3001234567'), '300123')?.tipo).toBe('identificador')
    expect(evaluarBusqueda(t('3001234567'), '300-123')?.tipo).toBe('identificador')
    expect(evaluarBusqueda(t('3001234567'), '1234567')?.tipo).toBe('identificador')
  })

  it('igualdad exacta con y sin indicativo sigue funcionando', () => {
    expect(evaluarBusqueda(t('3001234567'), '3001234567')?.tipo).toBe('identificador')
    expect(evaluarBusqueda(t('3001234567'), '+57 300 123 4567')?.tipo).toBe('identificador')
    expect(evaluarBusqueda(t('3001234567'), '573001234567')?.tipo).toBe('identificador')
  })

  it('un dígito cambiado nunca coincide', () => {
    expect(evaluarBusqueda(t('3001234567'), '3001234568')).toBeNull()
    expect(evaluarBusqueda(t('3001234567'), '573001234568')).toBeNull()
  })
})
