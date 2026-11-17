// @tests #788 — estado «sin pedidos en el período» de la búsqueda del Hub (maqueta A aprobada por el PO).
import { describe, expect, it } from 'vitest'
import { leerFiltrosConsulta, type FiltrosConsultaPedidos } from '@/lib/pedidos-consulta'
import { derivarEstadoBusqueda, tituloVacio, textoVolver, type EntradaEstadoBusqueda } from '../busqueda-sin-resultados'

const HOY = '2026-11-16'
const AYER = '2026-11-15'
const filtros = (q: Record<string, string>): FiltrosConsultaPedidos => leerFiltrosConsulta(new URLSearchParams(q))
const enHoy = (search = 'PUN') => filtros({ desde: HOY, hasta: HOY, search })
const enTodos = (search = 'PUN') => filtros({ all: 'true', search })

const base = (o: Partial<EntradaEstadoBusqueda>): EntradaEstadoBusqueda => ({
  filtrosUrl: enHoy(), lectura: { filtros: enHoy(), total: 0 }, cambiando: false, hayError: false,
  filasVisibles: 0, filtrosPrevios: null, hoy: HOY, ...o,
})

describe('#788 derivarEstadoBusqueda', () => {
  it('A · búsqueda con rango Hoy y 0 resultados → vacío por fecha', () => {
    expect(derivarEstadoBusqueda(base({}))).toEqual({ tipo: 'vacio', busqueda: 'PUN', periodo: 'de hoy' })
  })

  it('sin texto de búsqueda nunca muestra el estado (lista vacía normal)', () => {
    expect(derivarEstadoBusqueda(base({ filtrosUrl: enHoy(''), lectura: { filtros: enHoy(''), total: 0 } }))).toEqual({ tipo: 'normal' })
    expect(derivarEstadoBusqueda(base({ filtrosUrl: enHoy('   '), lectura: { filtros: enHoy('   '), total: 0 } }))).toEqual({ tipo: 'normal' })
  })

  it('con resultados no es vacío', () => {
    expect(derivarEstadoBusqueda(base({ lectura: { filtros: enHoy(), total: 3 }, filasVisibles: 3 }))).toEqual({ tipo: 'normal' })
  })

  it('una fila pendiente de sincronizar impide declarar vacío', () => {
    expect(derivarEstadoBusqueda(base({ filasVisibles: 1 }))).toEqual({ tipo: 'normal' })
  })

  it('si el rango ya es Todos no ofrece ampliar', () => {
    expect(derivarEstadoBusqueda(base({ filtrosUrl: enTodos(), lectura: { filtros: enTodos(), total: 0 } }))).toEqual({ tipo: 'normal' })
  })

  it('sin lectura todavía no muestra nada', () => {
    expect(derivarEstadoBusqueda(base({ lectura: null }))).toEqual({ tipo: 'normal' })
  })

  it('mientras el usuario escribe otra búsqueda (la lectura es de otra consulta) no muestra vacío', () => {
    expect(derivarEstadoBusqueda(base({ filtrosUrl: enHoy('PUNT'), cambiando: true }))).toEqual({ tipo: 'normal' })
  })

  describe('tras «Ver todos los períodos»', () => {
    const previos = enHoy()
    it('B · cargando mientras llega la nueva consulta', () => {
      expect(derivarEstadoBusqueda(base({ filtrosUrl: enTodos(), cambiando: true, filtrosPrevios: previos })))
        .toEqual({ tipo: 'cargando', busqueda: 'PUN' })
    })
    it('C · error si la nueva consulta falla, con la forma de volver', () => {
      expect(derivarEstadoBusqueda(base({ filtrosUrl: enTodos(), cambiando: true, hayError: true, filtrosPrevios: previos })))
        .toEqual({ tipo: 'error', busqueda: 'PUN', volver: 'Hoy' })
    })
    it('D · resultado con confirmación de lo que se está viendo', () => {
      expect(derivarEstadoBusqueda(base({ filtrosUrl: enTodos(), lectura: { filtros: enTodos(), total: 2 }, filasVisibles: 2, filtrosPrevios: previos })))
        .toEqual({ tipo: 'resultado', busqueda: 'PUN', volver: 'Hoy' })
    })
    it('E · sigue sin haber pedidos en ningún período', () => {
      expect(derivarEstadoBusqueda(base({ filtrosUrl: enTodos(), lectura: { filtros: enTodos(), total: 0 }, filtrosPrevios: previos })))
        .toEqual({ tipo: 'sin-resultados-en-todos', busqueda: 'PUN', volver: 'Hoy' })
    })
    it('si el rango anterior no era Hoy, vuelve al período anterior', () => {
      const ayer = filtros({ desde: AYER, hasta: AYER, search: 'PUN' })
      expect(derivarEstadoBusqueda(base({ filtrosUrl: enTodos(), lectura: { filtros: enTodos(), total: 1 }, filasVisibles: 1, filtrosPrevios: ayer })))
        .toEqual({ tipo: 'resultado', busqueda: 'PUN', volver: 'período anterior' })
    })
    it('si el usuario cambió a otro rango que no es Todos, deja de ser la expansión', () => {
      expect(derivarEstadoBusqueda(base({ filtrosUrl: enHoy(), filtrosPrevios: previos, lectura: { filtros: enHoy(), total: 0 } })))
        .toEqual({ tipo: 'vacio', busqueda: 'PUN', periodo: 'de hoy' })
    })
  })
})

describe('#788 textos', () => {
  it('el título nombra el período real, no siempre «hoy»', () => {
    expect(tituloVacio('de hoy', 'PUN')).toBe('Sin pedidos de hoy para «PUN»')
    expect(tituloVacio('de ayer', 'PUN')).toBe('Sin pedidos de ayer para «PUN»')
    expect(tituloVacio('del período', 'PUN')).toBe('Sin pedidos del período para «PUN»')
  })
  it('el período se deduce del rango consultado', () => {
    const r = (q: Record<string, string>) => derivarEstadoBusqueda(base({ filtrosUrl: filtros(q), lectura: { filtros: filtros(q), total: 0 } }))
    expect(r({ desde: AYER, hasta: AYER, search: 'x' })).toMatchObject({ periodo: 'de ayer' })
    expect(r({ desde: AYER, hasta: HOY, search: 'x' })).toMatchObject({ periodo: 'de ayer y hoy' })
    expect(r({ desde: '2026-11-01', hasta: '2026-11-10', search: 'x' })).toMatchObject({ periodo: 'del período' })
  })
  it('el botón de volver', () => {
    expect(textoVolver('Hoy')).toBe('Volver a Hoy')
    expect(textoVolver('período anterior')).toBe('Volver al período anterior')
  })
})
