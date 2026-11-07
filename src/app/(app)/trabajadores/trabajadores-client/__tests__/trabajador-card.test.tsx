// @tests trabajador-card.tsx — #566 (badge de deuda pendiente, enlace al detalle, error con reintento)
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TrabajadorCard } from '../trabajador-card'
import type { Trabajador } from '../types'

const base: Trabajador = {
  id: 't1', nombre: 'Carlos Mejía', rol: 'REPARTIDOR', tipoPago: 'COMISION', usaMoto: true,
  capacidadKg: 500, comPacaAgua: 0, comPacaHielo: 0, comBotellon: 0, comRepartAgua: 0,
  comRepartHielo: 0, comRepartBotellon: 0, salarioFijo: 0, deudaReposAgua: 0, deudaReposHielo: 0,
  activo: true, createdAt: '2026-01-01T00:00:00Z',
}
const noop = () => {}

describe('TrabajadorCard — deuda pendiente (#566)', () => {
  it('muestra el badge con el monto cuando hay deuda', () => {
    render(<TrabajadorCard trabajador={{ ...base, deudaPendiente: 60000 }} onEdit={noop} onDelete={noop} />)
    const badge = screen.getByTestId('trabajador-deuda-badge')
    expect(badge.textContent).toContain('Deuda pendiente')
    expect(badge.textContent).toContain('60.000')
  })

  it.each([[0], [undefined]])('no muestra nada con deudaPendiente=%s', (v) => {
    render(<TrabajadorCard trabajador={{ ...base, deudaPendiente: v }} onEdit={noop} onDelete={noop} />)
    expect(screen.queryByTestId('trabajador-deuda-badge')).toBeNull()
    expect(screen.queryByTestId('trabajador-deuda-error')).toBeNull()
  })

  it('con null avisa que no está disponible (no muestra $ 0) y permite reintentar', () => {
    const retry = vi.fn()
    render(<TrabajadorCard trabajador={{ ...base, deudaPendiente: null }} onEdit={noop} onDelete={noop} onRetryDeuda={retry} />)
    expect(screen.queryByTestId('trabajador-deuda-badge')).toBeNull()
    expect(screen.getByTestId('trabajador-deuda-error').textContent).toContain('Deuda no disponible')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('el nombre enlaza al detalle del trabajador', () => {
    render(<TrabajadorCard trabajador={base} onEdit={noop} onDelete={noop} />)
    expect(screen.getByRole('link', { name: 'Carlos Mejía' }).getAttribute('href')).toBe('/trabajadores/t1')
  })

  it('con onVerDeuda la insignia es un botón que abre el detalle de ese trabajador', () => {
    const ver = vi.fn()
    const t = { ...base, deudaPendiente: 60000 }
    render(<TrabajadorCard trabajador={t} onEdit={noop} onDelete={noop} onVerDeuda={ver} />)
    const badge = screen.getByTestId('trabajador-deuda-badge')
    expect(badge.tagName).toBe('BUTTON')
    fireEvent.click(badge)
    expect(ver).toHaveBeenCalledWith(t)
  })

  it('sin onVerDeuda la insignia es solo texto', () => {
    render(<TrabajadorCard trabajador={{ ...base, deudaPendiente: 60000 }} onEdit={noop} onDelete={noop} />)
    expect(screen.getByTestId('trabajador-deuda-badge').tagName).toBe('SPAN')
  })

  it('soloLectura oculta Editar y Desactivar; sin ella aparecen', () => {
    const { rerender } = render(<TrabajadorCard trabajador={base} onEdit={noop} onDelete={noop} />)
    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeTruthy()
    rerender(<TrabajadorCard trabajador={base} onEdit={noop} onDelete={noop} soloLectura />)
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Desactivar' })).toBeNull()
  })
})
