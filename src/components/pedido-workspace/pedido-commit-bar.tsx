'use client'

import type { WorkspacePhase } from './types'

export interface PedidoCommitBarProps {
  phase: WorkspacePhase
  /** total del preview del backend, o null si aún no hay. */
  total: number | null
  previewPending: boolean
  canCommit: boolean
  /** si el preview llegó pero el backend no permite crear, el motivo legible. */
  blockedReason: string | null
  /** modo edición: "Guardar cambios" en vez de "Crear pedido". */
  modoEdicion?: boolean
  onCommit: () => void
  onCancel?: () => void
}

/**
 * PedidoCommitBar (blueprint §3.2 / §5) — representación **adaptativa** de la
 * acción de commit. La etiqueta y el estado del botón se derivan de la fase
 * de la máquina de UI y del preview del backend (la autoridad). Fricción
 * proporcional: normal = un clic; bloqueado = deshabilitado con el motivo;
 * REVIEW/AUTHORIZATION = el commit no vive acá (lo maneja `PedidoReview`).
 */
export function PedidoCommitBar({
  phase,
  total,
  previewPending,
  canCommit,
  blockedReason,
  modoEdicion = false,
  onCommit,
  onCancel,
}: PedidoCommitBarProps) {
  const totalLabel = total != null ? ` $${total.toLocaleString()}` : ''
  const verbo = modoEdicion ? 'Guardar cambios' : `Crear pedido${totalLabel}`

  let label: string
  let enabled = false
  let hint: string | null = null

  switch (phase) {
    case 'COMMITTING':
      label = modoEdicion ? 'Guardando…' : 'Creando…'
      break
    case 'COMMITTED':
      label = modoEdicion ? 'Guardado ✓' : 'Creado ✓'
      break
    case 'REVIEW_REQUIRED':
      label = 'Revisá arriba para continuar'
      hint = 'Esta operación requiere una revisión antes de crearse.'
      break
    case 'AUTHORIZATION_REQUIRED':
      label = 'Falta autorización'
      hint = 'Una persona con permisos debe habilitar esta operación.'
      break
    case 'PREVIEW_READY':
      if (canCommit) {
        label = verbo
        enabled = true
      } else {
        label = modoEdicion ? 'No se puede guardar' : 'No se puede crear'
        hint = blockedReason ?? 'Revisá las señales de arriba.'
      }
      break
    default:
      label = previewPending ? 'Calculando…' : verbo
  }

  return (
    <div className="space-y-1 border-t pt-3" data-testid="workspace-commit-bar">
      <div className="flex items-center justify-between">
        {onCancel ? (
          <button type="button" onClick={onCancel} className="text-sm text-gray-500">Cancelar</button>
        ) : <span />}
        <button
          type="button"
          data-testid="workspace-commit"
          disabled={!enabled}
          onClick={onCommit}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {label}
        </button>
      </div>
      {hint && <p className="text-right text-xs text-gray-400" data-testid="workspace-commit-hint">{hint}</p>}
    </div>
  )
}
