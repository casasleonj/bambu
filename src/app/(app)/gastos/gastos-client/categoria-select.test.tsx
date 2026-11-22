import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CategoriaGastoSelect } from './categoria-select'

afterEach(() => cleanup())

describe('selector de categorías de Gastos #973', () => {
  it('busca sin distinguir acentos ni mayúsculas', () => {
    render(<CategoriaGastoSelect value="" onChange={vi.fn()} options={['TRANSPORTE', 'LIMPIEZA']} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'limpieza' } })
    expect(screen.getByRole('option', { name: 'Limpieza' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Transporte' })).toBeNull()
  })

  it('permite seleccionar una categoría existente con el teclado', () => {
    const onChange = vi.fn()
    render(<CategoriaGastoSelect value="" onChange={onChange} options={['INSUMOS']} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'insu' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('INSUMOS')
  })

  it('propone agregar una categoría inexistente y la normaliza', () => {
    const onChange = vi.fn()
    render(<CategoriaGastoSelect value="" onChange={onChange} options={['INSUMOS']} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '  Gasólina  ' } })
    fireEvent.click(screen.getByRole('option', { name: /Agregar categoría/ }))
    expect(onChange).toHaveBeenCalledWith('GASOLINA')
  })

  it('no permite agregar Nómina ni un duplicado normalizado', () => {
    render(<CategoriaGastoSelect value="" onChange={vi.fn()} options={['GASOLINA']} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'nómina' } })
    expect(screen.queryByRole('option', { name: /Agregar categoría/ })).toBeNull()
    expect(screen.getByText(/se administran en Nómina/)).toBeTruthy()
    fireEvent.change(input, { target: { value: ' gasolina ' } })
    expect(screen.queryByRole('option', { name: /Agregar categoría/ })).toBeNull()
    expect(screen.getByRole('option', { name: 'Gasolina' })).toBeTruthy()
  })

  it('Escape solo cierra el desplegable', () => {
    const onChange = vi.fn()
    render(<CategoriaGastoSelect value="" onChange={onChange} options={['ARRIENDO']} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    expect(input.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(onChange).not.toHaveBeenCalled()
  })
})
