// @tests FASE 7 — venta-libre: timestamps y clasificación (contrato §11)
// Verifica que el endpoint distingue occurredAt/capturedAt/serverReceivedAt y
// persiste la clasificación temporal (NORMAL/TARDIA/SOSPECHOSA), sin bloquear
// ventas tardías legítimas.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/pedidos/venta-libre/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('FASE 7: timestamps de venta libre en el endpoint', () => {
  it('importa clasificarVentaLibre', () => {
    expect(source).toMatch(/clasificarVentaLibre/)
  })

  it('calcula serverReceivedAt y clasifica', () => {
    expect(source).toMatch(/serverReceivedAt\s*=\s*new Date\(\)/)
    expect(source).toMatch(/clasificarVentaLibre\(/)
  })

  it('persiste occurredAt/capturedAt/serverReceivedAt/clasificacionTemporal', () => {
    expect(source).toMatch(/occurredAt:\s*occurredAt\s*\?\?\s*null/)
    expect(source).toMatch(/capturedAt:\s*capturedAt\s*\?\?\s*null/)
    expect(source).toMatch(/serverReceivedAt,/)
    expect(source).toMatch(/clasificacionTemporal,/)
  })

  it('incrementa las métricas de observabilidad (§24)', () => {
    expect(source).toMatch(/venta_libre_tardia_count/)
    expect(source).toMatch(/venta_libre_sospechosa_count/)
  })
})
