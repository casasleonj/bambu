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
