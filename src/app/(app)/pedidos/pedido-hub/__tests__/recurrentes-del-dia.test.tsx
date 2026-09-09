import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) } }))

import { RecurrentesDelDia } from '../recurrentes-del-dia'

const item = (over: Record<string, unknown> = {}) => ({
  recurrenteId: 'r1', clienteNombre: 'Tienda X', cadaNDias: 7, proximaFecha: '2026-09-08',
  clienteBloqueado: false, esDomingo: false, cumpleMinimo: true,
  sugerencias: [
    { tipo: 'NORMAL', label: 'Generar 20 pacas', descripcion: '' },
    { tipo: 'CON_PENDIENTES', label: 'Incluir pendientes', descripcion: '' },
    { tipo: 'SALTAR', label: 'Saltar', descripcion: '' },
  ],
  ...over,
})

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  toastSuccess.mockReset(); toastError.mockReset()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('RecurrentesDelDia (F8-iv)', () => {
  it('sin recurrencias pendientes → no renderiza (CTA contextual, Q3)', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ success: true, preview: [] }) })
    const { container } = render(<RecurrentesDelDia />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('con pendientes → CTA "N pedidos habituales listos para generar hoy"', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ success: true, preview: [item(), item({ recurrenteId: 'r2', clienteNombre: 'Y' })] }) })
    render(<RecurrentesDelDia />)
    await waitFor(() => expect(screen.getByTestId('recurrentes-del-dia-cta')).toHaveTextContent('2 pedidos habituales listos para generar hoy'))
  })

  it('abrir → panel con una decisión por recurrencia (el sistema prepara, el usuario decide)', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ success: true, preview: [item()] }) })
    render(<RecurrentesDelDia />)
    await waitFor(() => screen.getByTestId('recurrentes-del-dia-cta'))
    fireEvent.click(screen.getByTestId('recurrentes-del-dia-cta'))
    expect(screen.getByTestId('recurrentes-del-dia-panel')).toBeInTheDocument()
    expect(screen.getByTestId('recurrente-item-r1-decision')).toBeInTheDocument()
    // default NORMAL cuando cumpleMinimo
    expect((screen.getByTestId('recurrente-item-r1-decision') as HTMLSelectElement).value).toBe('NORMAL')
  })

  it('avisos: cliente bloqueado / domingo / <3 productos → por defecto SALTAR', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ success: true, preview: [item({ cumpleMinimo: false, esDomingo: true })] }) })
    render(<RecurrentesDelDia />)
    await waitFor(() => screen.getByTestId('recurrentes-del-dia-cta'))
    fireEvent.click(screen.getByTestId('recurrentes-del-dia-cta'))
    expect(screen.getByTestId('recurrente-item-r1-aviso')).toHaveTextContent(/domingo|3 productos/i)
    expect((screen.getByTestId('recurrente-item-r1-decision') as HTMLSelectElement).value).toBe('SALTAR')
  })

  it('generar → POST /api/pedidos/recurrentes con decisiones + offlineId; toast con generados/saltados', async () => {
    fetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') return { json: async () => ({ success: true, generados: 1, saltados: 0 }) }
      return { json: async () => ({ success: true, preview: [item()] }) }
    })
    const onGenerado = vi.fn()
    render(<RecurrentesDelDia onGenerado={onGenerado} />)
    await waitFor(() => screen.getByTestId('recurrentes-del-dia-cta'))
    fireEvent.click(screen.getByTestId('recurrentes-del-dia-cta'))
    fireEvent.click(screen.getByTestId('recurrentes-del-dia-generar'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('1 generado, 0 saltados'))
    const postCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')!
    const body = JSON.parse(postCall[1].body)
    expect(body.decisiones).toEqual([{ recurrenteId: 'r1', decision: 'NORMAL' }])
    expect(typeof body.offlineId).toBe('string')
    expect(onGenerado).toHaveBeenCalled()
  })

  it('cambiar una decisión a SALTAR → se manda esa decisión (no generación silenciosa)', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') return { json: async () => ({ success: true, generados: 0, saltados: 1 }) }
      return { json: async () => ({ success: true, preview: [item()] }) }
    })
    render(<RecurrentesDelDia />)
    await waitFor(() => screen.getByTestId('recurrentes-del-dia-cta'))
    fireEvent.click(screen.getByTestId('recurrentes-del-dia-cta'))
    fireEvent.change(screen.getByTestId('recurrente-item-r1-decision'), { target: { value: 'SALTAR' } })
    fireEvent.click(screen.getByTestId('recurrentes-del-dia-generar'))
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')!
      expect(JSON.parse(postCall[1].body).decisiones[0].decision).toBe('SALTAR')
    })
  })

  it('POST 409 (preview stale) → toast.error, no rompe', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') return { json: async () => ({ success: false, error: { message: 'Recarga el preview' } }) }
      return { json: async () => ({ success: true, preview: [item()] }) }
    })
    render(<RecurrentesDelDia />)
    await waitFor(() => screen.getByTestId('recurrentes-del-dia-cta'))
    fireEvent.click(screen.getByTestId('recurrentes-del-dia-cta'))
    fireEvent.click(screen.getByTestId('recurrentes-del-dia-generar'))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Recarga el preview'))
  })

  it('nunca la palabra "plantilla"', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ success: true, preview: [item()] }) })
    render(<RecurrentesDelDia />)
    await waitFor(() => screen.getByTestId('recurrentes-del-dia-cta'))
    fireEvent.click(screen.getByTestId('recurrentes-del-dia-cta'))
    expect(screen.getByTestId('recurrentes-del-dia-panel')).not.toHaveTextContent(/plantilla/i)
  })
})
