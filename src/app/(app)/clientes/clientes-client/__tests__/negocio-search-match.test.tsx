import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NegocioSearchMatch } from '@/components/negocio-search-match'

describe('NegocioSearchMatch', () => {
  const cliente = {
    id: 'c1',
    negocios: [
      { id: 'n1', nombre: 'La Esquina' },
      { id: 'n2', nombre: 'Esquina Norte' },
      { id: 'n3', nombre: 'Otro' },
    ],
  }

  it('no renderiza nada sin término de búsqueda', () => {
    const { container } = render(
      <NegocioSearchMatch
        cliente={cliente}
        search=""
        onViewNegocio={vi.fn()}
        onViewCliente={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('no renderiza nada si ningún negocio coincide', () => {
    const { container } = render(
      <NegocioSearchMatch
        cliente={cliente}
        search="xyz123"
        onViewNegocio={vi.fn()}
        onViewCliente={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('muestra mensaje para una coincidencia y abre detalle del negocio al click', () => {
    const onViewNegocio = vi.fn()
    render(
      <NegocioSearchMatch
        cliente={cliente}
        search="la esquina"
        onViewNegocio={onViewNegocio}
        onViewCliente={vi.fn()}
      />
    )
    const button = screen.getByText(/Coincide con el negocio:/)
    expect(button).toHaveTextContent('La Esquina')
    fireEvent.click(button)
    expect(onViewNegocio).toHaveBeenCalledTimes(1)
    expect(onViewNegocio).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1', nombre: 'La Esquina' })
    )
  })

  it('muestra conteo para múltiples coincidencias y abre cliente al click', () => {
    const onViewCliente = vi.fn()
    render(
      <NegocioSearchMatch
        cliente={cliente}
        search="esquina"
        onViewNegocio={vi.fn()}
        onViewCliente={onViewCliente}
      />
    )
    const button = screen.getByText('Coincide con 2 negocios')
    fireEvent.click(button)
    expect(onViewCliente).toHaveBeenCalledWith('c1')
  })
})
