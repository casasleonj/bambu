// @tests EstadoEmbarque + EmbarqueTransitionsService — máquina de estados
// Cubre A.10 #1 (B.1): la máquina de transiciones no tenía test dedicado y es
// la pieza más citada por el plan de UX (estados derivados, Fase 3/4/5).
import { describe, it, expect } from 'vitest'
import { EstadoEmbarque, type EstadoEmbarqueValue } from '../domain/value-objects/EstadoEmbarque'
import { EmbarqueTransitionsService } from '../domain/services/embarque-transitions.service'

describe('EstadoEmbarque.transicionar — máquina de estados real (4 estados)', () => {
  it('ABIERTO → EN_RUTA es válido', () => {
    const r = new EstadoEmbarque('ABIERTO').transicionar('EN_RUTA')
    expect(r.value).toBe('EN_RUTA')
  })

  it('ABIERTO → CANCELADO es válido', () => {
    const r = new EstadoEmbarque('ABIERTO').transicionar('CANCELADO')
    expect(r.value).toBe('CANCELADO')
  })

  it('EN_RUTA → CERRADO es válido', () => {
    const r = new EstadoEmbarque('EN_RUTA').transicionar('CERRADO')
    expect(r.value).toBe('CERRADO')
  })

  it('ABIERTO → CERRADO NO es válido (debe pasar por EN_RUTA)', () => {
    expect(() => new EstadoEmbarque('ABIERTO').transicionar('CERRADO')).toThrow()
  })

  it('EN_RUTA no puede volver a ABIERTO (sin reversibilidad)', () => {
    expect(() => new EstadoEmbarque('EN_RUTA').transicionar('ABIERTO')).toThrow()
  })

  it('CERRADO es terminal', () => {
    expect(() => new EstadoEmbarque('CERRADO').transicionar('EN_RUTA')).toThrow()
    expect(() => new EstadoEmbarque('CERRADO').transicionar('ABIERTO')).toThrow()
  })

  it('CANCELADO es terminal', () => {
    expect(() => new EstadoEmbarque('CANCELADO').transicionar('ABIERTO')).toThrow()
    expect(() => new EstadoEmbarque('CANCELADO').transicionar('CERRADO')).toThrow()
  })

  it('rechaza estado inválido en el constructor', () => {
    expect(() => new EstadoEmbarque('BORRADOR' as EstadoEmbarqueValue)).toThrow()
  })
})

describe('EstadoEmbarque — getters', () => {
  it('isTerminal solo para CERRADO/CANCELADO', () => {
    expect(new EstadoEmbarque('ABIERTO').isTerminal).toBe(false)
    expect(new EstadoEmbarque('EN_RUTA').isTerminal).toBe(false)
    expect(new EstadoEmbarque('CERRADO').isTerminal).toBe(true)
    expect(new EstadoEmbarque('CANCELADO').isTerminal).toBe(true)
  })

  it('canEdit solo ABIERTO', () => {
    expect(new EstadoEmbarque('ABIERTO').canEdit()).toBe(true)
    expect(new EstadoEmbarque('EN_RUTA').canEdit()).toBe(false)
  })

  it('canModifyPedidos solo ABIERTO', () => {
    expect(new EstadoEmbarque('ABIERTO').canModifyPedidos()).toBe(true)
    expect(new EstadoEmbarque('EN_RUTA').canModifyPedidos()).toBe(false)
  })

  it('canModifyGastos en ABIERTO y EN_RUTA (no en terminal)', () => {
    expect(new EstadoEmbarque('ABIERTO').canModifyGastos()).toBe(true)
    expect(new EstadoEmbarque('EN_RUTA').canModifyGastos()).toBe(true)
    expect(new EstadoEmbarque('CERRADO').canModifyGastos()).toBe(false)
    expect(new EstadoEmbarque('CANCELADO').canModifyGastos()).toBe(false)
  })
})

describe('EmbarqueTransitionsService', () => {
  const svc = new EmbarqueTransitionsService()

  it('enviar(ABIERTO) → success EN_RUTA', () => {
    const r = svc.enviar(new EstadoEmbarque('ABIERTO'))
    expect(r.success).toBe(true)
    expect(r.nuevoEstado).toBe('EN_RUTA')
  })

  it('enviar(EN_RUTA) → failure (ya enviado)', () => {
    const r = svc.enviar(new EstadoEmbarque('EN_RUTA'))
    expect(r.success).toBe(false)
    expect(r.nuevoEstado).toBe('EN_RUTA')
    expect(r.error).toBeTruthy()
  })

  it('cerrar(EN_RUTA) → success CERRADO', () => {
    const r = svc.cerrar(new EstadoEmbarque('EN_RUTA'))
    expect(r.success).toBe(true)
    expect(r.nuevoEstado).toBe('CERRADO')
  })

  it('cancelar(ABIERTO) → success CANCELADO', () => {
    const r = svc.cancelar(new EstadoEmbarque('ABIERTO'))
    expect(r.success).toBe(true)
    expect(r.nuevoEstado).toBe('CANCELADO')
  })

  it('puedeTransicionar refleja la misma regla que transicionar', () => {
    expect(svc.puedeTransicionar(new EstadoEmbarque('ABIERTO'), 'EN_RUTA')).toBe(true)
    expect(svc.puedeTransicionar(new EstadoEmbarque('ABIERTO'), 'CERRADO')).toBe(false)
    expect(svc.puedeTransicionar(new EstadoEmbarque('EN_RUTA'), 'CERRADO')).toBe(true)
    expect(svc.puedeTransicionar(new EstadoEmbarque('CERRADO'), 'EN_RUTA')).toBe(false)
  })
})
