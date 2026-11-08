// @tests #601 — el «?» explica un término y es accesible con teclado y toque.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AyudaTermino } from '../ayuda-termino'

describe('AyudaTermino', () => {
  it('se abre al tocarlo, enlaza la explicación y se cierra con Escape', () => {
    render(<AyudaTermino texto="Es el efectivo con el que empezó el día." />)
    const boton = screen.getByRole('button', { name: 'Qué significa' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.click(boton)
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Es el efectivo con el que empezó el día.')
    expect(boton).toHaveAttribute('aria-describedby', tip.id)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('tocar fuera lo cierra', () => {
    render(<div><AyudaTermino texto="Texto" /><p>fuera</p></div>)
    fireEvent.click(screen.getByRole('button', { name: 'Qué significa' }))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByText('fuera'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('#696: con disparador se toca ese texto (no el «?»), conserva su nombre y respeta los saltos de línea', () => {
    render(<AyudaTermino disparador="Pedido #1285" texto={'Pedido #1285\nFactura F-00231'} />)
    expect(screen.queryByText('?')).not.toBeInTheDocument()
    const boton = screen.getByRole('button', { name: 'Pedido #1285' })
    fireEvent.click(boton)
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Factura F-00231')
    expect(tip.className).toContain('whitespace-pre-line')
    expect(boton).toHaveAttribute('aria-describedby', tip.id)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('#696: sin disparador sigue siendo el «?» de siempre', () => {
    render(<AyudaTermino texto="Explicación" />)
    expect(screen.getByRole('button', { name: 'Qué significa' })).toHaveTextContent('?')
  })

  it('#696: con disparador, pasar el cursor lo abre y el clic lo deja fijo (no lo cierra); otro clic lo cierra', () => {
    render(<AyudaTermino disparador="Pedido #1285" texto="Factura F-00231" />)
    const boton = screen.getByRole('button', { name: 'Pedido #1285' })
    fireEvent.mouseEnter(boton.parentElement as HTMLElement)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.click(boton)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.mouseLeave(boton.parentElement as HTMLElement)
    expect(screen.getByRole('tooltip')).toBeInTheDocument() // fijo: salir con el cursor no lo cierra
    fireEvent.click(boton)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('#696: con disparador, sin clic el recuadro se cierra al salir con el cursor', () => {
    render(<AyudaTermino disparador="Pedido #1285" texto="Factura F-00231" />)
    const boton = screen.getByRole('button', { name: 'Pedido #1285' })
    fireEvent.mouseEnter(boton.parentElement as HTMLElement)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.mouseLeave(boton.parentElement as HTMLElement)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('#696: el «?» de siempre conserva su comportamiento (el clic alterna)', () => {
    render(<AyudaTermino texto="Explicación" />)
    const boton = screen.getByRole('button', { name: 'Qué significa' })
    fireEvent.mouseEnter(boton.parentElement as HTMLElement)
    fireEvent.click(boton)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('#696: Escape cierra solo la ayuda y no llega a otros manejadores de Escape (el panel de abajo)', () => {
    const panel = vi.fn()
    document.addEventListener('keydown', panel)
    render(<AyudaTermino texto="Explicación" />)
    fireEvent.click(screen.getByRole('button', { name: 'Qué significa' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Qué significa' }), { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(panel).not.toHaveBeenCalled()
    // Sin ayuda abierta, Escape sí llega al panel.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(panel).toHaveBeenCalledTimes(1)
    document.removeEventListener('keydown', panel)
  })

  it('#696: con disparador, si el recuadro se sale del borde derecho se corre lo justo para caber', () => {
    const real = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      return this.getAttribute('role') === 'tooltip'
        ? ({ left: window.innerWidth - 200, right: window.innerWidth + 56, width: 256, height: 40, top: 0, bottom: 40, x: 0, y: 0, toJSON() {} } as DOMRect)
        : real.call(this)
    }
    try {
      render(<AyudaTermino disparador="Pedido #1" texto="Factura F-1" />)
      fireEvent.click(screen.getByRole('button', { name: 'Pedido #1' }))
      expect(screen.getByRole('tooltip').style.transform).toBe('translateX(-64px)')
    } finally {
      HTMLElement.prototype.getBoundingClientRect = real
    }
  })
})
