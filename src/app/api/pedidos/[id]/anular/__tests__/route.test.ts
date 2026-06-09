// @tests pedidos anular — F-N21 fix verification
// Hallazgo: el dedup por estado ANULADO estaba en la route, fuera
// del lock NC. Dos requests idénticos pasaban el check y el segundo
// recibía 400 'YA_ANULADO' en vez de 200 idempotente.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/pedidos/[id]/anular/route.ts')
const useCasePath = join(process.cwd(), 'src/modules/pedidos/application/use-cases/AnularPedidoUseCase.ts')

const routeSource = readFileSync(routePath, 'utf-8')
const useCaseSource = readFileSync(useCasePath, 'utf-8')

describe('F-N21: dedup por estado ANULADO está DENTRO del lock en el use case', () => {
  it('FIX: el use case verifica estadoEntrega === ANULADO DENTRO del lock', () => {
    const lockOpen = useCaseSource.indexOf("executeWithLock('NC'")
    const checkIdx = useCaseSource.indexOf("estadoEntrega.get() === 'ANULADO'")
    const lockClose = useCaseSource.lastIndexOf('})')

    expect(lockOpen).toBeGreaterThan(-1)
    expect(checkIdx).toBeGreaterThan(lockOpen)
    expect(checkIdx).toBeLessThan(lockClose)
  })

  it('FIX: cuando está ANULADO, el use case retorna { deduped: true }', () => {
    // El bloque de check retorna deduped
    expect(useCaseSource).toMatch(/estadoEntrega\.get\(\)\s*===\s*['"]ANULADO['"][\s\S]{0,300}return\s*\{[\s\S]+?deduped:\s*true/)
  })

  it('FIX: hay un comentario F-N21 explicando el fix', () => {
    expect(useCaseSource).toMatch(/FIX F-N21/)
  })
})

describe('F-N21: la route ya NO tiene el dedup check redundante', () => {
  it('FIX: la route NO hace findUnique para chequear estadoEntrega', () => {
    expect(routeSource).not.toMatch(/pedidoActual\s*=\s*await\s+prisma\.pedido\.findUnique/)
  })

  it('FIX: la route NO tiene un if (pedidoActual?.estadoEntrega === "ANULADO")', () => {
    expect(routeSource).not.toMatch(/pedidoActual\?\.estadoEntrega\s*===\s*['"]ANULADO['"]/)
  })

  it('FIX: la route tiene un comentario F-N21 explicando que se movió al use case', () => {
    expect(routeSource).toMatch(/F-N21/)
  })
})

describe('F-N21: el response distingue deduped vs nuevo', () => {
  it('FIX: la route detecta result.deduped y propaga 200', () => {
    expect(routeSource).toMatch(/if\s*\(result\.deduped\)/)
    expect(routeSource).toMatch(/return apiSuccess\(result,\s*200\)/)
  })
})

describe('F-N21: la route sigue trabajando (no rompe flujo normal)', () => {
  it('FIX: la route sigue llamando a anularPedidoUseCase.execute()', () => {
    expect(routeSource).toMatch(/anularPedidoUseCase\.execute\(/)
  })

  it('FIX: el logAudit sigue funcionando (en ambos paths)', () => {
    // logAudit aparece al menos 2 veces (uno por path)
    const logAuditCount = (routeSource.match(/logAudit\(/g) || []).length
    expect(logAuditCount).toBeGreaterThanOrEqual(2)
  })
})
