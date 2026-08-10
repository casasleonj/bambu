// @tests DireccionIndicator — hace explícito cuando falta dirección, y
// surge linkUbicacion como respaldo cuando no hay texto pero sí hay link.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DireccionIndicator } from '@/components/direccion-indicator'

describe('DireccionIndicator', () => {
  it('no renderiza nada si hay dirección o barrio', () => {
    const { container } = render(<DireccionIndicator direccion="Calle 1" barrio={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra advertencia cuando no hay dirección, barrio ni link', () => {
    render(<DireccionIndicator direccion={null} barrio={null} linkUbicacion={null} />)
    expect(screen.getByText(/Sin dirección registrada/)).toBeInTheDocument()
  })

  it('muestra link de Maps clickeable cuando no hay texto pero sí linkUbicacion', () => {
    render(<DireccionIndicator direccion={null} barrio={null} linkUbicacion="https://maps.app.goo.gl/xyz" />)
    const link = screen.getByRole('link', { name: /Ver ubicación en Maps/ })
    expect(link).toHaveAttribute('href', 'https://maps.app.goo.gl/xyz')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('sinLink=true: muestra el mismo caso como texto plano, no como <a> (evita anidar interactivos)', () => {
    render(<DireccionIndicator direccion={null} barrio={null} linkUbicacion="https://maps.app.goo.gl/xyz" sinLink />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText(/Ubicación disponible/)).toBeInTheDocument()
  })
})
