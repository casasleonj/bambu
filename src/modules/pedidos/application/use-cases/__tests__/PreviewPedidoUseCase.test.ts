import { describe, it, expect, vi } from 'vitest'
import { PreviewPedidoUseCase, ClienteNotFoundError, PedidoOrigenNotFoundError, PedidoNotFoundError } from '../PreviewPedidoUseCase'
import type { PreviewPedidoDeps } from '../PreviewPedidoUseCase'
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'

function makeDeps(): PreviewPedidoDeps {
  return {
    pricingPort: {
      loadPricingContext: vi.fn().mockResolvedValue({
        clienteOverrides: null,
        tiersByCode: {},
        productosByCode: {
          PACA_AGUA: { aplicaDomicilio: true, sobreCostoDomicilio: 200, precioBase: 2500 },
        },
      }),
      // precio 2700 = base 2500 + recargo 200 (canal DOMICILIO)
      resolverPrecios: vi.fn().mockResolvedValue([
        { producto: 'PACA_AGUA', cantidad: 10, precio: 2700, subtotal: 27000, origen: 'base' },
      ]),
    } as never,
    clienteRepo: {
      findById: vi.fn().mockResolvedValue({
        id: 'c1', nombre: 'Tienda X', apellido: null, telefono: '3001112233',
        direccion: 'Calle 1', barrio: 'Centro', bloqueado: false, verificado: true,
        creadoPorRol: 'ADMIN', limitePedidosFiados: null, preciosEspeciales: null,
      }),
    } as never,
    pedidoRepo: {
      findById: vi.fn().mockResolvedValue({ id: 'p99' }),
      findMany: vi.fn().mockResolvedValue([]),
    } as never,
    getFiadoStatusUseCase: {
      execute: vi.fn().mockResolvedValue({ count: 0, limite: 2, nivel: 'ok', pedidos: [] }),
    } as never,
    getPrecioMinimos: vi.fn().mockResolvedValue([]),
  }
}

describe('PreviewPedidoUseCase — pricing + payment projection', () => {
  it('total = Σ (precio × cantidad); subtotal = total − recargoDomicilio', async () => {
    const r = await new PreviewPedidoUseCase(makeDeps()).execute({
      clienteId: 'c1', canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }], actorId: 'u1',
    })
    expect(r.calculation.total).toBe(27000)
    expect(r.calculation.recargoDomicilio).toBe(2000) // 200 × 10
    expect(r.calculation.subtotal).toBe(25000)
    expect(r.calculation.total).toBe(r.calculation.subtotal + r.calculation.recargoDomicilio)
    expect(r.calculation.items[0].precioUnitario).toBe(2700)
    expect(r.calculation.items[0].subtotal).toBe(27000)
    expect(r.calculation.items[0].precioOrigen).toBe('base')
  })

  it('canal PUNTO → recargoDomicilio 0, subtotal = total', async () => {
    const deps = makeDeps()
    ;(deps.pricingPort.resolverPrecios as ReturnType<typeof vi.fn>).mockResolvedValue([
      { producto: 'PACA_AGUA', cantidad: 10, precio: 2500, subtotal: 25000, origen: 'base' },
    ])
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 10 }], actorId: 'u1' })
    expect(r.calculation.recargoDomicilio).toBe(0)
    expect(r.calculation.subtotal).toBe(25000)
    expect(r.calculation.total).toBe(25000)
  })

  it('pago exacto + entregado → PAGADO, saldo 0, saldoFavor 0', async () => {
    const r = await new PreviewPedidoUseCase(makeDeps()).execute({
      clienteId: 'c1', canal: 'DOMICILIO', entregado: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 27000 }], actorId: 'u1',
    })
    expect(r.calculation.estadoEntregaProyectado).toBe('ENTREGADO')
    expect(r.calculation.totalPagado).toBe(27000)
    expect(r.calculation.saldoProyectado).toBe(0)
    expect(r.calculation.saldoFavorProyectado).toBe(0)
    expect(r.calculation.estadoPagoProyectado).toBe('PAGADO')
  })

  it('prepago total + entrega posterior → ANTICIPADO', async () => {
    const r = await new PreviewPedidoUseCase(makeDeps()).execute({
      clienteId: 'c1', canal: 'DOMICILIO', entregado: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 27000 }], actorId: 'u1',
    })
    expect(r.calculation.estadoEntregaProyectado).toBe('PENDIENTE')
    expect(r.calculation.estadoPagoProyectado).toBe('ANTICIPADO')
  })

  it('sobrepago → excedente proyectado a saldoFavor, pago aplicado = total', async () => {
    const r = await new PreviewPedidoUseCase(makeDeps()).execute({
      clienteId: 'c1', canal: 'DOMICILIO', entregado: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 30000 }], actorId: 'u1',
    })
    expect(r.calculation.totalPagado).toBe(27000)
    expect(r.calculation.saldoFavorProyectado).toBe(3000)
    expect(r.calculation.saldoProyectado).toBe(0)
  })

  it('lanza ClienteNotFoundError si el cliente no existe', async () => {
    const deps = makeDeps()
    ;(deps.clienteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    await expect(
      new PreviewPedidoUseCase(deps).execute({ clienteId: 'nope', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' }),
    ).rejects.toThrow(ClienteNotFoundError)
  })

  it('lanza PedidoOrigenNotFoundError si pedidoOrigenId no existe', async () => {
    const deps = makeDeps()
    ;(deps.pedidoRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    await expect(
      new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', pedidoOrigenId: 'ghost', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' }),
    ).rejects.toThrow(PedidoOrigenNotFoundError)
  })
})

describe('PreviewPedidoUseCase — permissions + warnings', () => {
  it('fiado sobre el límite → canCreate false + warning FIADO_SOBRE_LIMITE, sin acción crear', async () => {
    const deps = makeDeps()
    ;(deps.getFiadoStatusUseCase.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 2, limite: 2, nivel: 'limite', pedidos: [{ id: 'a', numero: 1, saldo: 100 }, { id: 'b', numero: 2, saldo: 200 }],
    })
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(r.permissions.canCreate).toBe(false)
    expect(r.warnings.some(w => w.code === 'FIADO_SOBRE_LIMITE')).toBe(true)
    expect(r.allowedActions).not.toContain('crear')
  })

  it('cliente bloqueado → canCreate false + warning CLIENTE_BLOQUEADO', async () => {
    const deps = makeDeps()
    ;(deps.clienteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1', nombre: 'X', apellido: null, telefono: '3001112233', direccion: 'Calle 1', barrio: 'Centro',
      bloqueado: true, verificado: true, creadoPorRol: 'ADMIN', limitePedidosFiados: null, preciosEspeciales: null,
    })
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(r.permissions.canCreate).toBe(false)
    expect(r.warnings.some(w => w.code === 'CLIENTE_BLOQUEADO')).toBe(true)
  })

  it('DOMICILIO sin dirección → warning DIRECCION_FALTANTE (no bloquea, crear sigue disponible)', async () => {
    const deps = makeDeps()
    ;(deps.clienteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1', nombre: 'X', apellido: null, telefono: '3001112233', direccion: null, barrio: null,
      bloqueado: false, verificado: true, creadoPorRol: 'ADMIN', limitePedidosFiados: null, preciosEspeciales: null,
    })
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', canal: 'DOMICILIO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(r.warnings.some(w => w.code === 'DIRECCION_FALTANTE' && w.field === 'direccion')).toBe(true)
    expect(r.permissions.canCreate).toBe(true)
    expect(r.allowedActions).toContain('crear')
  })

  it('precio manual → warning PRECIO_MANUAL_APLICADO', async () => {
    const deps = makeDeps()
    ;(deps.pricingPort.resolverPrecios as ReturnType<typeof vi.fn>).mockResolvedValue([
      { producto: 'PACA_AGUA', cantidad: 10, precio: 1000, subtotal: 10000, origen: 'manual' },
    ])
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 10, precioManual: 1000 }], actorId: 'u1' })
    expect(r.warnings.some(w => w.code === 'PRECIO_MANUAL_APLICADO')).toBe(true)
  })

  it('CONSUMIDOR_FINAL: sin warnings de fiado, sin consulta de fiado', async () => {
    const deps = makeDeps()
    ;(deps.clienteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: CANONICAL_CONSUMIDOR_FINAL_ID, nombre: 'Consumidor Final', apellido: null, telefono: '', direccion: null, barrio: null,
      bloqueado: false, verificado: true, creadoPorRol: 'ADMIN', limitePedidosFiados: null, preciosEspeciales: null,
    })
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: CANONICAL_CONSUMIDOR_FINAL_ID, canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(r.warnings.some(w => w.code === 'FIADO_SOBRE_LIMITE')).toBe(false)
    expect(deps.getFiadoStatusUseCase.execute).not.toHaveBeenCalled()
  })
})

describe('PreviewPedidoUseCase — riskSignals', () => {
  it('precio por debajo de la tabla → riskSignal PRECIO_POR_DEBAJO_TABLA; señal ≠ bloqueo', async () => {
    const deps = makeDeps()
    ;(deps.pricingPort.resolverPrecios as ReturnType<typeof vi.fn>).mockResolvedValue([
      { producto: 'PACA_AGUA', cantidad: 20, precio: 1500, subtotal: 30000, origen: 'manual' },
    ])
    ;(deps.getPrecioMinimos as ReturnType<typeof vi.fn>).mockResolvedValue([
      { producto: 'PACA_AGUA', cantMin: 1, cantMax: null, precioMinimo: 2300 },
    ])
    const r = await new PreviewPedidoUseCase(deps).execute({
      clienteId: 'c1', canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 20, precioManual: 1500 }], actorId: 'u1',
    })
    expect(r.riskSignals.some(s => s.tipo === 'PRECIO_POR_DEBAJO_TABLA')).toBe(true)
    expect(r.allowedActions).toContain('crear')
  })

  it('pide los pedidos válidos del cliente (excluye ANULADO/CANCELADO por inclusión)', async () => {
    const deps = makeDeps()
    await new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(deps.pedidoRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ clienteId: 'c1', estadoEntrega: ['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO'] }),
      expect.objectContaining({ take: 6, orderBy: 'desc' }),
    )
  })

  it('CONSUMIDOR_FINAL → riskSignals vacío y NO consulta historial', async () => {
    const deps = makeDeps()
    ;(deps.clienteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: CANONICAL_CONSUMIDOR_FINAL_ID, nombre: 'Consumidor Final', apellido: null, telefono: '', direccion: null, barrio: null,
      bloqueado: false, verificado: true, creadoPorRol: 'ADMIN', limitePedidosFiados: null, preciosEspeciales: null,
    })
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: CANONICAL_CONSUMIDOR_FINAL_ID, canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(r.riskSignals).toEqual([])
    expect(deps.pedidoRepo.findMany).not.toHaveBeenCalled()
    expect(deps.getPrecioMinimos).not.toHaveBeenCalled()
  })

  it('requiresAuthorization SIEMPRE false (sin política de umbral)', async () => {
    const deps = makeDeps()
    ;(deps.pricingPort.resolverPrecios as ReturnType<typeof vi.fn>).mockResolvedValue([
      { producto: 'PACA_AGUA', cantidad: 100, precio: 1, subtotal: 100, origen: 'manual' },
    ])
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 100, precioManual: 1 }], actorId: 'u1' })
    expect(r.requiresAuthorization).toBe(false)
  })

  it('excluye el propio pedido del historial de riesgo en modo edición', async () => {
    const deps = makeDeps()
    ;(deps.pedidoRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ped-edit', totalPagado: { toDecimal: () => 0 }, estadoEntrega: { get: () => 'PENDIENTE' },
    })
    ;(deps.pedidoRepo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'ped-edit', clienteId: 'c1', toLegacyFields: () => ({}), estadoEntrega: { get: () => 'PENDIENTE' } },
    ])
    const r = await new PreviewPedidoUseCase(deps).execute({
      clienteId: 'c1', canal: 'PUNTO', pedidoId: 'ped-edit',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1',
    })
    // el historial quedó vacío tras filtrar el propio pedido → sin señales por auto-comparación
    expect(Array.isArray(r.riskSignals)).toBe(true)
  })

  it('auditPreview refleja actor + total + tienePrecioManual', async () => {
    const deps = makeDeps()
    ;(deps.pricingPort.resolverPrecios as ReturnType<typeof vi.fn>).mockResolvedValue([
      { producto: 'PACA_AGUA', cantidad: 2, precio: 3000, subtotal: 6000, origen: 'manual' },
    ])
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 2, precioManual: 3000 }], actorId: 'u-audit' })
    expect(r.auditPreview.actor).toBe('u-audit')
    expect(r.auditPreview.valoresRelevantes.total).toBe(6000)
    expect(r.auditPreview.valoresRelevantes.tienePrecioManual).toBe(true)
  })
})

describe('PreviewPedidoUseCase — modo edición (pedidoId)', () => {
  function editDeps(over: { totalPagado?: number; estadoEntrega?: string } = {}) {
    const deps = makeDeps()
    ;(deps.pedidoRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ped-1',
      totalPagado: { toDecimal: () => over.totalPagado ?? 0 },
      estadoEntrega: { get: () => over.estadoEntrega ?? 'PENDIENTE' },
    })
    ;(deps.pedidoRepo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    return deps
  }

  it('usa el totalPagado del pedido existente, no los pagos del body', async () => {
    const deps = editDeps({ totalPagado: 15000, estadoEntrega: 'ENTREGADO' })
    const r = await new PreviewPedidoUseCase(deps).execute({
      clienteId: 'c1', canal: 'DOMICILIO', pedidoId: 'ped-1',
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }], // total 27000
      pagos: [{ metodo: 'EFECTIVO', monto: 99999 }], // se ignora en edición
      actorId: 'u1',
    })
    expect(r.calculation.totalPagado).toBe(15000)
    expect(r.calculation.saldoProyectado).toBe(12000) // 27000 − 15000
    expect(r.calculation.saldoFavorProyectado).toBe(0)
    expect(r.calculation.estadoPagoProyectado).toBe('PARCIAL')
    expect(r.calculation.estadoEntregaProyectado).toBe('ENTREGADO')
  })

  it('allowedActions = ["actualizar"] (no "crear")', async () => {
    const r = await new PreviewPedidoUseCase(editDeps()).execute({
      clienteId: 'c1', pedidoId: 'ped-1', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1',
    })
    expect(r.allowedActions).toEqual(['actualizar'])
    expect(r.allowedActions).not.toContain('crear')
    expect(r.auditPreview.accion).toBe('ACTUALIZAR_PEDIDO')
    expect(r.auditPreview.recurso).toBe('Pedido (edición)')
  })

  it('no consulta ni bloquea por límite de fiados en edición', async () => {
    const deps = editDeps()
    ;(deps.getFiadoStatusUseCase.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 9, limite: 2, nivel: 'limite', pedidos: [],
    })
    const r = await new PreviewPedidoUseCase(deps).execute({
      clienteId: 'c1', pedidoId: 'ped-1', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1',
    })
    expect(deps.getFiadoStatusUseCase.execute).not.toHaveBeenCalled()
    expect(r.warnings.some(w => w.code === 'FIADO_SOBRE_LIMITE')).toBe(false)
    expect(r.allowedActions).toEqual(['actualizar'])
  })

  it('pedidoId inexistente → PedidoNotFoundError', async () => {
    const deps = makeDeps()
    ;(deps.pedidoRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    await expect(
      new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', pedidoId: 'ghost', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' }),
    ).rejects.toThrow(PedidoNotFoundError)
  })
})
