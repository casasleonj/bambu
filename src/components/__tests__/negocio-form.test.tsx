// @tests NegocioForm — F4: chips de referencias territoriales insertan en
// Dirección (mismo comportamiento que ClienteForm — una sola experiencia).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NegocioForm } from '../negocio-form'

describe('NegocioForm — F4: chip de referencia inserta en Dirección', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/barrios/b1') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            barrio: { id: 'b1', aliases: [], referencias: [{ id: 'r2', texto: 'Antillana 2' }] },
          }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: false }) })
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pulsar una referencia actualiza el textarea de Dirección, anteponiendo el texto', async () => {
    render(
      <NegocioForm
        open
        onClose={vi.fn()}
        clienteId="c1"
        editData={{
          id: 'n1',
          nombre: 'Tienda X',
          tipoNegocio: 'Tienda',
          direccion: 'Cra 15 # 8-20',
          barrio: 'La Antillana',
          barrioId: 'b1',
          referencia: null,
          linkUbicacion: null,
          horaApertura: null,
          rutaId: null,
        }}
      />,
    )

    const chip = await screen.findByText('Antillana 2')
    fireEvent.click(chip)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Antillana 2, Cra 15 # 8-20')).toBeInTheDocument()
    })
  })

  it('sin Barrio vinculado no muestra chips (formulario sigue siendo válido sin elegir ninguna referencia)', () => {
    render(
      <NegocioForm
        open
        onClose={vi.fn()}
        clienteId="c1"
        editData={{
          id: 'n1',
          nombre: 'Tienda X',
          tipoNegocio: 'Tienda',
          direccion: 'Cra 15 # 8-20',
          barrio: null,
          barrioId: null,
          referencia: null,
          linkUbicacion: null,
          horaApertura: null,
          rutaId: null,
        }}
      />,
    )

    expect(screen.queryByText('Referencias comunes — toca una para agregarla a Dirección')).not.toBeInTheDocument()
  })
})

describe('NegocioForm — #861: errores del API como texto', () => {
  const fetchMock = vi.fn()
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
  afterEach(() => { vi.unstubAllGlobals() })

  const editar = () =>
    render(
      <NegocioForm
        open
        onClose={vi.fn()}
        clienteId="c1"
        editData={{ id: 'n1', nombre: 'Tienda X', tipoNegocio: 'Tienda', direccion: 'Cra 15', barrio: null, barrioId: null, referencia: null, linkUbicacion: null, horaApertura: null, rutaId: null }}
      />,
    )

  it('409 { error: { message } } muestra el mensaje y no rompe la pantalla', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: { message: 'El negocio fue modificado por otro admin. Recarga y vuelve a intentar.' } }),
    })
    editar()
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(await screen.findByText('El negocio fue modificado por otro admin. Recarga y vuelve a intentar.')).toBeInTheDocument()
    // el formulario sigue ahí para reintentar
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument()
  })

  it('400 con formErrors dentro de error muestra el primero', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: { message: 'Datos inválidos', formErrors: ['Lunes: el cierre debe ser después de la apertura'] } }),
    })
    editar()
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(await screen.findByText('Lunes: el cierre debe ser después de la apertura')).toBeInTheDocument()
  })

  it('sin mensaje utilizable cae al texto genérico', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ success: false, error: {} }) })
    editar()
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(await screen.findByText('Error al guardar')).toBeInTheDocument()
  })
})
