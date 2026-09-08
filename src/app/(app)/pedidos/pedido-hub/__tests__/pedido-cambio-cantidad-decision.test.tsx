import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PedidoCambioCantidadDecision } from '../pedido-cambio-cantidad-decision'

describe('PedidoCambioCantidadDecision — punto de decisión G11 (P1/P2/P9)', () => {
  it('ofrece exactamente dos opciones: corrección y nueva demanda', () => {
    render(<PedidoCambioCantidadDecision onElegir={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByTestId('cambio-causa-correccion')).toBeInTheDocument()
    expect(screen.getByTestId('cambio-causa-nueva-demanda')).toBeInTheDocument()
  })

  it('NO ofrece Venta Libre ni una tercera opción de creación', () => {
    render(<PedidoCambioCantidadDecision onElegir={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByText(/venta libre/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/venta durante la ruta/i)).not.toBeInTheDocument()
  })

  it('NO hay opción "no sé" ni "continuar sin decidir" — sólo ayuda que explica', () => {
    render(<PedidoCambioCantidadDecision onElegir={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByTestId('cambio-decision-ayuda')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('cambio-decision-ayuda-toggle'))
    const ayuda = screen.getByTestId('cambio-decision-ayuda')
    expect(ayuda).toHaveTextContent(/distinción es necesaria/i)
    expect(ayuda).toHaveTextContent(/No hay una[\s\S]*tercera opción/i)
    // el toggle no es un botón de "continuar"
    expect(screen.queryByRole('button', { name: /continuar/i })).not.toBeInTheDocument()
  })

  it('elegir corrección → emite "correccion"', () => {
    const onElegir = vi.fn()
    render(<PedidoCambioCantidadDecision onElegir={onElegir} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('cambio-causa-correccion'))
    expect(onElegir).toHaveBeenCalledWith('correccion')
  })

  it('elegir nueva demanda → emite "nueva-demanda"', () => {
    const onElegir = vi.fn()
    render(<PedidoCambioCantidadDecision onElegir={onElegir} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('cambio-causa-nueva-demanda'))
    expect(onElegir).toHaveBeenCalledWith('nueva-demanda')
  })

  it('no hay opción preseleccionada por defecto (ambos botones simétricos)', () => {
    render(<PedidoCambioCantidadDecision onElegir={vi.fn()} onCancel={vi.fn()} />)
    const a = screen.getByTestId('cambio-causa-correccion')
    const b = screen.getByTestId('cambio-causa-nueva-demanda')
    expect(a.className).toBe(b.className)
    expect(a).not.toHaveAttribute('aria-pressed')
  })
})
