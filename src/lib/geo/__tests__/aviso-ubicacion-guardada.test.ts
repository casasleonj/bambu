// @tests #426 — lo que se le dice a la persona después de guardar el pedido con «guardar también la ubicación».
import { describe, it, expect, vi } from 'vitest'

const toast = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

import { avisoUbicacionGuardada, avisarUbicacionGuardada } from '../aviso-ubicacion-guardada'

describe('avisoUbicacionGuardada', () => {
  it('sin respuesta no dice nada', () => {
    expect(avisoUbicacionGuardada(undefined)).toBeNull()
  })
  it('guardada y reemplazada dicen dónde (tienda o cliente)', () => {
    expect(avisoUbicacionGuardada({ resultado: 'GUARDADA', destino: 'NEGOCIO', anterior: null })).toEqual({ tipo: 'success', texto: 'La ubicación quedó guardada en la tienda para los próximos pedidos.' })
    expect(avisoUbicacionGuardada({ resultado: 'REEMPLAZADA', destino: 'CLIENTE', anterior: { lat: 1, lng: 1 } })?.texto).toContain('en el cliente se reemplazó')
  })
  it('conservada: el pedido se guardó y la ubicación no se cambió', () => {
    expect(avisoUbicacionGuardada({ resultado: 'CONSERVADA', destino: 'NEGOCIO', anterior: { lat: 1, lng: 1 } })).toEqual({ tipo: 'info', texto: 'El pedido se guardó. La ubicación guardada en la tienda no se cambió.' })
  })
  it('un error al guardar la ubicación aclara que el pedido está bien', () => {
    const a = avisoUbicacionGuardada({ resultado: 'ERROR' })
    expect(a?.tipo).toBe('error')
    expect(a?.texto).toContain('Se guardó el pedido, pero no la ubicación')
    expect(a?.texto).toContain('El pedido está bien')
  })
  it('sin destino o sin ubicación: se dice, sin alarma', () => {
    expect(avisoUbicacionGuardada({ resultado: 'SIN_DESTINO' })?.tipo).toBe('info')
    expect(avisoUbicacionGuardada({ resultado: 'SIN_UBICACION' })?.tipo).toBe('info')
  })
  it('avisarUbicacionGuardada usa el toast del tipo que corresponde', () => {
    avisarUbicacionGuardada({ resultado: 'ERROR' })
    expect(toast.error).toHaveBeenCalledTimes(1)
    avisarUbicacionGuardada(undefined)
    expect(toast.success).not.toHaveBeenCalled()
  })
})
