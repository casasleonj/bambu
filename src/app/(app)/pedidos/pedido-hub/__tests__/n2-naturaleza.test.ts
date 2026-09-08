import { describe, it, expect } from 'vitest'
import { clasificarN2 } from '../n2-naturaleza'

const pendiente = (over: Record<string, unknown> = {}) => ({
  id: 'o1', producto: 'PACA_AGUA', remanente: 5, estado: 'ABIERTA',
  actividades: [{ id: 'a1', tipo: 'ENTREGA', cantidad: 5, cantidadCumplida: 0, estado: 'ASIGNADA', modo: 'DOMICILIO', embarqueId: null }],
  ...over,
})

describe('clasificarN2 (P1)', () => {
  it('pendiente en curso, sin señales → NORMAL, tono neutro', () => {
    const c = clasificarN2({ pendienteN2: pendiente() as never, estadoEntregaPedido: 'NO_ENTREGADO', casosAbiertos: [] })
    expect(c.naturaleza).toBe('normal')
    expect(c.tono).toBe('neutro')
  })

  it('pedido CANCELADO + obligación ABIERTA → INCONSISTENCIA', () => {
    const c = clasificarN2({ pendienteN2: pendiente() as never, estadoEntregaPedido: 'CANCELADO', casosAbiertos: [] })
    expect(c.naturaleza).toBe('inconsistencia')
    expect(c.tono).toBe('ambar')
  })

  it('obligación ANULADA → EXCEPCION (liberado)', () => {
    const c = clasificarN2({ pendienteN2: pendiente({ estado: 'ANULADA' }) as never, estadoEntregaPedido: 'NO_ENTREGADO', casosAbiertos: [] })
    expect(c.naturaleza).toBe('excepcion')
  })

  it('caso abierto sobre el pedido → RIESGO (señal, no bloqueo)', () => {
    const c = clasificarN2({
      pendienteN2: pendiente() as never, estadoEntregaPedido: 'NO_ENTREGADO',
      casosAbiertos: [{ id: 'c1', alertaTipo: 'MONTO_ANOMALO', severidad: 'ALTA', status: 'ABIERTO' }] as never,
    })
    expect(c.naturaleza).toBe('riesgo')
    expect(c.detalle).toMatch(/no bloquea/)
  })

  it('conflicto en curso (409) → CONFLICTO', () => {
    const c = clasificarN2({ pendienteN2: pendiente() as never, estadoEntregaPedido: 'NO_ENTREGADO', casosAbiertos: [], conflictoEnCurso: true })
    expect(c.naturaleza).toBe('conflicto')
  })

  it('todas las actividades canceladas + obligación ABIERTA → EXCEPCION', () => {
    const c = clasificarN2({
      pendienteN2: pendiente({ actividades: [{ id: 'a1', tipo: 'ENTREGA', cantidad: 5, cantidadCumplida: 0, estado: 'CANCELADA', modo: null, embarqueId: null }] }) as never,
      estadoEntregaPedido: 'NO_ENTREGADO', casosAbiertos: [],
    })
    expect(c.naturaleza).toBe('excepcion')
  })
})
