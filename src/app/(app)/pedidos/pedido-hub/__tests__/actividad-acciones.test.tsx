import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ActividadAcciones } from '../actividad-acciones'

const projLiberar = (over: Record<string, unknown> = {}) => ({
  success: true, accion: 'liberar',
  reversion: { montoRevertible: 3000, saldoFavorNoRevertido: 2000 },
  consecuencia: {
    pedidoTotalAntes: 79000, pedidoTotalDespues: 76000,
    pedidoSaldoAntes: 79000, pedidoSaldoDespues: 76000,
    clienteSaldoFavorAntes: 2000, clienteSaldoFavorDespues: 2000,
    tipo: 'reversion_parcial',
  },
  allowedActions: ['liberar'], warnings: [],
  ...over,
})
const projCambiarModo = () => ({
  success: true, accion: 'cambiar-modo',
  diferencial: { valorHistorico: 10000, valorActual: 11000, diferencial: 1000 },
  reversion: { montoRevertible: 3000, saldoFavorNoRevertido: 0 },
  consecuencia: {
    pedidoTotalAntes: 79000, pedidoTotalDespues: 77000,
    pedidoSaldoAntes: 79000, pedidoSaldoDespues: 77000,
    clienteSaldoFavorAntes: 0, clienteSaldoFavorDespues: 0,
    tipo: 'cobro_adicional',
  },
  allowedActions: ['cambiar-modo'], warnings: [],
})

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
    if (url.includes('/preview')) {
      const body = init?.body ? JSON.parse(init.body) : {}
      return { ok: true, json: async () => (body.accion === 'liberar' ? projLiberar() : projCambiarModo()) }
    }
    return { ok: true, json: async () => ({ success: true, obligacionAnulada: true, montoRevertido: 3000, deduped: false }) }
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('ActividadAcciones — liberar (F5-iii, P3)', () => {
  it('muestra la reversión: cuánto se revierte + qué PERMANECE (negativo no revertido)', async () => {
    render(<ActividadAcciones pedidoId="p1" actividadId="a1" modoActual="DOMICILIO" accion="liberar" onCancel={vi.fn()} onMutado={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('n2-impacto-reversion')).toBeInTheDocument())
    expect(screen.getByTestId('n2-impacto-reversion')).toHaveTextContent(/\$3.000/)
    expect(screen.getByTestId('n2-impacto-no-revertido')).toHaveTextContent(/permanecen/)
    expect(screen.getByTestId('n2-impacto-tipo-reversion_parcial')).toBeInTheDocument()
  })

  it('motivo obligatorio: sin motivo → Liberar deshabilitado; con motivo → habilitado', async () => {
    render(<ActividadAcciones pedidoId="p1" actividadId="a1" modoActual="DOMICILIO" accion="liberar" onCancel={vi.fn()} onMutado={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('n2-impacto')).toBeInTheDocument())
    expect(screen.getByTestId('actividad-confirmar')).toBeDisabled()
    fireEvent.change(screen.getByTestId('liberar-motivo'), { target: { value: 'el cliente canceló el resto' } })
    expect(screen.getByTestId('actividad-confirmar')).toBeEnabled()
  })

  it('confirmar → POST liberar + onMutado', async () => {
    const onMutado = vi.fn()
    render(<ActividadAcciones pedidoId="p1" actividadId="a1" modoActual="DOMICILIO" accion="liberar" onCancel={vi.fn()} onMutado={onMutado} />)
    await waitFor(() => expect(screen.getByTestId('n2-impacto')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('liberar-motivo'), { target: { value: 'motivo x' } })
    fireEvent.click(screen.getByTestId('actividad-confirmar'))
    await waitFor(() => expect(onMutado).toHaveBeenCalled())
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/liberar'))).toBe(true)
  })

  it('F9-iii: commit 409 ACTIVIDAD_NO_MODIFICABLE → recovery, no éxito, onConflicto disparado', async () => {
    fetchMock.mockImplementation(async (url: string, init?: { body?: string }) => {
      if (url.includes('/preview')) {
        const body = init?.body ? JSON.parse(init.body) : {}
        return { ok: true, json: async () => (body.accion === 'liberar' ? projLiberar() : projCambiarModo()) }
      }
      return { ok: false, status: 409, json: async () => ({ error: { message: 'ACTIVIDAD_NO_MODIFICABLE: ya está cancelada' } }) }
    })
    const onMutado = vi.fn(); const onConflicto = vi.fn()
    render(<ActividadAcciones pedidoId="p1" actividadId="a1" modoActual="DOMICILIO" accion="liberar" onCancel={vi.fn()} onMutado={onMutado} onConflicto={onConflicto} />)
    await waitFor(() => expect(screen.getByTestId('n2-impacto')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('liberar-motivo'), { target: { value: 'motivo x' } })
    fireEvent.click(screen.getByTestId('actividad-confirmar'))

    await waitFor(() => expect(screen.getByTestId('actividad-conflicto')).toBeInTheDocument())
    expect(onConflicto).toHaveBeenCalled()
    expect(onMutado).not.toHaveBeenCalled()
    expect(screen.queryByTestId('actividad-error')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('actividad-ver-estado'))
    expect(onMutado).toHaveBeenCalledTimes(1)
  })
})

describe('ActividadAcciones — cambiar modo (F5-iii, P3)', () => {
  it('propone el modo contrario; muestra reversión del anterior + nuevo diferencial', async () => {
    render(<ActividadAcciones pedidoId="p1" actividadId="a1" modoActual="DOMICILIO" accion="cambiar-modo" onCancel={vi.fn()} onMutado={vi.fn()} />)
    expect(screen.getByTestId('actividad-modo-PUNTO').className).toContain('blue') // contrario a DOMICILIO
    await waitFor(() => expect(screen.getByTestId('n2-impacto')).toBeInTheDocument())
    expect(screen.getByTestId('n2-impacto-reversion')).toHaveTextContent(/\$3.000/)
    expect(screen.getByTestId('n2-impacto')).toHaveTextContent(/79.000.*77.000|77.000/)
  })

  it('cambiar el modo destino re-proyecta', async () => {
    render(<ActividadAcciones pedidoId="p1" actividadId="a1" modoActual="DOMICILIO" accion="cambiar-modo" onCancel={vi.fn()} onMutado={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('n2-impacto')).toBeInTheDocument())
    const before = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/preview')).length
    fireEvent.click(screen.getByTestId('actividad-modo-DOMICILIO'))
    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/preview')).length).toBeGreaterThan(before))
  })
})
