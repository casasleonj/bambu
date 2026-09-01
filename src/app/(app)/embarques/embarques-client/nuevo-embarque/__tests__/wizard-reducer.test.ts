// @tests wizardReducer — máquina de estados del wizard de Nuevo Embarque
import { describe, it, expect } from 'vitest'
import { wizardReducer, initialState, puedeConfirmar, type WizardState } from '../wizard-reducer'
import type { PedidoSeleccionable } from '../filtrar-pedidos'

function pedido(id: string, over: Partial<PedidoSeleccionable> = {}): PedidoSeleccionable {
  return {
    id, numero: Number(id.replace(/\D/g, '')) || 1,
    estadoEntrega: 'PENDIENTE', estadoPago: 'PENDIENTE',
    embarqueId: null, fechaEntrega: null, horaPreferida: null, saldo: 0, total: 1000,
    cPacaAguaPed: 10, ...over,
  }
}

const loaded = (): WizardState =>
  wizardReducer(initialState('08:00'), { type: 'ORDERS_LOADED', pedidos: [pedido('p1'), pedido('p2')] })

describe('carga de pedidos', () => {
  it('arranca en LOADING_ORDERS y pasa a SELECTING_ORDERS al cargar', () => {
    expect(initialState().fase).toBe('LOADING_ORDERS')
    expect(loaded().fase).toBe('SELECTING_ORDERS')
  })

  it('error de carga → ERROR', () => {
    const s = wizardReducer(initialState(), { type: 'ORDERS_LOAD_ERROR' })
    expect(s.fase).toBe('ERROR')
  })
})

describe('selección y carga derivada', () => {
  it('seleccionar pedidos deriva la carga automáticamente', () => {
    let s = loaded()
    s = wizardReducer(s, { type: 'TOGGLE_PEDIDO', id: 'p1' })
    s = wizardReducer(s, { type: 'TOGGLE_PEDIDO', id: 'p2' })
    expect(s.data.selectedIds).toEqual(['p1', 'p2'])
    expect(s.data.carga.PACA_AGUA).toBe(20)
  })

  it('editar la carga a mano corta la re-derivación', () => {
    let s = loaded()
    s = wizardReducer(s, { type: 'TOGGLE_PEDIDO', id: 'p1' }) // carga 10
    s = wizardReducer(s, { type: 'SET_CARGA_ITEM', producto: 'PACA_AGUA', value: 15 })
    expect(s.data.cargaEditada).toBe(true)
    s = wizardReducer(s, { type: 'TOGGLE_PEDIDO', id: 'p2' }) // ya no re-deriva
    expect(s.data.carga.PACA_AGUA).toBe(15)
  })

  it('RESTORE_CARGA vuelve a lo que piden los pedidos', () => {
    let s = loaded()
    s = wizardReducer(s, { type: 'TOGGLE_PEDIDO', id: 'p1' })
    s = wizardReducer(s, { type: 'SET_CARGA_ITEM', producto: 'PACA_AGUA', value: 99 })
    s = wizardReducer(s, { type: 'RESTORE_CARGA' })
    expect(s.data.cargaEditada).toBe(false)
    expect(s.data.carga.PACA_AGUA).toBe(10)
  })
})

describe('realtime: doble asignación', () => {
  it('REFRESH_PEDIDOS deselecciona los que otro ya asignó', () => {
    let s = loaded()
    s = wizardReducer(s, { type: 'TOGGLE_PEDIDO', id: 'p1' })
    s = wizardReducer(s, { type: 'TOGGLE_PEDIDO', id: 'p2' })
    s = wizardReducer(s, {
      type: 'REFRESH_PEDIDOS',
      pedidos: [pedido('p1', { embarqueId: 'otro' }), pedido('p2')],
    })
    expect(s.data.selectedIds).toEqual(['p2'])
    expect(s.data.carga.PACA_AGUA).toBe(10)
  })
})

describe('navegación de pasos', () => {
  it('GOTO_CONFIRM solo desde SELECTING_ORDERS; GOTO_ORDERS solo desde REVIEWING', () => {
    let s = loaded()
    s = wizardReducer(s, { type: 'GOTO_CONFIRM' })
    expect(s.fase).toBe('REVIEWING')
    s = wizardReducer(s, { type: 'GOTO_CONFIRM' }) // no-op
    expect(s.fase).toBe('REVIEWING')
    s = wizardReducer(s, { type: 'GOTO_ORDERS' })
    expect(s.fase).toBe('SELECTING_ORDERS')
  })

  it('los campos del Paso 2 sobreviven al ir y volver', () => {
    let s = loaded()
    s = wizardReducer(s, { type: 'GOTO_CONFIRM' })
    s = wizardReducer(s, { type: 'SET_FIELD', field: 'trabajadorId', value: 't1' })
    s = wizardReducer(s, { type: 'SET_BASE', value: 5000 })
    s = wizardReducer(s, { type: 'GOTO_ORDERS' })
    s = wizardReducer(s, { type: 'GOTO_CONFIRM' })
    expect(s.data.trabajadorId).toBe('t1')
    expect(s.data.baseDinero).toBe(5000)
  })
})

describe('submit: sin doble submit', () => {
  it('SUBMIT_START no re-entra si ya está en curso', () => {
    let s = loaded()
    s = wizardReducer(s, { type: 'GOTO_CONFIRM' })
    s = wizardReducer(s, { type: 'SUBMIT_START' })
    expect(s.fase).toBe('SUBMITTING')
    const dup = wizardReducer(s, { type: 'SUBMIT_START' })
    expect(dup).toBe(s) // mismo objeto, no transición
    s = wizardReducer(s, { type: 'CREATED', embarqueId: 'e1' })
    expect(wizardReducer(s, { type: 'SUBMIT_START' })).toBe(s)
  })

  it('flujo feliz: SUBMITTING → CREATED → ASSIGNING → SUCCESS', () => {
    let s = wizardReducer(loaded(), { type: 'GOTO_CONFIRM' })
    s = wizardReducer(s, { type: 'SUBMIT_START' })
    s = wizardReducer(s, { type: 'CREATED', embarqueId: 'e1' })
    s = wizardReducer(s, { type: 'ASSIGN_START' })
    s = wizardReducer(s, { type: 'SUCCESS', embarqueId: 'e1' })
    expect(s.fase).toBe('SUCCESS')
    expect(s.embarqueId).toBe('e1')
  })

  it('409 → CONFLICT con la lista de no asignados; el embarque igual existe', () => {
    let s = wizardReducer(loaded(), { type: 'GOTO_CONFIRM' })
    s = wizardReducer(s, { type: 'SUBMIT_START' })
    s = wizardReducer(s, { type: 'CREATED', embarqueId: 'e1' })
    s = wizardReducer(s, { type: 'CONFLICT', embarqueId: 'e1', noAsignados: ['Tienda El Sol'] })
    expect(s.fase).toBe('CONFLICT')
    expect(s.embarqueId).toBe('e1')
    expect(s.noAsignados).toEqual(['Tienda El Sol'])
  })

  it('ERROR recuperable vuelve a REVIEWING con mensaje', () => {
    let s = wizardReducer(loaded(), { type: 'GOTO_CONFIRM' })
    s = wizardReducer(s, { type: 'SUBMIT_START' })
    s = wizardReducer(s, { type: 'ERROR', message: 'El servidor rechazó la carga.' })
    expect(s.fase).toBe('REVIEWING')
    expect(s.error).toContain('rechazó')
  })
})

describe('puedeConfirmar', () => {
  it('false sin repartidor, true con repartidor en REVIEWING', () => {
    let s = wizardReducer(loaded(), { type: 'GOTO_CONFIRM' })
    expect(puedeConfirmar(s)).toBe(false)
    s = wizardReducer(s, { type: 'SET_FIELD', field: 'trabajadorId', value: 't1' })
    expect(puedeConfirmar(s)).toBe(true)
  })
})
