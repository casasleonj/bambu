// @tests normalizeBarrioNombre — normalización determinista (F1 Barrio canónico)
// No es fuzzy matching: solo acentos + mayúsculas + espacios, reutilizando
// normalizeName (ya usado en la importación histórica).
import { describe, it, expect } from 'vitest'
import { normalizeBarrioNombre } from '../normalizer'

describe('normalizeBarrioNombre', () => {
  it('quita acentos', () => {
    expect(normalizeBarrioNombre('San José')).toBe('san jose')
  })

  it('normaliza mayúsculas/minúsculas', () => {
    expect(normalizeBarrioNombre('LA ESPERANZA')).toBe('la esperanza')
    expect(normalizeBarrioNombre('la esperanza')).toBe('la esperanza')
  })

  it('colapsa espacios múltiples y recorta bordes', () => {
    expect(normalizeBarrioNombre('  La   Victoria  ')).toBe('la victoria')
  })

  it('nombres distintos que colisionan tras normalizar producen la misma clave', () => {
    expect(normalizeBarrioNombre('San José')).toBe(normalizeBarrioNombre('  san   jose '))
  })

  it('nombres realmente distintos no colisionan', () => {
    expect(normalizeBarrioNombre('El Centro')).not.toBe(normalizeBarrioNombre('El Central'))
  })
})
