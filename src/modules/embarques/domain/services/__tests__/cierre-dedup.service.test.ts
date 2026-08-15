// @tests CierreDedupService — BAMBU-LOG-006
// Cierre de embarque no era offline-resiliente: usaba fetch directo (no
// fetchResilient) y no tenía offlineId, así que un corte de red justo al
// recibir la respuesta del cierre no se podía reintentar de forma segura
// (el replay hubiera fallado con "transición inválida" contra un
// embarque ya CERRADO, y ese 4xx queda atascado para siempre en la cola
// offline). Este service detecta el replay y reconstruye un resultado
// idempotente sin re-ejecutar el cierre.

import { describe, it, expect, vi } from 'vitest'
import { CierreDedupService } from '../cierre-dedup.service'

describe('CierreDedupService.esReplay', () => {
  const service = new CierreDedupService()

  it('true si el embarque ya está CERRADO con el mismo offlineId', () => {
    expect(service.esReplay({ isCerrado: true }, 'offline-abc', 'offline-abc')).toBe(true)
  })

  it('false si el embarque está CERRADO pero el offlineId no coincide (otro cierre distinto)', () => {
    expect(service.esReplay({ isCerrado: true }, 'offline-abc', 'offline-xyz')).toBe(false)
  })

  it('false si el embarque no está CERRADO (deja que el flujo normal falle/continúe)', () => {
    expect(service.esReplay({ isCerrado: false }, 'offline-abc', 'offline-abc')).toBe(false)
  })

  it('false si el request no trae offlineId (clientes legacy que no mandan dedup)', () => {
    expect(service.esReplay({ isCerrado: true }, 'offline-abc', undefined)).toBe(false)
  })

  it('false si el embarque nunca guardó un offlineId (cerrado antes de este fix)', () => {
    expect(service.esReplay({ isCerrado: true }, undefined, 'offline-abc')).toBe(false)
  })
})

describe('CierreDedupService.buildResult', () => {
  const service = new CierreDedupService()

  it('devuelve deduped:true y estado CERRADO sin re-ejecutar side effects', async () => {
    const client = {
      deudaTrabajador: { findFirst: vi.fn().mockResolvedValue(null) },
    }

    const result = await service.buildResult(client, 'emb_1', 'trab_1')

    expect(result.deduped).toBe(true)
    expect(result.estado).toBe('CERRADO')
    expect(result.embarqueId).toBe('emb_1')
    expect(result.pedidosHijosCreados).toEqual([])
    expect(result.gastosCreados).toBe(0)
  })

  it('reconstruye deudaCreada desde la DeudaTrabajador ya persistida (para el toast del cliente)', async () => {
    const mockFindFirst = vi.fn().mockResolvedValue({ id: 'deuda_1', montoOriginal: 15000 })
    const client = {
      deudaTrabajador: { findFirst: mockFindFirst },
    }

    const result = await service.buildResult(client, 'emb_1', 'trab_1')

    expect(result.deudaCreada).toEqual({ id: 'deuda_1', monto: 15000 })
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { embarqueId: 'emb_1', trabajadorId: 'trab_1', tipo: 'DEFICIT_EFECTIVO' },
      }),
    )
  })

  it('deudaCreada queda undefined si no hubo faltante de caja en el cierre original', async () => {
    const client = {
      deudaTrabajador: { findFirst: vi.fn().mockResolvedValue(null) },
    }

    const result = await service.buildResult(client, 'emb_1', 'trab_1')

    expect(result.deudaCreada).toBeUndefined()
  })
})
