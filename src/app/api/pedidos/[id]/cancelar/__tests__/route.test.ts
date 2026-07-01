// @tests pedidos cancelar — cancelar-dedup fix verification
// Hallazgo: cancelar reutilizaba PUT /api/pedidos/:id con { estado: 'CANCELADO' }.
// Eso no generaba NC automática, no era idempotente bajo retry, y no usaba lock.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/pedidos/[id]/cancelar/route.ts')
const useCasePath = join(process.cwd(), 'src/modules/pedidos/application/use-cases/CancelarPedidoUseCase.ts')

const routeSource = readFileSync(routePath, 'utf-8')
const useCaseSource = readFileSync(useCasePath, 'utf-8')

describe('Cancelar: dedup por estado CANCELADO está DENTRO del lock en el use case', () => {
  it('FIX: el use case verifica estadoEntrega === CANCELADO DENTRO del lock', () => {
    const lockOpen = useCaseSource.indexOf("executeWithLock('NC'")
    const checkIdx = useCaseSource.indexOf("estadoEntrega.get() === 'CANCELADO'")
    const lockClose = useCaseSource.lastIndexOf('})')

    expect(lockOpen).toBeGreaterThan(-1)
    expect(checkIdx).toBeGreaterThan(lockOpen)
    expect(checkIdx).toBeLessThan(lockClose)
  })

  it('FIX: cuando está CANCELADO, el use case retorna { deduped: true }', () => {
    expect(useCaseSource).toMatch(/estadoEntrega\.get\(\)\s*===\s*['"]CANCELADO['"][\s\S]{0,300}return\s*\{[\s\S]+?deduped:\s*true/)
  })
})

describe('Cancelar: la route usa POST /cancelar y delega al use case', () => {
  it('FIX: la route expone POST /api/pedidos/[id]/cancelar', () => {
    expect(routeSource).toMatch(/export\s+async\s+function\s+POST\(/)
  })

  it('FIX: la route NO hace PUT al endpoint genérico de pedido', () => {
    expect(routeSource).not.toMatch(/fetch\(\s*[`'"]\/api\/pedidos\//)
    expect(routeSource).not.toMatch(/method:\s*['"]PUT['"]/)
  })

  it('FIX: la route llama a cancelarPedidoUseCase.execute()', () => {
    expect(routeSource).toMatch(/cancelarPedidoUseCase\.execute\(/)
  })

  it('FIX: la route valida con CancelarSchema', () => {
    expect(routeSource).toMatch(/CancelarSchema\.safeParse/)
  })
})

describe('Cancelar: el response distingue deduped vs nuevo', () => {
  it('FIX: la route detecta result.deduped y propaga 200', () => {
    expect(routeSource).toMatch(/if\s*\(result\.deduped\)/)
    expect(routeSource).toMatch(/return apiSuccess\(result,\s*200\)/)
  })
})

describe('Cancelar: seguridad por rol y ownership', () => {
  it('FIX: ADMIN, ASISTENTE y REPARTIDOR pueden llamar al endpoint', () => {
    expect(routeSource).toMatch(/ROLES\.ADMIN/)
    expect(routeSource).toMatch(/ROLES\.ASISTENTE/)
    expect(routeSource).toMatch(/ROLES\.REPARTIDOR/)
  })

  it('FIX: REPARTIDOR requiere ownership del pedido', () => {
    expect(routeSource).toMatch(/requireOwnership\(['"]pedido['"]/)
    expect(routeSource).toMatch(/No tiene permisos para cancelar este pedido/)
  })
})

describe('Cancelar: logAudit y realtime', () => {
  it('FIX: logAudit aparece en ambos paths (deduped y normal)', () => {
    const logAuditCount = (routeSource.match(/logAudit\(/g) || []).length
    expect(logAuditCount).toBeGreaterThanOrEqual(2)
  })

  it('FIX: publishRealtimeEvent pedido.updated se emite tras cancelar', () => {
    expect(routeSource).toMatch(/publishRealtimeEvent\(['"]pedido\.updated['"]/)
  })
})
