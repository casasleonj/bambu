import { describe, expect, it } from 'vitest'
import {
  categoriaGastoValida,
  categoriasGastoDisponibles,
  esCategoriaPersonal,
  etiquetaCategoriaGasto,
  normalizarCategoriaGasto,
} from './gastos-categorias'

describe('categorías de gastos #973', () => {
  it('normaliza tildes, mayúsculas y espacios de forma determinista', () => {
    expect(normalizarCategoriaGasto('  Límpieza   general  ')).toBe('LIMPIEZA GENERAL')
    expect(normalizarCategoriaGasto('gasolina')).toBe('GASOLINA')
  })
  it('evita duplicar variantes canónicas en el catálogo', () => {
    const disponibles = categoriasGastoDisponibles([' Gasólina ', 'GASOLINA', 'NOMINA', ' Limpieza '])
    expect(disponibles.filter(categoria => categoria === 'GASOLINA')).toHaveLength(1)
    expect(disponibles).toContain('LIMPIEZA')
    expect(disponibles).not.toContain('NOMINA')
  })
  it('conserva categorías históricas base, incluida OTRO', () => {
    expect(categoriasGastoDisponibles([])).toEqual(expect.arrayContaining(['ARRIENDO', 'TRANSPORTE', 'OTRO']))
  })
  it('descarta categorías personales del selector, incluso con tildes', () => {
    expect(esCategoriaPersonal(' nómina ')).toBe(true)
    expect(esCategoriaPersonal('comisiones')).toBe(true)
    expect(esCategoriaPersonal('sueldos varios')).toBe(true)
    expect(esCategoriaPersonal('pago de personal')).toBe(true)
    expect(esCategoriaPersonal('transporte')).toBe(false)
  })
  it('rechaza valores vacíos, símbolos arbitrarios y categorías demasiado largas', () => {
    expect(categoriaGastoValida('  ')).toBe(false)
    expect(categoriaGastoValida('<script>')).toBe(false)
    expect(categoriaGastoValida('x'.repeat(46))).toBe(false)
    expect(categoriaGastoValida('Gasolina / transporte')).toBe(true)
  })
  it('proporciona etiquetas humanas sin modificar la clave financiera', () => {
    expect(etiquetaCategoriaGasto('TRANSPORTE')).toBe('Transporte')
    expect(etiquetaCategoriaGasto('OTRO')).toBe('Otro')
  })
})
