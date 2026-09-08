import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockPrisma, mockCalcular } = vi.hoisted(() => ({
  mockPrisma: {
    pedido: { findUnique: vi.fn() },
    cliente: { findUnique: vi.fn() },
    pedidoItem: { findFirst: vi.fn() },
    obligacionPendiente: { findFirst: vi.fn() },
    actividad: { findUnique: vi.fn() },
    pedidoCantidadAjuste: { findMany: vi.fn() },
  },
  mockCalcular: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('../../../domain/services/diferencial.service', () => ({ calcularDiferencial: (...a: unknown[]) => mockCalcular(...a) }))

import { ProyectarGestionPendienteUseCase, ProyectarGestionPendienteError } from '../ProyectarGestionPendienteUseCase'

const uc = () => new ProyectarGestionPendienteUseCase()

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.pedido.findUnique.mockResolvedValue({
    id: 'p1', clienteId: 'c1', negocioId: null, canal: 'DOMICILIO',
    total: 20000, totalPagado: 5000, saldo: 15000, estadoEntrega: 'NO_ENTREGADO',
  })
  mockPrisma.cliente.findUnique.mockResolvedValue({ saldoFavor: 0 })
  mockPrisma.pedidoItem.findFirst.mockResolvedValue({ precio: 2000, cantPedido: 10, cantEntrega: 5 })
  mockPrisma.obligacionPendiente.findFirst.mockResolvedValue(null)
  mockPrisma.pedidoCantidadAjuste.findMany.mockResolvedValue([])
})

describe('ProyectarGestionPendienteUseCase — gestionar', () => {
  it('modoDestino == canal del pedido → diferencial 0 (no llama a calcularDiferencial)', async () => {
    const r = await uc().execute({ pedidoId: 'p1', accion: 'gestionar', producto: 'PACA_AGUA', cantidad: 5, modoDestino: 'DOMICILIO' })
    expect(mockCalcular).not.toHaveBeenCalled()
    expect(r.diferencial?.diferencial).toBe(0)
    expect(r.consecuencia.tipo).toBe('sin_ajuste')
    expect(r.remanente).toBe(5)
    expect(r.allowedActions).toEqual(['gestionar'])
  })

  it('diferencial positivo → cobro adicional: sube total y saldo, saldoFavor igual', async () => {
    mockCalcular.mockResolvedValue({ valorHistorico: 10000, valorActual: 13000, diferencial: 3000 })
    const r = await uc().execute({ pedidoId: 'p1', accion: 'gestionar', producto: 'PACA_AGUA', cantidad: 5, modoDestino: 'PUNTO' })
    expect(r.consecuencia.tipo).toBe('cobro_adicional')
    expect(r.consecuencia.pedidoTotalDespues).toBe(23000)
    expect(r.consecuencia.pedidoSaldoDespues).toBe(18000)
    expect(r.consecuencia.clienteSaldoFavorDespues).toBe(0)
  })

  it('diferencial negativo → ajuste a favor: total NO baja, saldoFavor sube', async () => {
    mockCalcular.mockResolvedValue({ valorHistorico: 10000, valorActual: 8000, diferencial: -2000 })
    const r = await uc().execute({ pedidoId: 'p1', accion: 'gestionar', producto: 'PACA_AGUA', cantidad: 5, modoDestino: 'PUNTO' })
    expect(r.consecuencia.tipo).toBe('ajuste_a_favor')
    expect(r.consecuencia.pedidoTotalDespues).toBe(20000) // sin cambio
    expect(r.consecuencia.pedidoSaldoDespues).toBe(15000)
    expect(r.consecuencia.clienteSaldoFavorDespues).toBe(2000)
  })

  it('cantidad > remanente → warning + allowedActions vacío', async () => {
    const r = await uc().execute({ pedidoId: 'p1', accion: 'gestionar', producto: 'PACA_AGUA', cantidad: 99, modoDestino: 'DOMICILIO' })
    expect(r.warnings.some((w) => w.code === 'CANTIDAD_EXCEDE_PENDIENTE')).toBe(true)
    expect(r.allowedActions).toEqual([])
  })

  it('obligación ya activa → warning + bloqueado', async () => {
    mockPrisma.obligacionPendiente.findFirst.mockResolvedValue({ id: 'ob1' })
    const r = await uc().execute({ pedidoId: 'p1', accion: 'gestionar', producto: 'PACA_AGUA', cantidad: 5, modoDestino: 'DOMICILIO' })
    expect(r.warnings.some((w) => w.code === 'OBLIGACION_YA_ACTIVA')).toBe(true)
    expect(r.allowedActions).toEqual([])
  })

  it('pedido CANCELADO → NO_ADMITE_GESTION', async () => {
    mockPrisma.pedido.findUnique.mockResolvedValue({ id: 'p1', clienteId: 'c1', negocioId: null, canal: 'DOMICILIO', total: 0, totalPagado: 0, saldo: 0, estadoEntrega: 'CANCELADO' })
    const r = await uc().execute({ pedidoId: 'p1', accion: 'gestionar', producto: 'PACA_AGUA', cantidad: 1, modoDestino: 'DOMICILIO' })
    expect(r.warnings.some((w) => w.code === 'NO_ADMITE_GESTION')).toBe(true)
    expect(r.allowedActions).toEqual([])
  })

  it('pedido inexistente → PEDIDO_NOT_FOUND', async () => {
    mockPrisma.pedido.findUnique.mockResolvedValue(null)
    await expect(uc().execute({ pedidoId: 'x', accion: 'gestionar', producto: 'PACA_AGUA', cantidad: 1, modoDestino: 'DOMICILIO' }))
      .rejects.toThrow(ProyectarGestionPendienteError)
  })

  it('es READ-ONLY: no invoca ningún método de escritura de prisma', async () => {
    await uc().execute({ pedidoId: 'p1', accion: 'gestionar', producto: 'PACA_AGUA', cantidad: 5, modoDestino: 'DOMICILIO' })
    for (const model of Object.values(mockPrisma)) {
      expect((model as Record<string, unknown>).create).toBeUndefined()
      expect((model as Record<string, unknown>).update).toBeUndefined()
      expect((model as Record<string, unknown>).delete).toBeUndefined()
    }
  })
})

describe('ProyectarGestionPendienteUseCase — liberar', () => {
  beforeEach(() => {
    mockPrisma.actividad.findUnique.mockResolvedValue({
      id: 'a1', cantidad: 5, modo: 'PUNTO', estado: 'ASIGNADA',
      obligacion: { id: 'ob1', producto: 'PACA_AGUA', pedidoId: 'p1' },
    })
  })

  it('reversión total: solo diferenciales positivos aplicados → se revierten', async () => {
    mockPrisma.pedidoCantidadAjuste.findMany.mockResolvedValue([{ montoDiferencial: 3000 }, { montoDiferencial: 0 }])
    const r = await uc().execute({ pedidoId: 'p1', accion: 'liberar', actividadId: 'a1' })
    expect(r.reversion).toEqual({ montoRevertible: 3000, saldoFavorNoRevertido: 0 })
    expect(r.consecuencia.tipo).toBe('reversion_total')
    expect(r.consecuencia.pedidoTotalDespues).toBe(17000)
    expect(r.consecuencia.clienteSaldoFavorDespues).toBe(0)
  })

  it('reversión PARCIAL: el negativo ya acreditado a saldoFavor NO se revierte', async () => {
    mockPrisma.cliente.findUnique.mockResolvedValue({ saldoFavor: 2000 })
    mockPrisma.pedidoCantidadAjuste.findMany.mockResolvedValue([{ montoDiferencial: 3000 }, { montoDiferencial: -2000 }])
    const r = await uc().execute({ pedidoId: 'p1', accion: 'liberar', actividadId: 'a1' })
    expect(r.reversion).toEqual({ montoRevertible: 3000, saldoFavorNoRevertido: 2000 })
    expect(r.consecuencia.tipo).toBe('reversion_parcial')
    expect(r.consecuencia.pedidoTotalDespues).toBe(17000)
    expect(r.consecuencia.clienteSaldoFavorDespues).toBe(2000) // permanece
  })

  it('actividad ya CANCELADA → ACTIVIDAD_NO_MODIFICABLE + bloqueado', async () => {
    mockPrisma.actividad.findUnique.mockResolvedValue({ id: 'a1', cantidad: 5, modo: 'PUNTO', estado: 'CANCELADA', obligacion: { id: 'ob1', producto: 'PACA_AGUA', pedidoId: 'p1' } })
    const r = await uc().execute({ pedidoId: 'p1', accion: 'liberar', actividadId: 'a1' })
    expect(r.warnings.some((w) => w.code === 'ACTIVIDAD_NO_MODIFICABLE')).toBe(true)
    expect(r.allowedActions).toEqual([])
  })
})

describe('ProyectarGestionPendienteUseCase — cambiar-modo', () => {
  beforeEach(() => {
    mockPrisma.actividad.findUnique.mockResolvedValue({
      id: 'a1', cantidad: 5, modo: 'PUNTO', estado: 'ASIGNADA',
      obligacion: { id: 'ob1', producto: 'PACA_AGUA', pedidoId: 'p1' },
    })
  })

  it('revierte lo aplicado antes y aplica el nuevo diferencial (neto)', async () => {
    // actividad.modo=PUNTO; modoDestino=PUNTO != canal del pedido (DOMICILIO) → sí calcula
    mockPrisma.pedidoCantidadAjuste.findMany.mockResolvedValue([{ montoDiferencial: 3000 }])
    mockCalcular.mockResolvedValue({ valorHistorico: 10000, valorActual: 11000, diferencial: 1000 })
    const r = await uc().execute({ pedidoId: 'p1', accion: 'cambiar-modo', actividadId: 'a1', modoDestino: 'PUNTO' })
    // total: 20000 - 3000 (revert) + 1000 (nuevo positivo) = 18000
    expect(r.consecuencia.pedidoTotalDespues).toBe(18000)
    expect(r.diferencial?.diferencial).toBe(1000)
    expect(r.consecuencia.tipo).toBe('cobro_adicional')
  })

  it('modoDestino == canal del pedido → nuevo diferencial 0, solo revierte lo anterior', async () => {
    mockPrisma.pedidoCantidadAjuste.findMany.mockResolvedValue([{ montoDiferencial: 3000 }])
    const r = await uc().execute({ pedidoId: 'p1', accion: 'cambiar-modo', actividadId: 'a1', modoDestino: 'DOMICILIO' })
    expect(mockCalcular).not.toHaveBeenCalled()
    expect(r.diferencial?.diferencial).toBe(0)
    expect(r.consecuencia.pedidoTotalDespues).toBe(17000) // 20000 - 3000
  })
})
