import { describe, it, expect } from 'vitest'
import { scoreClientMatch } from '../matcher'
import type { NormalizedCliente } from '../types'

function makeCliente(partial: Partial<NormalizedCliente> = {}): NormalizedCliente {
  return {
    entity: 'CLIENTE',
    nombre: partial.nombre ?? 'María',
    apellido: partial.apellido,
    telefono: partial.telefono ?? '573001234567',
    direccion: partial.direccion,
    barrio: partial.barrio,
    referencia: partial.referencia,
    linkUbicacion: partial.linkUbicacion,
    nombreNegocio: partial.nombreNegocio,
    tipoNegocio: partial.tipoNegocio,
    horaApertura: partial.horaApertura,
    preciosEspeciales: partial.preciosEspeciales,
    contactos: partial.contactos ?? [],
    notas: partial.notas,
  }
}

function makeExisting(overrides: {
  id?: string
  nombre?: string
  apellido?: string | null
  telefono?: string
  direccion?: string | null
  barrio?: string | null
  nombreNegocio?: string | null
  isPhoneMatch?: number
}) {
  return {
    id: overrides.id ?? 'existing-1',
    nombre: overrides.nombre ?? 'María',
    apellido: overrides.apellido ?? null,
    telefono: overrides.telefono ?? '573001234567',
    direccion: overrides.direccion ?? null,
    barrio: overrides.barrio ?? null,
    nombreNegocio: overrides.nombreNegocio ?? null,
    similarity: 0.8,
    isPhoneMatch: overrides.isPhoneMatch ?? 0,
  }
}

describe('matcher', () => {
  describe('scoreClientMatch', () => {
    it('returns score 1.0 for exact phone match', () => {
      const cliente = makeCliente({ nombre: 'María', telefono: '573001234567' })
      const existing = makeExisting({ nombre: 'María Pérez', telefono: '573001234567' })
      const result = scoreClientMatch(cliente, existing)

      expect(result.score).toBe(1.0)
      expect(result.reason).toContain('TELÉFONO IDÉNTICO')
    })

    it('returns high score for identical name + barrio', () => {
      const cliente = makeCliente({ nombre: 'José', apellido: 'Pérez', barrio: 'Centro' })
      const existing = makeExisting({
        nombre: 'José',
        apellido: 'Pérez',
        telefono: '573333333333',
        barrio: 'Centro',
      })
      const result = scoreClientMatch(cliente, existing)

      expect(result.score).toBe(0.95)
      expect(result.reason).toContain('NOMBRE Y BARRIO IDÉNTICOS')
    })

    it('returns fuzzy score for similar name + same barrio', () => {
      const cliente = makeCliente({ nombre: 'Jose Peres', barrio: 'Centro' })
      const existing = makeExisting({
        nombre: 'José Pérez',
        telefono: '573333333333',
        barrio: 'Centro',
      })
      const result = scoreClientMatch(cliente, existing)

      expect(result.score).toBeGreaterThanOrEqual(0.7)
      expect(result.score).toBeLessThan(0.95)
      expect(result.reason).toContain('NOMBRE PARECIDO')
      expect(result.reason).toContain('MISMO BARRIO')
    })

    it('returns low score for unrelated clients', () => {
      const cliente = makeCliente({ nombre: 'Carlos' })
      const existing = makeExisting({ nombre: 'María', telefono: '579999999999' })
      const result = scoreClientMatch(cliente, existing)

      expect(result.score).toBeLessThan(0.7)
    })
  })
})
