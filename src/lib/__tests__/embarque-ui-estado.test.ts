// @tests embarque-ui-estado — estado derivado del Command Center
// Verifica la regla central de Fase 3: la granularidad de UI se deriva en
// cliente a partir de datos reales (estado + pedidos + carga), nunca se
// persiste como estado nuevo en `Embarque.estado`.
import { describe, it, expect } from 'vitest'
import { derivarEstadoUI } from '@/lib/embarque-ui-estado'

describe('derivarEstadoUI — estados derivados del Command Center', () => {
  describe('ABIERTO → fases derivadas por precedencia', () => {
    it('sin pedidos y sin carga → BORRADOR', () => {
      const r = derivarEstadoUI({ estado: 'ABIERTO', tienePedidos: false, totalUnidadesCarga: 0 })
      expect(r.estadoReal).toBe('ABIERTO')
      expect(r.fase).toBe('BORRADOR')
      expect(r.label).toBe('Borrador')
    })

    it('con carga y sin pedidos → PREPARANDO', () => {
      const r = derivarEstadoUI({ estado: 'ABIERTO', tienePedidos: false, totalUnidadesCarga: 10 })
      expect(r.fase).toBe('PREPARANDO')
      expect(r.label).toBe('Preparando')
    })

    it('con pedidos → CONFIRMADO (precedencia sobre carga)', () => {
      const r = derivarEstadoUI({ estado: 'ABIERTO', tienePedidos: true, totalUnidadesCarga: 10 })
      expect(r.fase).toBe('CONFIRMADO')
      expect(r.label).toBe('Confirmado')
    })

    it('sin flags explícitos → BORRADOR (valores por defecto)', () => {
      const r = derivarEstadoUI({ estado: 'ABIERTO' })
      expect(r.fase).toBe('BORRADOR')
    })
  })

  describe('estados 1:1 (no derivados)', () => {
    it('EN_RUTA → EN_RUTA con label "En Ruta"', () => {
      const r = derivarEstadoUI({ estado: 'EN_RUTA' })
      expect(r.estadoReal).toBe('EN_RUTA')
      expect(r.fase).toBe('EN_RUTA')
      expect(r.label).toBe('En Ruta')
    })

    it('CERRADO → CERRADO', () => {
      const r = derivarEstadoUI({ estado: 'CERRADO' })
      expect(r.fase).toBe('CERRADO')
      expect(r.label).toBe('Cerrado')
    })

    it('CANCELADO → CANCELADO', () => {
      const r = derivarEstadoUI({ estado: 'CANCELADO' })
      expect(r.fase).toBe('CANCELADO')
      expect(r.label).toBe('Cancelado')
    })
  })

  describe('badge', () => {
    it('cada estado real produce un badgeClass no vacío', () => {
      for (const estado of ['ABIERTO', 'EN_RUTA', 'CERRADO', 'CANCELADO']) {
        const r = derivarEstadoUI({ estado, tienePedidos: true, totalUnidadesCarga: 5 })
        expect(r.badgeClass.length).toBeGreaterThan(0)
      }
    })

    it('CONFIRMADO usa el badge verde (antes era de ABIERTO)', () => {
      const r = derivarEstadoUI({ estado: 'ABIERTO', tienePedidos: true })
      expect(r.badgeClass).toContain('text-green')
    })
  })

  describe('defensivo', () => {
    it('estado desconocido no rompe: devuelve label crudo con badge neutro', () => {
      const r = derivarEstadoUI({ estado: 'ESTADO_FUTURO' })
      expect(r.label).toBe('ESTADO_FUTURO')
      expect(r.badgeClass.length).toBeGreaterThan(0)
    })
  })
})
