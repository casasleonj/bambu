// @tests embarque-ui-estado — estado derivado del Command Center
// Verifica la regla central de Fase 3: la granularidad de UI se deriva en
// cliente a partir de datos reales (estado + pedidos + carga), nunca se
// persiste como estado nuevo en `Embarque.estado`.
import { describe, it, expect } from 'vitest'
import { derivarEstadoUI, toUIEstadoInput, contarPorFase, estadoBackendParaFase, derivarSiguientePaso } from '@/lib/embarque-ui-estado'

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

  describe('toUIEstadoInput — puente desde la fuente real', () => {
    it('mapea pedidos y carga desde productos', () => {
      const input = toUIEstadoInput({
        estado: 'ABIERTO',
        pedidos: [{ id: '1' }],
        productos: [{ cargadas: 3 }, { cargadas: 2 }],
      })
      expect(input.tienePedidos).toBe(true)
      expect(input.totalUnidadesCarga).toBe(5)
    })

    it('usa totalPacas si está presente (prevalece sobre productos)', () => {
      const input = toUIEstadoInput({
        estado: 'ABIERTO',
        totalPacas: 7,
        productos: [{ cargadas: 3 }],
      })
      expect(input.totalUnidadesCarga).toBe(7)
    })

    it('sin datos → sin pedidos y sin carga', () => {
      const input = toUIEstadoInput({ estado: 'ABIERTO' })
      expect(input.tienePedidos).toBe(false)
      expect(input.totalUnidadesCarga).toBe(0)
    })
  })

  describe('contarPorFase', () => {
    it('cuenta cada fase correctamente', () => {
      const conteo = contarPorFase([
        toUIEstadoInput({ estado: 'ABIERTO' }),                                // BORRADOR
        toUIEstadoInput({ estado: 'ABIERTO', productos: [{ cargadas: 1 }] }),  // PREPARANDO
        toUIEstadoInput({ estado: 'ABIERTO', pedidos: [{}] }),                 // CONFIRMADO
        toUIEstadoInput({ estado: 'ABIERTO', pedidos: [{}] }),                 // CONFIRMADO
        toUIEstadoInput({ estado: 'EN_RUTA' }),                                // EN_RUTA
        toUIEstadoInput({ estado: 'CERRADO' }),                                // CERRADO
        toUIEstadoInput({ estado: 'CANCELADO' }),                              // CANCELADO
      ])
      expect(conteo).toEqual({
        BORRADOR: 1,
        PREPARANDO: 1,
        CONFIRMADO: 2,
        EN_RUTA: 1,
        CERRADO: 1,
        CANCELADO: 1,
      })
    })

    it('lista vacía → todo cero', () => {
      expect(contarPorFase([])).toEqual({
        BORRADOR: 0,
        PREPARANDO: 0,
        CONFIRMADO: 0,
        EN_RUTA: 0,
        CERRADO: 0,
        CANCELADO: 0,
      })
    })
  })

  describe('estadoBackendParaFase', () => {
    it('colapsa las sub-fases de ABIERTO a "ABIERTO"', () => {
      expect(estadoBackendParaFase('BORRADOR')).toBe('ABIERTO')
      expect(estadoBackendParaFase('PREPARANDO')).toBe('ABIERTO')
      expect(estadoBackendParaFase('CONFIRMADO')).toBe('ABIERTO')
    })

    it('el resto es 1:1', () => {
      expect(estadoBackendParaFase('EN_RUTA')).toBe('EN_RUTA')
      expect(estadoBackendParaFase('CERRADO')).toBe('CERRADO')
      expect(estadoBackendParaFase('CANCELADO')).toBe('CANCELADO')
    })
  })

  describe('derivarSiguientePaso — Preparation Flow (Fase 4)', () => {
    it('BORRADOR → registrar carga y asignar pedidos', () => {
      const r = derivarSiguientePaso({ estado: 'ABIERTO' })
      expect(r.label).toBeTruthy()
      expect(r.accion).toBe('REGISTRAR_CARGA')
    })

    it('PREPARANDO → asignar pedidos', () => {
      const r = derivarSiguientePaso({ estado: 'ABIERTO', totalUnidadesCarga: 5 })
      expect(r.label).toContain('pedidos')
      expect(r.accion).toBe('ASIGNAR_PEDIDOS')
    })

    it('CONFIRMADO → listo para enviar', () => {
      const r = derivarSiguientePaso({ estado: 'ABIERTO', tienePedidos: true })
      expect(r.label).toContain('envía')
      expect(r.accion).toBe('ENVIAR')
    })

    it('EN_RUTA → cerrar al retornar', () => {
      const r = derivarSiguientePaso({ estado: 'EN_RUTA' })
      expect(r.label).toContain('cierra')
      expect(r.accion).toBe('CERRAR')
    })

    it('CERRADO y CANCELADO → sin siguiente paso (null)', () => {
      expect(derivarSiguientePaso({ estado: 'CERRADO' }).label).toBeNull()
      expect(derivarSiguientePaso({ estado: 'CERRADO' }).accion).toBeNull()
      expect(derivarSiguientePaso({ estado: 'CANCELADO' }).label).toBeNull()
      expect(derivarSiguientePaso({ estado: 'CANCELADO' }).accion).toBeNull()
    })
  })
})
