// @tests unit/CommandCenter (Fase 3)
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { CommandCenter } from '../index'
import { CommandCard } from '../command-card'
import { derivarActividad } from '../activity'
import type { Embarque } from '../../types'

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

function mkEmbarque(over: Partial<Embarque> = {}): Embarque {
  return {
    id: over.id ?? 'e1',
    numero: 1,
    numeroDia: 1,
    fecha: '2026-08-27T10:00:00Z',
    horaSalida: null,
    horaLlegada: null,
    estado: 'ABIERTO',
    tipoMoto: null,
    baseDinero: 0,
    obs: null,
    trabajador: { id: 't1', nombre: 'Repartidor Uno' },
    ruta: null,
    pedidos: [],
    productos: [],
    ...over,
  }
}

describe('derivarActividad', () => {
  it('devuelve vacío si no hay _count', () => {
    expect(derivarActividad(mkEmbarque())).toEqual([])
  })

  it('marca recovery y casos como alerta; movimientos no', () => {
    const items = derivarActividad(
      mkEmbarque({ _count: { movimientos: 3, recoveries: 1, responsibilityCases: 2, sustituciones: 0 } }),
    )
    expect(items.find((i) => i.label === 'movimientos')?.alerta).toBe(false)
    expect(items.find((i) => i.label === 'recovery')?.alerta).toBe(true)
    expect(items.find((i) => i.label === 'casos')?.alerta).toBe(true)
    expect(items.find((i) => i.label === 'sustituciones')).toBeUndefined()
  })
})

describe('CommandCenter — agrupación por fase derivada', () => {
  it('coloca cada embarque en su sección de fase (nunca por estado nuevo)', () => {
    const embarques = [
      mkEmbarque({ id: 'borrador', estado: 'ABIERTO', pedidos: [] }),
      mkEmbarque({ id: 'confirmado', estado: 'ABIERTO', pedidos: [{ id: 'p1' } as never] }),
      mkEmbarque({ id: 'enruta', estado: 'EN_RUTA' }),
      mkEmbarque({ id: 'cerrado', estado: 'CERRADO' }),
    ]
    render(<CommandCenter embarques={embarques} onNuevo={vi.fn()} />)

    const desktop = screen.getByTestId('command-center-desktop')
    expect(within(within(desktop).getByTestId('fase-section-BORRADOR')).getByText('#1')).toBeInTheDocument()
    expect(within(desktop).getByTestId('fase-section-CONFIRMADO')).toBeInTheDocument()
    expect(within(desktop).getByTestId('fase-section-EN_RUTA')).toBeInTheDocument()
    expect(within(desktop).getByTestId('fase-section-CERRADO')).toBeInTheDocument()
    // fases sin embarques no renderizan sección
    expect(within(desktop).queryByTestId('fase-section-CANCELADO')).toBeNull()
  })

  it('renderiza ambas vistas responsive con data-testid propio', () => {
    render(<CommandCenter embarques={[mkEmbarque()]} onNuevo={vi.fn()} />)
    expect(screen.getByTestId('command-center-desktop')).toBeInTheDocument()
    expect(screen.getByTestId('command-center-mobile')).toBeInTheDocument()
  })

  it('muestra empty state y dispara onNuevo', () => {
    const onNuevo = vi.fn()
    render(<CommandCenter embarques={[]} onNuevo={onNuevo} />)
    screen.getByRole('button', { name: /crear embarque/i }).click()
    expect(onNuevo).toHaveBeenCalled()
  })

  it('KPIs derivados de la lista', () => {
    render(
      <CommandCenter
        embarques={[
          mkEmbarque({ id: 'a', estado: 'EN_RUTA' }),
          mkEmbarque({ id: 'b', estado: 'CERRADO' }),
          mkEmbarque({ id: 'c', estado: 'EN_RUTA', _count: { recoveries: 1 } }),
        ]}
        onNuevo={vi.fn()}
      />,
    )
    expect(within(screen.getByTestId('kpi-total')).getByText('3')).toBeInTheDocument()
    expect(within(screen.getByTestId('kpi-en-ruta')).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByTestId('kpi-cerrados')).getByText('1')).toBeInTheDocument()
    expect(within(screen.getByTestId('kpi-alerta')).getByText('1')).toBeInTheDocument()
  })
})

describe('CommandCard', () => {
  it('muestra la fila de actividad solo si _count > 0', () => {
    const { rerender } = render(<CommandCard embarque={mkEmbarque()} />)
    expect(screen.queryByTestId('command-card-actividad')).toBeNull()

    rerender(<CommandCard embarque={mkEmbarque({ _count: { movimientos: 2 } })} />)
    expect(screen.getByTestId('command-card-actividad')).toHaveTextContent('2 movimientos')
  })

  it('muestra el CTA de siguiente paso y enlaza al detalle', () => {
    render(<CommandCard embarque={mkEmbarque({ estado: 'EN_RUTA' })} />)
    expect(screen.getByTestId('command-card-cta')).toHaveTextContent(/cierra el embarque/i)
    expect(screen.getByTestId('embarque-card').closest('a')).toHaveAttribute('href', '/embarques/e1')
  })
})
