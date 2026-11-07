// @tests #624 — el conteo del efectivo incluye la moneda de $1.000 con subtotal automático.
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ArqueoCaja, { DENOMINACIONES } from '../arqueo-caja'

describe('conteo del efectivo: moneda de $1.000 (#624)', () => {
  it('está en la lista de denominaciones como moneda y es la mayor de las monedas', () => {
    const monedas = DENOMINACIONES.filter((d) => d.tipo === 'MONEDA').map((d) => d.valor)
    expect(monedas).toEqual([1000, 500, 200, 100, 50])
    expect(DENOMINACIONES.find((d) => d.valor === 1000)?.label).toBe('$1.000')
  })

  it('sumar monedas de $1.000 muestra su subtotal y entra al total contado y a la diferencia', () => {
    const onChange = vi.fn()
    render(<ArqueoCaja efectivoEsperado={7000} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Contar Efectivo Físico' }))
    const sumar = screen.getByRole('button', { name: 'Sumar 1 a $1.000' })
    for (let i = 0; i < 7; i++) fireEvent.click(sumar)
    // el separador de miles depende del idioma del navegador (toLocaleString): se acepta punto o coma
    expect(screen.getByText(/^\$7[.,]000$/, { selector: 'span.text-amber-700' })).toBeInTheDocument()
    const ultimo = onChange.mock.calls.at(-1)![0]
    expect(ultimo.arqueo[1000]).toBe(7)
    expect(ultimo.totalContado).toBe(7000)
    expect(ultimo.diferencia).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Restar 1 de $1.000' }))
    expect(onChange.mock.calls.at(-1)![0].totalContado).toBe(6000)
  })

  it('se combina con billetes y otras monedas en el mismo total', () => {
    const onChange = vi.fn()
    render(<ArqueoCaja efectivoEsperado={0} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Contar Efectivo Físico' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sumar 1 a $10.000' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sumar 1 a $1.000' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sumar 1 a $500' }))
    expect(onChange.mock.calls.at(-1)![0].totalContado).toBe(11500)
  })
})
