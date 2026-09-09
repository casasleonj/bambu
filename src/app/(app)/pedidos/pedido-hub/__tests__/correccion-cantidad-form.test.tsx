import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/fetch-resilient', () => ({ fetchResilient: vi.fn() }))
import { fetchResilient } from '@/lib/fetch-resilient'
import { CorreccionCantidadForm } from '../correccion-cantidad-form'
import type { Pedido } from '../../pedidos-client/types'

const frMock = vi.mocked(fetchResilient)

const pedido = (over: Partial<Pedido> = {}): Pedido => ({
  id: 'p1', numero: 5, clienteId: 'c1', nombreCli: 'Tienda X', telefonoCli: '', zonaCli: '', barrioCli: '',
  tipo: 'DOMICILIO', canal: 'DOMICILIO', estado: 'PENDIENTE', origen: 'PEDIDO', estadoEntrega: 'PENDIENTE', estadoPago: 'PARCIAL',
  items: [{ producto: 'PACA_AGUA', cantPedido: 12, cantEntrega: 0, precio: 2000, subtotal: 24000 }],
  cPacaAguaPed: 12, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0, cBolsaAguaPed: 0, cBolsaHieloPed: 0,
  cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
  precioPacaAgua: 2000, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
  totalPagado: 5000, total: 24000, saldo: 19000, fecha: '2026-09-08T08:00:00.000Z', ...over,
})

const proy = (over: Record<string, unknown> = {}) => ({
  success: true, producto: 'PACA_AGUA', cantidadOriginal: 12, cantidadEntregada: 0,
  cantidadNueva: 10, delta: -2, precioHistorico: 2000, subtotalAntes: 24000, subtotalDespues: 20000,
  totalAntes: 24000, totalDespues: 20000, totalPagado: 5000, saldoAntes: 19000, saldoDespues: 15000,
  estadoEntrega: 'PENDIENTE', estadoPagoAntes: 'PARCIAL', estadoPagoDespues: 'PARCIAL',
  sobrepagoProyectado: 0, bloqueadoPor: null, warnings: [], allowedActions: ['confirmar-correccion'],
  puedeCorregir: true, ...over,
})

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  frMock.mockReset()
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => proy() }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('CorreccionCantidadForm — G11 rama A (Fase 6-i)', () => {
  it('proyecta al montar y muestra el impacto ANTES de confirmar', async () => {
    render(<CorreccionCantidadForm pedido={pedido()} onCancel={vi.fn()} onMutado={vi.fn()} onIrANuevaDemanda={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('ajuste-impacto')).toBeInTheDocument())
    expect(fetchMock.mock.calls.every((c) => String(c[0]).includes('/preview'))).toBe(true)
  })

  it('confirmar deshabilitado sin motivo; habilitado con motivo + proyección OK', async () => {
    render(<CorreccionCantidadForm pedido={pedido()} onCancel={vi.fn()} onMutado={vi.fn()} onIrANuevaDemanda={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('ajuste-impacto')).toBeInTheDocument())
    expect(screen.getByTestId('correccion-confirmar')).toBeDisabled()
    fireEvent.change(screen.getByTestId('correccion-motivo'), { target: { value: 'eran 10, no 12' } })
    await waitFor(() => expect(screen.getByTestId('correccion-confirmar')).toBeEnabled())
  })

  it('confirmar → llama fetchResilient al commit y a onMutado', async () => {
    frMock.mockResolvedValue({ status: 'ok', statusCode: 201, data: { success: true } })
    const onMutado = vi.fn()
    render(<CorreccionCantidadForm pedido={pedido()} onCancel={vi.fn()} onMutado={onMutado} onIrANuevaDemanda={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('ajuste-impacto')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('correccion-motivo'), { target: { value: 'eran 10' } })
    await waitFor(() => expect(screen.getByTestId('correccion-confirmar')).toBeEnabled())
    fireEvent.click(screen.getByTestId('correccion-confirmar'))
    await waitFor(() => expect(onMutado).toHaveBeenCalled())
    expect(frMock.mock.calls[0][0]).toBe('/api/pedidos/p1/ajustar-cantidad')
  })

  it('guard proyectado SOBRE_CANTIDAD_YA_ENTREGADA → muestra mensaje + botón "Nueva demanda" que NO se dispara solo (P5)', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true, status: 200,
      json: async () => proy({ cantidadEntregada: 4, bloqueadoPor: 'CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA', puedeCorregir: false, allowedActions: ['ir-a-nueva-demanda'] }),
    }))
    const onIrANuevaDemanda = vi.fn()
    render(<CorreccionCantidadForm pedido={pedido({ items: [{ producto: 'PACA_AGUA', cantPedido: 12, cantEntrega: 4, precio: 2000, subtotal: 24000 }] })} onCancel={vi.fn()} onMutado={vi.fn()} onIrANuevaDemanda={onIrANuevaDemanda} />)
    await waitFor(() => expect(screen.getByTestId('correccion-guard-CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA')).toBeInTheDocument())
    // el sistema NO convirtió a nueva demanda automáticamente
    expect(onIrANuevaDemanda).not.toHaveBeenCalled()
    expect(screen.getByTestId('correccion-confirmar')).toBeDisabled()
    // sólo si el usuario hace click explícito
    fireEvent.click(screen.getByTestId('correccion-alt-nueva-demanda'))
    expect(onIrANuevaDemanda).toHaveBeenCalledOnce()
  })

  it('F9-iii: 409 SIN guard reconocido → recovery ("Ver estado actual"), no el mensaje crudo, confirmar bloqueado', async () => {
    frMock.mockResolvedValue({ status: 'error', statusCode: 409, error: 'ESTADO_CAMBIO: el pedido fue modificado' })
    const onMutado = vi.fn()
    render(<CorreccionCantidadForm pedido={pedido()} onCancel={vi.fn()} onMutado={onMutado} onIrANuevaDemanda={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('ajuste-impacto')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('correccion-motivo'), { target: { value: 'bajar' } })
    await waitFor(() => expect(screen.getByTestId('correccion-confirmar')).toBeEnabled())
    fireEvent.click(screen.getByTestId('correccion-confirmar'))
    await waitFor(() => expect(screen.getByTestId('correccion-conflicto')).toBeInTheDocument())
    expect(screen.queryByTestId('correccion-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('correccion-confirmar')).toBeDisabled()
    fireEvent.click(screen.getByTestId('correccion-ver-estado'))
    expect(onMutado).toHaveBeenCalledTimes(1)
  })

  it('guard devuelto por el commit (409) → muestra el mensaje del guard, no aplica, NO auto-convierte', async () => {
    frMock.mockResolvedValue({ status: 'error', statusCode: 409, error: 'CORRECCION_GENERARIA_SOBREPAGO: ...' })
    const onMutado = vi.fn(); const onIrANuevaDemanda = vi.fn()
    render(<CorreccionCantidadForm pedido={pedido()} onCancel={vi.fn()} onMutado={onMutado} onIrANuevaDemanda={onIrANuevaDemanda} />)
    await waitFor(() => expect(screen.getByTestId('ajuste-impacto')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('correccion-motivo'), { target: { value: 'bajar' } })
    await waitFor(() => expect(screen.getByTestId('correccion-confirmar')).toBeEnabled())
    fireEvent.click(screen.getByTestId('correccion-confirmar'))
    await waitFor(() => expect(screen.getByTestId('correccion-guard-CORRECCION_GENERARIA_SOBREPAGO')).toBeInTheDocument())
    // NO se aplicó, NO se convirtió automáticamente en nueva demanda / venta libre / otra operación
    expect(onMutado).not.toHaveBeenCalled()
    expect(onIrANuevaDemanda).not.toHaveBeenCalled()
    expect(screen.queryByTestId('correccion-conflicto')).not.toBeInTheDocument()   // guard ≠ conflicto
    expect(frMock).toHaveBeenCalledTimes(1)   // sin auto-retry
  })
})
