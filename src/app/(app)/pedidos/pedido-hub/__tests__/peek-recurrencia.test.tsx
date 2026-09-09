import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PeekRecurrencia } from '../peek-recurrencia'

const rec = (over: Record<string, unknown> = {}) => ({
  id: 'r1', cadaNDias: 7, canal: 'DOMICILIO', activo: true,
  proximaFecha: '2026-09-15T12:00:00.000Z',
  productos: [{ producto: 'PACA_AGUA', cantidad: 20 }, { producto: 'BOTELLON', cantidad: 0 }],
  ...over,
})

describe('PeekRecurrencia (F8-i)', () => {
  it('sin recurrencia → no renderiza', () => {
    const { container } = render(<PeekRecurrencia recurrencia={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('activa → "Pedido habitual", resumen de productos (>0), cada N días, próximo', () => {
    render(<PeekRecurrencia recurrencia={rec()} />)
    const box = screen.getByTestId('peek-recurrencia')
    expect(box).toHaveAttribute('data-activo', 'true')
    expect(box).toHaveTextContent('Pedido habitual')
    expect(box).toHaveTextContent('20 paca agua')
    expect(box).not.toHaveTextContent('botellon') // cantidad 0 se filtra
    expect(box).toHaveTextContent('cada 7 días')
    expect(box).toHaveTextContent(/próximo/i)
    // nunca la palabra "plantilla"
    expect(box).not.toHaveTextContent(/plantilla/i)
  })

  it('pausada → "(pausado)", sin "próximo"', () => {
    render(<PeekRecurrencia recurrencia={rec({ activo: false })} />)
    const box = screen.getByTestId('peek-recurrencia')
    expect(box).toHaveAttribute('data-activo', 'false')
    expect(box).toHaveTextContent(/pausado/i)
    expect(box).not.toHaveTextContent(/próximo/i)
  })

  it('"Ajustar" solo si onAjustar; dispara el callback (F8-iii lo wirea)', () => {
    const onAjustar = vi.fn()
    const { rerender } = render(<PeekRecurrencia recurrencia={rec()} />)
    expect(screen.queryByTestId('peek-recurrencia-ajustar')).not.toBeInTheDocument()
    rerender(<PeekRecurrencia recurrencia={rec()} onAjustar={onAjustar} />)
    fireEvent.click(screen.getByTestId('peek-recurrencia-ajustar'))
    expect(onAjustar).toHaveBeenCalledOnce()
  })

  it('cadaNDias 1 → "día" singular', () => {
    render(<PeekRecurrencia recurrencia={rec({ cadaNDias: 1 })} />)
    expect(screen.getByTestId('peek-recurrencia')).toHaveTextContent('cada 1 día')
  })
})
