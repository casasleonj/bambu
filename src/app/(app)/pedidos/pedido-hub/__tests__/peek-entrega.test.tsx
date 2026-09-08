import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PeekEntrega } from '../peek-entrega'

describe('PeekEntrega (Fase 7-ii)', () => {
  it('null → no renderiza', () => {
    const { container } = render(<PeekEntrega entrega={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('con coords → link a Maps que abre en pestaña nueva', () => {
    render(<PeekEntrega entrega={{ fecha: '2026-09-08T13:40:00.000Z', gpsLat: 4.65, gpsLng: -74.05, fotoUrl: null }} />)
    const link = screen.getByTestId('peek-entrega-ubicacion')
    expect(link).toHaveAttribute('href', 'https://www.google.com/maps?q=4.65,-74.05')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('sin coords → sin link de ubicación', () => {
    render(<PeekEntrega entrega={{ fecha: '2026-09-08T13:40:00.000Z', gpsLat: null, gpsLng: null, fotoUrl: null }} />)
    expect(screen.queryByTestId('peek-entrega-ubicacion')).not.toBeInTheDocument()
    expect(screen.getByTestId('peek-entrega-fecha')).toBeInTheDocument()
  })

  it('con foto → link a la foto', () => {
    render(<PeekEntrega entrega={{ fecha: null, gpsLat: null, gpsLng: null, fotoUrl: 'https://cdn/x.jpg' }} />)
    expect(screen.getByTestId('peek-entrega-foto')).toHaveAttribute('href', 'https://cdn/x.jpg')
  })

  it('fecha inválida → no rompe, sin línea de fecha', () => {
    render(<PeekEntrega entrega={{ fecha: 'no-es-fecha', gpsLat: 1, gpsLng: 2, fotoUrl: null }} />)
    expect(screen.queryByTestId('peek-entrega-fecha')).not.toBeInTheDocument()
    expect(screen.getByTestId('peek-entrega-ubicacion')).toBeInTheDocument()
  })
})
