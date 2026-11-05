// @tests #646 — desplegable accesible para listas largas del cierre.
import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Desplegable, ListaLimitada } from '../desplegable'

describe('Desplegable', () => {
  it('viene cerrado con título, insignia y resumen visibles; «abierto» lo abre', () => {
    const { rerender } = render(<Desplegable testid="d" icono="⏳" titulo="Pagos por confirmar" insignia={3} resumen="$230.000">contenido</Desplegable>)
    const d = screen.getByTestId('d')
    expect(d.tagName).toBe('DETAILS')
    expect(d.hasAttribute('open')).toBe(false)
    const resumen = d.querySelector('summary')!
    expect(resumen).toHaveTextContent('Pagos por confirmar')
    expect(resumen).toHaveTextContent('3')
    expect(resumen).toHaveTextContent('$230.000')
    rerender(<Desplegable testid="d" icono="⏳" titulo="Pagos por confirmar" abierto>contenido</Desplegable>)
    expect(screen.getByTestId('d').hasAttribute('open')).toBe(true)
  })

  it('tocar el «?» no abre ni cierra la lista', () => {
    render(<Desplegable testid="d" icono="⏳" titulo="Gastos" ayuda="Explicación del término">contenido</Desplegable>)
    const d = screen.getByTestId('d') as HTMLDetailsElement
    const ayuda = within(d).getByRole('button', { name: 'Qué significa' })
    const permitido = fireEvent.click(ayuda)
    expect(permitido).toBe(false) // el clic se canceló: el <summary> no alterna
  })
})

describe('ListaLimitada', () => {
  const items = Array.from({ length: 8 }, (_, i) => `Fila ${i + 1}`)
  it('muestra el límite y «Ver los N restantes» muestra todo', () => {
    render(<ListaLimitada items={items} limite={5} render={(t) => <p key={t}>{t}</p>} />)
    expect(screen.getByText('Fila 5')).toBeInTheDocument()
    expect(screen.queryByText('Fila 6')).toBeNull()
    expect(screen.getByTestId('ver-restantes')).toHaveTextContent('Ver los 3 restantes')
    fireEvent.click(screen.getByTestId('ver-restantes'))
    expect(screen.getByText('Fila 8')).toBeInTheDocument()
  })
  it('usa singular con una sola fila restante y no muestra el botón si cabe todo', () => {
    const { rerender } = render(<ListaLimitada items={items.slice(0, 6)} limite={5} render={(t) => <p key={t}>{t}</p>} />)
    expect(screen.getByTestId('ver-restantes')).toHaveTextContent('Ver el 1 restante')
    rerender(<ListaLimitada items={items.slice(0, 5)} limite={5} render={(t) => <p key={t}>{t}</p>} />)
    expect(screen.queryByTestId('ver-restantes')).toBeNull()
  })
})
