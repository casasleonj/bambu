// @tests Fase 9 F9-iii (docs/pedidos/fase9-hardening-estados-plan.md, P5):
// distinguir un 409 de concurrencia/estado (A → recovery) de un 409 de regla
// de negocio ya explicada (B → mensaje contextual). No todo 409 es "conflicto".

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/lib/fetch-resilient', () => ({ fetchResilient: vi.fn() }))
import { fetchResilient } from '@/lib/fetch-resilient'
import { useGestionPendiente } from '../use-gestion-pendiente'

const frMock = vi.mocked(fetchResilient)

beforeEach(() => {
  frMock.mockReset()
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

async function confirmar(onMutado = vi.fn()) {
  const { result } = renderHook(() => useGestionPendiente('p1', onMutado))
  let r!: Awaited<ReturnType<typeof result.current.confirmarGestion>>
  await act(async () => {
    r = await result.current.confirmarGestion({ producto: 'PACA_AGUA', cantidad: 3, modoInicial: 'DOMICILIO' })
  })
  return { r, onMutado }
}

describe('useGestionPendiente — clasificación de 409 (F9-iii)', () => {
  it('409 CANTIDAD_EXCEDE_PENDIENTE → regla de negocio (NO conflicto)', async () => {
    frMock.mockResolvedValue({ status: 'error', statusCode: 409, error: 'CANTIDAD_EXCEDE_PENDIENTE: pediste 3, quedan 2' })
    const { r, onMutado } = await confirmar()
    expect(r.ok).toBe(false)
    expect(r.reglaNegocio).toBe(true)
    expect(r.conflicto).toBe(false)
    expect(onMutado).not.toHaveBeenCalled()
  })

  it('409 OBLIGACION_YA_ACTIVA → conflicto de concurrencia (otra sesión la creó)', async () => {
    frMock.mockResolvedValue({ status: 'error', statusCode: 409, error: 'OBLIGACION_YA_ACTIVA: ya hay una gestión abierta' })
    const { r } = await confirmar()
    expect(r.conflicto).toBe(true)
    expect(r.reglaNegocio).toBe(false)
  })

  it('409 ACTIVIDAD_NO_MODIFICABLE → conflicto de concurrencia (estado cambió)', async () => {
    frMock.mockResolvedValue({ status: 'error', statusCode: 409, error: 'ACTIVIDAD_NO_MODIFICABLE: ya está cancelada' })
    const { r } = await confirmar()
    expect(r.conflicto).toBe(true)
  })

  it('500 → ni conflicto ni regla de negocio', async () => {
    frMock.mockResolvedValue({ status: 'error', statusCode: 500, error: 'Error gestionando pendiente' })
    const { r } = await confirmar()
    expect(r.conflicto).toBe(false)
    expect(r.reglaNegocio).toBe(false)
  })

  it('ok → limpia y llama onMutado, sin conflicto', async () => {
    frMock.mockResolvedValue({ status: 'ok', statusCode: 201, data: { success: true } })
    const { r, onMutado } = await confirmar()
    expect(r.ok).toBe(true)
    expect(r.conflicto).toBeFalsy()
    expect(onMutado).toHaveBeenCalled()
  })

  it('offline → ok:true offline:true, sin conflicto', async () => {
    frMock.mockResolvedValue({ status: 'offline', localId: 'u1', reason: 'network' })
    const { r } = await confirmar()
    expect(r.ok).toBe(true)
    expect(r.offline).toBe(true)
    expect(r.conflicto).toBeFalsy()
  })
})
