import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkspaceEntregaMomento } from '../workspace-entrega-momento'

const base = { entregarDespues: false, onChange: vi.fn(), tieneComprador: true, pagadoCompleto: true }

describe('WorkspaceEntregaMomento — «Entregar después» (P2-2, #463)', () => {
  it('por defecto está en «Entregar ahora», sin avisos', () => {
    render(<WorkspaceEntregaMomento {...base} />)
    expect(screen.getByTestId('workspace-entrega-ahora')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('workspace-entrega-despues')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('workspace-entrega-despues-aviso')).not.toBeInTheDocument()
  })

  it('cada botón avisa al padre qué se eligió', () => {
    const onChange = vi.fn()
    render(<WorkspaceEntregaMomento {...base} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('workspace-entrega-despues'))
    expect(onChange).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByTestId('workspace-entrega-ahora'))
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('«después» pagada completa: pendiente y anticipada', () => {
    render(<WorkspaceEntregaMomento {...base} entregarDespues />)
    expect(screen.getByTestId('workspace-entrega-despues-aviso')).toHaveTextContent(/pendiente y anticipado \(pagado\)/)
  })

  it('«después» con saldo: pendiente, sin decir anticipado', () => {
    render(<WorkspaceEntregaMomento {...base} entregarDespues pagadoCompleto={false} />)
    const aviso = screen.getByTestId('workspace-entrega-despues-aviso')
    expect(aviso).toHaveTextContent(/pendiente/)
    expect(aviso).not.toHaveTextContent(/anticipado/)
  })

  it('«después» sin comprador pide identificarlo', () => {
    render(<WorkspaceEntregaMomento {...base} entregarDespues tieneComprador={false} />)
    expect(screen.getByTestId('workspace-entrega-despues-sin-comprador')).toHaveTextContent(/Identifícalo arriba/)
  })

  it('con comprador no pide nada más', () => {
    render(<WorkspaceEntregaMomento {...base} entregarDespues />)
    expect(screen.queryByTestId('workspace-entrega-despues-sin-comprador')).not.toBeInTheDocument()
  })

  it('deshabilitada mientras se guarda', () => {
    render(<WorkspaceEntregaMomento {...base} disabled />)
    expect(screen.getByTestId('workspace-entrega-despues')).toBeDisabled()
  })
})
