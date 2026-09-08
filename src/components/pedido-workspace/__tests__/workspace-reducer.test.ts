import { describe, it, expect } from 'vitest'
import { workspaceReducer, initWorkspace, canCommit, EMPTY_DRAFT } from '../workspace-reducer'
import type { PreviewPedidoResult } from '@/modules/pedidos/application/dto'
import type { WorkspaceState } from '../types'

const previewOk = (over: Partial<PreviewPedidoResult> = {}): PreviewPedidoResult => ({
  calculation: {
    items: [], subtotal: 0, recargoDomicilio: 0, total: 27000, totalPagado: 0,
    saldoProyectado: 27000, saldoFavorProyectado: 0,
    estadoEntregaProyectado: 'PENDIENTE', estadoPagoProyectado: 'PENDIENTE',
  },
  permissions: { canCreate: true, canSetManualPrice: true },
  allowedActions: ['crear', 'crear-y-enviar-a-ruta'],
  warnings: [], riskSignals: [], requiresAuthorization: false,
  auditPreview: { actor: 'u', accion: 'CREAR_PEDIDO', recurso: 'Pedido (nuevo)', valoresRelevantes: { total: 27000, clienteId: 'c1', canal: 'DOMICILIO', origen: 'PEDIDO', tienePrecioManual: false } },
  ...over,
})

const s0 = () => initWorkspace()

describe('workspaceReducer — máquina de UI adaptativa', () => {
  it('EMPTY → CONTEXT_READY al elegir cliente', () => {
    const s = workspaceReducer(s0(), { type: 'SET_CLIENTE', clienteId: 'c1' })
    expect(s.phase).toBe('CONTEXT_READY')
    expect(s.draft.clienteId).toBe('c1')
    expect(s.draft.origen).toBe('PEDIDO')
  })

  it('CONSUMIDOR_FINAL ⇒ origen VENTA_RAPIDA', () => {
    const s = workspaceReducer(s0(), { type: 'SET_CLIENTE', clienteId: 'CONSUMIDOR_FINAL' })
    expect(s.draft.origen).toBe('VENTA_RAPIDA')
  })

  it('CONTEXT_READY → DRAFTING al agregar un item', () => {
    let s = workspaceReducer(s0(), { type: 'SET_CLIENTE', clienteId: 'c1' })
    s = workspaceReducer(s, { type: 'SET_ITEM_CANTIDAD', producto: 'PACA_AGUA', cantidad: 3 })
    expect(s.phase).toBe('DRAFTING')
  })

  it('DRAFTING + PREVIEW_RECEIVED (sin auth) → PREVIEW_READY', () => {
    let s: WorkspaceState = { ...s0(), phase: 'DRAFTING', draft: { ...EMPTY_DRAFT, clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 10 }] } }
    s = workspaceReducer(s, { type: 'PREVIEW_RECEIVED', preview: previewOk() })
    expect(s.phase).toBe('PREVIEW_READY')
    expect(s.preview?.calculation.total).toBe(27000)
    expect(canCommit(s)).toBe(true)
  })

  it('PREVIEW_RECEIVED con requiresAuthorization → REVIEW_REQUIRED (no commiteable)', () => {
    let s: WorkspaceState = { ...s0(), phase: 'DRAFTING', draft: { ...EMPTY_DRAFT, clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 10 }] } }
    s = workspaceReducer(s, { type: 'PREVIEW_RECEIVED', preview: previewOk({ requiresAuthorization: true }) })
    expect(s.phase).toBe('REVIEW_REQUIRED')
    expect(canCommit(s)).toBe(false)
  })

  it('ACKNOWLEDGE_REVIEW exige motivo; con motivo → PREVIEW_READY y guarda el motivo (trim)', () => {
    let s: WorkspaceState = { ...s0(), phase: 'REVIEW_REQUIRED', draft: { ...EMPTY_DRAFT, clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 10 }] }, preview: previewOk({ requiresAuthorization: true }) }
    // sin motivo → no-op
    expect(workspaceReducer(s, { type: 'ACKNOWLEDGE_REVIEW', motivo: '   ' }).phase).toBe('REVIEW_REQUIRED')
    s = workspaceReducer(s, { type: 'ACKNOWLEDGE_REVIEW', motivo: '  cliente mayorista habitual  ' })
    expect(s.phase).toBe('PREVIEW_READY')
    expect(s.reviewMotivo).toBe('cliente mayorista habitual')
    expect(canCommit(s)).toBe(true)
  })

  it('RETURN_TO_DRAFTING vuelve a DRAFTING desde REVIEW_REQUIRED y limpia el motivo', () => {
    let s: WorkspaceState = { ...s0(), phase: 'REVIEW_REQUIRED', reviewMotivo: 'x', draft: { ...EMPTY_DRAFT, clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 10 }] }, preview: previewOk({ requiresAuthorization: true }) }
    s = workspaceReducer(s, { type: 'RETURN_TO_DRAFTING' })
    expect(s.phase).toBe('DRAFTING')
    expect(s.reviewMotivo).toBe('')
  })

  it('un cambio de item tras acknowledge limpia el reviewMotivo', () => {
    let s: WorkspaceState = { ...s0(), phase: 'PREVIEW_READY', reviewMotivo: 'ok', draft: { ...EMPTY_DRAFT, clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 10 }] }, preview: previewOk() }
    s = workspaceReducer(s, { type: 'SET_ITEM_CANTIDAD', producto: 'PACA_AGUA', cantidad: 11 })
    expect(s.reviewMotivo).toBe('')
  })

  it('un cambio de item tras PREVIEW_READY vuelve a DRAFTING (preview stale)', () => {
    let s: WorkspaceState = { ...s0(), phase: 'PREVIEW_READY', draft: { ...EMPTY_DRAFT, clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 10 }] }, preview: previewOk() }
    s = workspaceReducer(s, { type: 'SET_ITEM_CANTIDAD', producto: 'PACA_AGUA', cantidad: 12 })
    expect(s.phase).toBe('DRAFTING')
    expect(s.preview).toBeNull()
  })

  it('COMMIT_START solo desde PREVIEW_READY/AUTHORIZATION_REQUIRED', () => {
    const drafting: WorkspaceState = { ...s0(), phase: 'DRAFTING' }
    expect(workspaceReducer(drafting, { type: 'COMMIT_START' }).phase).toBe('DRAFTING')
    const ready: WorkspaceState = { ...s0(), phase: 'PREVIEW_READY', preview: previewOk() }
    expect(workspaceReducer(ready, { type: 'COMMIT_START' }).phase).toBe('COMMITTING')
  })

  it('COMMITTING → COMMITTED / CONFLICT_ERROR', () => {
    const committing: WorkspaceState = { ...s0(), phase: 'COMMITTING', preview: previewOk() }
    expect(workspaceReducer(committing, { type: 'COMMIT_SUCCESS' }).phase).toBe('COMMITTED')
    const conflict = workspaceReducer(committing, { type: 'COMMIT_CONFLICT', message: 'cambió' })
    expect(conflict.phase).toBe('DRAFTING')
    expect(conflict.error?.kind).toBe('CONFLICT_ERROR')
  })

  it('APPLY_PROPOSAL setea varios campos + procedencia (ValueOrigin)', () => {
    let s = workspaceReducer(s0(), { type: 'SET_CLIENTE', clienteId: 'c1' })
    s = workspaceReducer(s, {
      type: 'APPLY_PROPOSAL',
      draft: { canal: 'DOMICILIO', items: [{ producto: 'PACA_AGUA', cantidad: 20 }] },
      origins: { 'item.PACA_AGUA.cantidad': 'HISTORY', canal: 'HISTORY' },
    })
    expect(s.draft.items[0].cantidad).toBe(20)
    expect(s.valueOrigins['canal']).toBe('HISTORY')
    expect(s.phase).toBe('DRAFTING')
  })

  it('CONFIRMAR_PRECIO_BAJO marca el código; cambiar el precio manual lo revierte', () => {
    let s = workspaceReducer(s0(), { type: 'SET_CLIENTE', clienteId: 'c1' })
    s = workspaceReducer(s, { type: 'SET_ITEM_CANTIDAD', producto: 'PACA_AGUA', cantidad: 3 })
    s = workspaceReducer(s, { type: 'SET_ITEM_PRECIO_MANUAL', producto: 'PACA_AGUA', precioManual: 500 })
    s = workspaceReducer(s, { type: 'CONFIRMAR_PRECIO_BAJO', producto: 'PACA_AGUA' })
    expect(s.precioBajoConfirmado['PACA_AGUA']).toBe(true)
    s = workspaceReducer(s, { type: 'SET_ITEM_PRECIO_MANUAL', producto: 'PACA_AGUA', precioManual: 400 })
    expect(s.precioBajoConfirmado['PACA_AGUA']).toBe(false)
    expect(s.valueOrigins['item.PACA_AGUA.precio']).toBe('USER')
  })

  it('el reducer NO calcula precios ni valida límites — el total solo llega por PREVIEW_RECEIVED', () => {
    let s = workspaceReducer(s0(), { type: 'SET_CLIENTE', clienteId: 'c1' })
    s = workspaceReducer(s, { type: 'SET_ITEM_CANTIDAD', producto: 'PACA_AGUA', cantidad: 100 })
    // sin preview: no hay total, no hay canCommit
    expect(s.preview).toBeNull()
    expect(canCommit(s)).toBe(false)
  })
})
