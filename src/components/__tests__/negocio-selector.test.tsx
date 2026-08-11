// @tests NegocioSelector — colapso de destino para eliminar ruido visual.
//
// Antes: el selector mostraba SIEMPRE todas las opciones (domicilio
// principal + cada negocio) simultáneamente, y pedido-form-unified repetía
// la misma decisión en un banner aparte ("Envío a domicilio del cliente" /
// "Envío a sucursal"). Resultado: la misma dirección aparecía 2-3 veces en
// pantalla al mismo tiempo. Fix: colapsar a un resumen de una sola línea con
// el destino ya elegido + botón "Cambiar" para reabrir la lista completa.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NegocioSelector } from '@/components/negocio-selector'

const fetchMock = vi.fn()

const negociosResponse = {
  success: true,
  data: [
    { id: 'neg-1', nombre: 'Tienda Centro', tipoNegocio: 'Tienda', direccion: 'Cra 10 #20-30', barrio: 'Centro', ruta: null },
    { id: 'neg-2', nombre: 'Bodega Norte', tipoNegocio: 'Bodega', direccion: 'Cll 50 #5-05', barrio: 'Norte', ruta: null },
  ],
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, json: async () => negociosResponse })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('NegocioSelector — resumen colapsado', () => {
  it('arranca colapsado mostrando solo el destino activo (domicilio principal)', async () => {
    render(
      <NegocioSelector
        clienteId="cli-1"
        clienteNombre="Juan Pérez"
        clienteDireccion="Calle 1"
        clienteBarrio="Barrio A"
        selectedNegocioId={null}
        onNegocioSelected={vi.fn()}
      />,
    )

    const resumen = await screen.findByTestId('negocio-selector-resumen')
    expect(resumen).toHaveTextContent('Juan Pérez')
    expect(resumen).toHaveTextContent('domicilio principal')
    expect(resumen).toHaveTextContent('Calle 1')

    // La lista completa (con el otro/los otros negocios) NO está visible.
    expect(screen.queryByText('Tienda Centro')).not.toBeInTheDocument()
    expect(screen.queryByText('Bodega Norte')).not.toBeInTheDocument()
  })

  it('arranca colapsado mostrando solo el negocio ya seleccionado, sin repetir el domicilio del cliente', async () => {
    render(
      <NegocioSelector
        clienteId="cli-1"
        clienteNombre="Juan Pérez"
        clienteDireccion="Calle 1"
        clienteBarrio="Barrio A"
        selectedNegocioId="neg-1"
        onNegocioSelected={vi.fn()}
      />,
    )

    const resumen = await screen.findByTestId('negocio-selector-resumen')
    expect(resumen).toHaveTextContent('Tienda Centro')
    expect(resumen).toHaveTextContent('Cra 10 #20-30')

    // La dirección del cliente (domicilio principal) no debe verse dos veces.
    expect(screen.queryByText('Calle 1')).not.toBeInTheDocument()
  })

  it('"Cambiar" expande la lista completa; elegir una opción vuelve a colapsar', async () => {
    const onNegocioSelected = vi.fn()
    render(
      <NegocioSelector
        clienteId="cli-1"
        clienteNombre="Juan Pérez"
        clienteDireccion="Calle 1"
        clienteBarrio="Barrio A"
        selectedNegocioId={null}
        onNegocioSelected={onNegocioSelected}
      />,
    )

    const resumen = await screen.findByTestId('negocio-selector-resumen')
    fireEvent.click(resumen)

    expect(await screen.findByText('Tienda Centro')).toBeInTheDocument()
    expect(screen.getByText('Bodega Norte')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Tienda Centro'))
    expect(onNegocioSelected).toHaveBeenCalledWith('neg-1', { direccion: 'Cra 10 #20-30', barrio: 'Centro' })

    // Tras elegir, vuelve a colapsarse (ya no se ve la lista completa).
    await waitFor(() => {
      expect(screen.queryByText('Bodega Norte')).not.toBeInTheDocument()
    })
  })

  it('readOnly: el resumen no es interactivo — click no expande la lista', async () => {
    const onNegocioSelected = vi.fn()
    render(
      <NegocioSelector
        clienteId="cli-1"
        clienteNombre="Juan Pérez"
        clienteDireccion="Calle 1"
        clienteBarrio="Barrio A"
        selectedNegocioId="neg-1"
        onNegocioSelected={onNegocioSelected}
        readOnly
      />,
    )

    const resumen = await screen.findByTestId('negocio-selector-resumen')
    expect(resumen).toHaveTextContent('Tienda Centro')
    expect(resumen).toBeDisabled()
    expect(resumen).not.toHaveTextContent('Cambiar')

    fireEvent.click(resumen)
    expect(screen.queryByText('Bodega Norte')).not.toBeInTheDocument()
    expect(onNegocioSelected).not.toHaveBeenCalled()
  })

  it('no renderiza nada si el cliente no tiene negocios formales', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [] }) })
    const { container } = render(
      <NegocioSelector
        clienteId="cli-2"
        clienteNombre="Sin Negocios"
        clienteDireccion={null}
        clienteBarrio={null}
        selectedNegocioId={null}
        onNegocioSelected={vi.fn()}
      />,
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
