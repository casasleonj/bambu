import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PedidoCommitBar, type PedidoCommitBarProps } from '../pedido-commit-bar'
import type { WorkspacePhase } from '../types'

const base = {
  total: 27000,
  previewPending: false,
  canCommit: false,
  blockedReason: null as string | null,
  onCommit: vi.fn(),
}

function renderBar(over: Partial<PedidoCommitBarProps>) {
  return render(<PedidoCommitBar phase={'DRAFTING' as WorkspacePhase} {...base} {...over} />)
}

describe('PedidoCommitBar', () => {
  it('PREVIEW_READY + canCommit → botón habilitado con total', () => {
    renderBar({ phase: 'PREVIEW_READY', canCommit: true })
    const btn = screen.getByTestId('workspace-commit')
    expect(btn).toBeEnabled()
    expect(btn).toHaveTextContent(/Crear pedido \$27[.,]000/)
  })

  it('PREVIEW_READY sin canCommit → deshabilitado + motivo', () => {
    renderBar({ phase: 'PREVIEW_READY', canCommit: false, blockedReason: 'Cliente al límite de fiados' })
    expect(screen.getByTestId('workspace-commit')).toBeDisabled()
    expect(screen.getByTestId('workspace-commit-hint')).toHaveTextContent('Cliente al límite de fiados')
  })

  it('REVIEW_REQUIRED → el commit no vive acá', () => {
    renderBar({ phase: 'REVIEW_REQUIRED' })
    expect(screen.getByTestId('workspace-commit')).toBeDisabled()
    expect(screen.getByTestId('workspace-commit-hint')).toHaveTextContent(/revisión/i)
  })

  it('COMMITTING → "Creando…" deshabilitado', () => {
    renderBar({ phase: 'COMMITTING' })
    expect(screen.getByTestId('workspace-commit')).toHaveTextContent('Creando…')
    expect(screen.getByTestId('workspace-commit')).toBeDisabled()
  })

  it('DRAFTING con preview en vuelo → "Calculando…"', () => {
    renderBar({ phase: 'DRAFTING', previewPending: true })
    expect(screen.getByTestId('workspace-commit')).toHaveTextContent('Calculando…')
  })

  it('modoEdicion → "Guardar cambios" / "Guardando…"', () => {
    const { rerender } = renderBar({ phase: 'PREVIEW_READY', canCommit: true, modoEdicion: true })
    expect(screen.getByTestId('workspace-commit')).toHaveTextContent('Guardar cambios')
    rerender(<PedidoCommitBar phase={'COMMITTING' as WorkspacePhase} {...base} modoEdicion />)
    expect(screen.getByTestId('workspace-commit')).toHaveTextContent('Guardando…')
  })
})


describe('PedidoCommitBar — sin conexión (B-20)', () => {
  it('habilitado con la etiqueta "Guardar sin conexión" aunque no haya preview', () => {
    render(<PedidoCommitBar phase="DRAFTING" total={null} previewPending={false} canCommit blockedReason={null} sinConexion onCommit={vi.fn()} />)
    const btn = screen.getByTestId('workspace-commit')
    expect(btn).toBeEnabled()
    expect(btn).toHaveTextContent(/Guardar sin conexión/)
  })

  it('etiquetaCrear reemplaza «Crear pedido» (entregar después, P2-2)', () => {
    renderBar({ phase: 'PREVIEW_READY', canCommit: true, etiquetaCrear: 'Registrar venta pagada' })
    expect(screen.getByTestId('workspace-commit')).toHaveTextContent(/Registrar venta pagada \$27[.,]000/)
  })
})

describe('PedidoCommitBar — «Cobrar» cuando el pago cubre el total (#425)', () => {
  const texto = () => screen.getByTestId('workspace-commit').textContent

  it('cobrado → «Cobrar $X»; sin cobrar → «Crear pedido $X»', () => {
    const { rerender } = renderBar({ phase: 'PREVIEW_READY', canCommit: true, cobrado: true })
    expect(texto()).toMatch(/^Cobrar \$27[.,]000$/)
    rerender(<PedidoCommitBar phase={'PREVIEW_READY' as WorkspacePhase} {...base} canCommit cobrado={false} />)
    expect(texto()).toMatch(/^Crear pedido \$27[.,]000$/)
  })

  it('sin conexión, edición y entregar después tienen prioridad sobre «Cobrar»', () => {
    const { rerender } = renderBar({ phase: 'PREVIEW_READY', canCommit: true, cobrado: true, sinConexion: true })
    expect(texto()).toMatch(/^Guardar sin conexión/)
    rerender(<PedidoCommitBar phase={'PREVIEW_READY' as WorkspacePhase} {...base} canCommit cobrado modoEdicion />)
    expect(texto()).toBe('Guardar cambios')
    rerender(<PedidoCommitBar phase={'PREVIEW_READY' as WorkspacePhase} {...base} canCommit cobrado etiquetaCrear="Registrar venta pagada" />)
    expect(texto()).toMatch(/^Registrar venta pagada/)
  })

  it('bloqueado y en proceso no dicen «Cobrar»', () => {
    const { rerender } = renderBar({ phase: 'PREVIEW_READY', canCommit: false, cobrado: true })
    expect(texto()).toBe('No se puede crear')
    rerender(<PedidoCommitBar phase={'COMMITTING' as WorkspacePhase} {...base} cobrado />)
    expect(texto()).toBe('Creando…')
  })
})
