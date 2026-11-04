// @tests #601 — el «?» explica un término y es accesible con teclado y toque.
import { describe, expect, it } from 'vitest'
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
})
