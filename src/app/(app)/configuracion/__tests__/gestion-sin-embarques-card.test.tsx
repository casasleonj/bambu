// TEMPORAL-SIN-EMBARQUE(#472): la tarjeta del interruptor renderizada de verdad, con la red simulada.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GestionSinEmbarquesCard } from '../gestion-sin-embarques-card'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
const mockFetch = vi.fn()

const ENCENDIDA = { activa: true, cambio: { fecha: '2026-10-26T11:43:00.000Z', por: 'admin' } }
const APAGADA = { activa: false, cambio: null }
const respuesta = (ok: boolean, json: unknown = {}) => ({ ok, json: async () => json })
const cuerpo = () => JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body) as Record<string, unknown>

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe('GestionSinEmbarquesCard', () => {
  it('muestra el estado y el último cambio con quién y cuándo', () => {
    render(<GestionSinEmbarquesCard inicial={ENCENDIDA} />)
    expect(screen.getByTestId('gse-estado')).toHaveTextContent('Encendido')
    expect(screen.getByTestId('gse-interruptor')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('gse-ultimo-cambio')).toHaveTextContent(/Encendido por admin el 26 de oct, 6:43/)
  })

  it('apagar pide confirmación y no cambia nada hasta confirmar', async () => {
    mockFetch.mockResolvedValueOnce(respuesta(true))
    render(<GestionSinEmbarquesCard inicial={ENCENDIDA} />)
    fireEvent.click(screen.getByTestId('gse-interruptor'))
    expect(screen.getByTestId('gse-confirmar')).toBeInTheDocument()
    expect(screen.getByText(/desaparecen de la ficha/)).toBeInTheDocument()
    expect(screen.getByText(/Se conserva todo lo ya registrado/)).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('gse-confirmar-apagar'))
    await waitFor(() => expect(screen.getByTestId('gse-estado')).toHaveTextContent('Apagado'))
    expect(cuerpo()).toEqual({ clave: 'GESTION_ADMIN_SIN_EMBARQUE', valor: 'false' })
    expect(screen.queryByTestId('gse-confirmar')).toBeNull()
    expect(toast.success).toHaveBeenCalledWith('Gestión sin embarques apagada')
  })

  it('cancelar la confirmación deja todo encendido y sin llamar al servidor', () => {
    render(<GestionSinEmbarquesCard inicial={ENCENDIDA} />)
    fireEvent.click(screen.getByTestId('gse-interruptor'))
    fireEvent.click(screen.getByText('Cancelar'))
    expect(screen.queryByTestId('gse-confirmar')).toBeNull()
    expect(screen.getByTestId('gse-estado')).toHaveTextContent('Encendido')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('encender NO pide confirmación y guarda «true»', async () => {
    mockFetch.mockResolvedValueOnce(respuesta(true))
    render(<GestionSinEmbarquesCard inicial={APAGADA} usuarioActual="admin" />)
    expect(screen.getByTestId('gse-ultimo-cambio')).toHaveTextContent('Sin cambios registrados todavía.')
    expect(screen.getByText(/Al/, { selector: 'p' })).toBeInTheDocument() // aviso de qué habilita
    fireEvent.click(screen.getByTestId('gse-interruptor'))
    await waitFor(() => expect(screen.getByTestId('gse-estado')).toHaveTextContent('Encendido'))
    expect(cuerpo()).toEqual({ clave: 'GESTION_ADMIN_SIN_EMBARQUE', valor: 'true' })
    expect(screen.queryByTestId('gse-confirmar')).toBeNull()
    expect(screen.getByTestId('gse-ultimo-cambio')).toHaveTextContent(/Encendido por admin/)
  })

  it('si el servidor rechaza, el interruptor vuelve a su posición y se avisa', async () => {
    mockFetch.mockResolvedValueOnce(respuesta(false, { error: { message: 'No tienes permiso' } }))
    render(<GestionSinEmbarquesCard inicial={APAGADA} />)
    fireEvent.click(screen.getByTestId('gse-interruptor'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No tienes permiso'))
    expect(screen.getByTestId('gse-estado')).toHaveTextContent('Apagado')
    expect(screen.getByTestId('gse-interruptor')).toHaveAttribute('aria-checked', 'false')
  })

  it('sin conexión también vuelve a su posición', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<GestionSinEmbarquesCard inicial={ENCENDIDA} />)
    fireEvent.click(screen.getByTestId('gse-interruptor'))
    fireEvent.click(screen.getByTestId('gse-confirmar-apagar'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('No hay conexión')))
    expect(screen.getByTestId('gse-estado')).toHaveTextContent('Encendido')
  })
})
