// @tests FASE 7 — clasificación temporal de venta libre (puro)
// ADR-OFFLINE-001, contrato §11.

import { describe, it, expect } from 'vitest'
import {
  clasificarVentaLibre,
  UMBRAL_TARDIA_MS,
  UMBRAL_SOSPECHOSA_MS,
} from '@/lib/venta-libre-clasificacion'

const now = new Date('2026-08-17T12:00:00.000Z')

describe('clasificarVentaLibre — contrato §11', () => {
  it('NORMAL: captura reciente y ocurrencia consistente', () => {
    const captured = new Date(now.getTime() - 5 * 60 * 1000) // hace 5 min
    const occurred = new Date(captured.getTime() - 2 * 60 * 1000) // 2 min antes de captura
    expect(clasificarVentaLibre({ occurredAt: occurred, capturedAt: captured, serverReceivedAt: now }))
      .toBe('NORMAL')
  })

  it('TARDIA: la venta llegó mucho después de capturarse (offline prolongado)', () => {
    const captured = new Date(now.getTime() - UMBRAL_TARDIA_MS - 60 * 1000) // >30min
    const occurred = new Date(captured.getTime() - 60 * 1000)
    expect(clasificarVentaLibre({ occurredAt: occurred, capturedAt: captured, serverReceivedAt: now }))
      .toBe('TARDIA')
  })

  it('SOSPECHOSA: la venta llegó MUCHO después (>24h)', () => {
    const captured = new Date(now.getTime() - UMBRAL_SOSPECHOSA_MS - 60 * 1000)
    const occurred = new Date(captured.getTime() - 60 * 1000)
    expect(clasificarVentaLibre({ occurredAt: occurred, capturedAt: captured, serverReceivedAt: now }))
      .toBe('SOSPECHOSA')
  })

  it('SOSPECHOSA: occurredAt mucho después de capturedAt (timestamp manipulado)', () => {
    const captured = new Date(now.getTime() - 5 * 60 * 1000)
    const occurred = new Date(captured.getTime() + UMBRAL_TARDIA_MS + 60 * 1000)
    expect(clasificarVentaLibre({ occurredAt: occurred, capturedAt: captured, serverReceivedAt: now }))
      .toBe('SOSPECHOSA')
  })

  it('NORMAL (legacy): sin occurredAt/capturedAt no se marca (no bloquear)', () => {
    expect(clasificarVentaLibre({ occurredAt: null, capturedAt: null, serverReceivedAt: now }))
      .toBe('NORMAL')
  })
})
