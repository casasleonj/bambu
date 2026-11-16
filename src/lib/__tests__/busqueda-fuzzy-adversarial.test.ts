// @tests #789 - verificación adversarial del motor fuzzy contra el research
import { describe, it, expect } from 'vitest'
import { evaluarBusqueda } from '@/lib/busqueda-fuzzy'

describe('adversarial: identificadores no pueden fuzzy-matchear', () => {
  it('FAC-00120 no sugiere FAC-00128 por errata de dígito', () => {
    const f = { textos: ['Cliente'], identificadores: ['FAC-00120'] }
    expect(evaluarBusqueda(f, 'FAC-00128')).toBeNull()
    // variantes de la misma errata
    expect(evaluarBusqueda(f, 'fac-00128')).toBeNull()
    expect(evaluarBusqueda(f, '#FAC-00128')).toBeNull()
  })

  it('un número de pedido no sugiere otro número cercano', () => {
    const p = { textos: ['Cliente'], identificadores: ['1042'] }
    expect(evaluarBusqueda(p, '1043')).toBeNull()
    expect(evaluarBusqueda(p, '1041')).toBeNull()
    expect(evaluarBusqueda(p, '1142')).toBeNull()
  })

  it('teléfono con dígito cambiado no coincide', () => {
    const c = { textos: ['Camilo'], telefonos: ['3001234567'] }
    expect(evaluarBusqueda(c, '3001234568')).toBeNull()
    expect(evaluarBusqueda(c, '3001234566')).toBeNull()
  })

  it('un token que MEZCLA letras y dígitos no entra en fuzzy', () => {
    // el guard es /\d/ sobre el token: A1B234 no debe aproximarse a A1B235
    expect(evaluarBusqueda({ textos: ['A1B234'] }, 'A1B235')).toBeNull()
    expect(evaluarBusqueda({ textos: ['SKU-9911'] }, 'SKU-9912')).toBeNull()
  })

  it('identificador completo sí coincide, y su prefijo también', () => {
    const f = { textos: [], identificadores: ['FAC-00120'] }
    expect(evaluarBusqueda(f, 'FAC-00120')?.tipo).toBe('identificador')
    expect(evaluarBusqueda(f, 'FAC-00')?.tipo).toBe('identificador')
  })
})

describe('adversarial: los casos obligatorios del issue', () => {
  it('mas por menos → Más por Menos (solo tildes/mayúsculas)', () => {
    expect(evaluarBusqueda({ textos: ['Más por Menos'] }, 'mas por menos')?.tipo).toBe('exacta')
  })
  it('pun → Punti Frío (prefijo)', () => {
    expect(evaluarBusqueda({ textos: ['Punti Frío'] }, 'pun')?.tipo).toBe('prefijo')
  })
  it('MAX → Máximo', () => {
    expect(evaluarBusqueda({ textos: ['Máximo'] }, 'MAX')?.tipo).toBe('prefijo')
  })
  it('perez juan → Juan Pérez (orden invertido entre campos)', () => {
    expect(evaluarBusqueda({ textos: ['Juan', 'Pérez'] }, 'perez juan')).not.toBeNull()
  })
})

describe('adversarial: entradas hostiles', () => {
  it('consulta vacía o solo espacios no rompe ni coincide', () => {
    expect(evaluarBusqueda({ textos: ['Algo'] }, '')).toBeNull()
    expect(evaluarBusqueda({ textos: ['Algo'] }, '   ')).toBeNull()
  })
  it('regex y comodines se tratan como texto literal', () => {
    expect(evaluarBusqueda({ textos: ['Panadería'] }, '.*')).toBeNull()
    expect(evaluarBusqueda({ textos: ['Panadería'] }, '%')).toBeNull()
    expect(evaluarBusqueda({ textos: ['Panadería'] }, 'pana%')?.tipo).toBe('prefijo')
  })
  it('registro sin campos no revienta', () => {
    expect(evaluarBusqueda({ textos: [] }, 'algo')).toBeNull()
    expect(evaluarBusqueda({ textos: [null, undefined] }, 'algo')).toBeNull()
  })
})
