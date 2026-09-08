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
})
