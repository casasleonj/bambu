import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FocoStrip } from '../foco-strip'
import type { FocoCount } from '../types'

const focos: FocoCount[] = [
  { key: 'porPlanificar', label: 'Por planificar', value: 3, tone: 'amber' },
  { key: 'enRuta', label: 'En ruta', value: 5, tone: 'none' },
  { key: 'esperandoPago', label: 'Esperando pago', value: 8, amount: 120000, tone: 'red' },
  { key: 'pendientesN2', label: 'Pendientes', value: 0, tone: 'none' },
  { key: 'excepciones', label: 'Excepciones', value: 2, tone: 'red' },
]

describe('FocoStrip', () => {
  it('renderiza los 5 focos con su número; esperandoPago muestra el $', () => {
    render(<FocoStrip focos={focos} activeFoco={null} onSelect={vi.fn()} />)
    expect(screen.getByText('Por planificar')).toBeInTheDocument()
    expect(screen.getByText(/120\.000/)).toBeInTheDocument()
  })

  it('un clic en un foco llama onSelect con su key', () => {
    const onSelect = vi.fn()
    render(<FocoStrip focos={focos} activeFoco={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('foco-porPlanificar'))
    expect(onSelect).toHaveBeenCalledWith('porPlanificar')
  })

  it('re-clic en el foco activo deselecciona (onSelect null)', () => {
    const onSelect = vi.fn()
    render(<FocoStrip focos={focos} activeFoco="porPlanificar" onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('foco-porPlanificar'))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('disciplina de color: value 0 → sin color aunque tone lo pida', () => {
    render(<FocoStrip focos={[{ key: 'pendientesN2', label: 'Pendientes', value: 0, tone: 'amber' }]} activeFoco={null} onSelect={vi.fn()} />)
    const num = screen.getByTestId('foco-pendientesN2-value')
    expect(num.className).not.toMatch(/amber|red/)
  })

  it('el foco activo tiene aria-pressed', () => {
    render(<FocoStrip focos={focos} activeFoco="enRuta" onSelect={vi.fn()} />)
    expect(screen.getByTestId('foco-enRuta')).toHaveAttribute('aria-pressed', 'true')
  })
})
