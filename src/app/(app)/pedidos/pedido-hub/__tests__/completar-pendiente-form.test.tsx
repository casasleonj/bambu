import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CompletarPendienteForm } from '../completar-pendiente-form'

const proj = (over: Record<string, unknown> = {}) => ({
  success: true, accion: 'gestionar', remanente: 5,
  diferencial: { valorHistorico: 15000, valorActual: 18000, diferencial: 3000 },
  consecuencia: { pedidoTotalAntes: 76000, pedidoTotalDespues: 79000, pedidoSaldoAntes: 76000, pedidoSaldoDespues: 79000, clienteSaldoFavorAntes: 0, clienteSaldoFavorDespues: 0, tipo: 'cobro_adicional' },
  allowedActions: ['gestionar'], warnings: [],
  ...over,
})

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/preview')) return { ok: true, json: async () => proj() }
    // el commit (fetchResilient hace fetch plano acá)
    return { ok: true, json: async () => ({ success: true, obligacionId: 'o1', actividadId: 'a1', deduped: false }) }
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('CompletarPendienteForm — F5-ii (semántica B: impacto → confirmar)', () => {
  it('proyecta al montar y ante cambios; muestra el impacto ANTES de confirmar', async () => {
    render(<CompletarPendienteForm pedidoId="p1" pedidoCanal="DOMICILIO" producto="PACA_AGUA" remanente={5} onCancel={vi.fn()} onMutado={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('n2-impacto')).toBeInTheDocument())
    expect(screen.getByTestId('n2-impacto-tipo-cobro_adicional')).toBeInTheDocument()
    // llamó al endpoint de proyección, NO al de commit todavía
    expect(fetchMock.mock.calls.every((c) => String(c[0]).includes('/preview'))).toBe(true)
  })

  it('el modo propuesto = canal del pedido, marcado como propuesta (P5)', () => {
    render(<CompletarPendienteForm pedidoId="p1" pedidoCanal="DOMICILIO" producto="PACA_AGUA" remanente={5} onCancel={vi.fn()} onMutado={vi.fn()} />)
    expect(screen.getByTestId('completar-modo-DOMICILIO').className).toContain('blue')
    expect(screen.getByTestId('completar-modo-propuesto')).toHaveTextContent('Propuesto según el pedido original')
  })

  it('confirmar → llama al endpoint de gestión y a onMutado', async () => {
    const onMutado = vi.fn()
    render(<CompletarPendienteForm pedidoId="p1" pedidoCanal="DOMICILIO" producto="PACA_AGUA" remanente={5} onCancel={vi.fn()} onMutado={onMutado} />)
    await waitFor(() => expect(screen.getByTestId('completar-confirmar')).toBeEnabled())
    fireEvent.click(screen.getByTestId('completar-confirmar'))
    await waitFor(() => expect(onMutado).toHaveBeenCalled())
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/gestionar-pendiente'))).toBe(true)
  })

  it('cantidad > remanente → no proyecta, confirmar deshabilitado', async () => {
    render(<CompletarPendienteForm pedidoId="p1" pedidoCanal="DOMICILIO" producto="PACA_AGUA" remanente={5} onCancel={vi.fn()} onMutado={vi.fn()} />)
    fireEvent.change(screen.getByTestId('completar-cantidad'), { target: { value: '99' } })
    await waitFor(() => expect(screen.queryByTestId('n2-impacto')).not.toBeInTheDocument())
    expect(screen.getByTestId('completar-confirmar')).toBeDisabled()
  })

  it('proyección bloqueada (allowedActions vacío) → confirmar deshabilitado', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/preview')) return { ok: true, json: async () => proj({ allowedActions: [], warnings: [{ code: 'OBLIGACION_YA_ACTIVA', message: 'ya hay una' }] }) }
      return { ok: true, json: async () => ({ success: true }) }
    })
    render(<CompletarPendienteForm pedidoId="p1" pedidoCanal="DOMICILIO" producto="PACA_AGUA" remanente={5} onCancel={vi.fn()} onMutado={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('n2-impacto-warnings')).toHaveTextContent('ya hay una'))
    expect(screen.getByTestId('completar-confirmar')).toBeDisabled()
  })

  it('F9-iii: commit 409 de concurrencia → recovery ("Ver estado actual"), NO éxito, NO auto-retry', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/preview')) return { ok: true, json: async () => proj() }
      return { ok: false, status: 409, json: async () => ({ error: { message: 'OBLIGACION_YA_ACTIVA: otra sesión la creó' } }) }
    })
    const onMutado = vi.fn(); const onConflicto = vi.fn()
    render(<CompletarPendienteForm pedidoId="p1" pedidoCanal="DOMICILIO" producto="PACA_AGUA" remanente={5} onCancel={vi.fn()} onMutado={onMutado} onConflicto={onConflicto} />)
    await waitFor(() => expect(screen.getByTestId('completar-confirmar')).toBeEnabled())
    fireEvent.click(screen.getByTestId('completar-confirmar'))

    await waitFor(() => expect(screen.getByTestId('completar-conflicto')).toBeInTheDocument())
    expect(onConflicto).toHaveBeenCalled()
    expect(onMutado).not.toHaveBeenCalled()          // no se trató como éxito
    expect(screen.queryByTestId('completar-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('completar-confirmar')).toBeDisabled()

    // "Ver estado actual" → refresca el contexto (no reintenta el commit)
    const commitsBefore = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/gestionar-pendiente')).length
    fireEvent.click(screen.getByTestId('completar-ver-estado'))
    expect(onMutado).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/gestionar-pendiente')).length).toBe(commitsBefore)
  })

  it('F9-iii: commit 409 de regla de negocio (CANTIDAD_EXCEDE_PENDIENTE) → mensaje contextual, NO recovery', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/preview')) return { ok: true, json: async () => proj() }
      return { ok: false, status: 409, json: async () => ({ error: { message: 'CANTIDAD_EXCEDE_PENDIENTE: quedan 2' } }) }
    })
    render(<CompletarPendienteForm pedidoId="p1" pedidoCanal="DOMICILIO" producto="PACA_AGUA" remanente={5} onCancel={vi.fn()} onMutado={vi.fn()} onConflicto={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('completar-confirmar')).toBeEnabled())
    fireEvent.click(screen.getByTestId('completar-confirmar'))
    await waitFor(() => expect(screen.getByTestId('completar-error')).toHaveTextContent('CANTIDAD_EXCEDE_PENDIENTE'))
    expect(screen.queryByTestId('completar-conflicto')).not.toBeInTheDocument()
  })
})
