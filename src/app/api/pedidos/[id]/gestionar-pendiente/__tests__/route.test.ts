// @tests Fase 2 del rediseño de Pedidos (docs/pedidos/00-plan-frontend-rediseno-integral.md
// D4): primer endpoint HTTP de GestionarPendienteUseCase (N2). El caso de
// uso en sí ya está probado contra Postgres real
// (src/lib/__tests__/integration/gestionar-pendiente-integridad.test.ts,
// ejercita sus guards con datos reales) — este archivo verifica solo el
// thin controller (rol, forma del Zod, delegación correcta, mapeo de
// errores), mismo patrón que resolver-disputa/__tests__/route.test.ts.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routeSource = readFileSync(
  join(process.cwd(), 'src/app/api/pedidos/[id]/gestionar-pendiente/route.ts'),
  'utf-8',
)

describe('POST /api/pedidos/[id]/gestionar-pendiente', () => {
  it('exige requireRole([ADMIN, ASISTENTE])', () => {
    expect(routeSource).toMatch(/requireRole\(\[ROLES\.ADMIN,\s*ROLES\.ASISTENTE\]/)
  })

  it('delega en GestionarPendienteUseCase (no reimplementa la lógica)', () => {
    expect(routeSource).toMatch(/new GestionarPendienteUseCase\(\)/)
    expect(routeSource).toMatch(/useCase\.execute\(/)
  })

  it('valida producto/cantidad/modoInicial con Zod antes de delegar', () => {
    expect(routeSource).toMatch(/z\.enum\(\['PACA_AGUA'/)
    expect(routeSource).toMatch(/cantidad:\s*z\.number\(\)\.int\(\)\.positive\(\)/)
    expect(routeSource).toMatch(/modoInicial:\s*z\.enum\(\['PUNTO',\s*'DOMICILIO'\]\)/)
  })

  it('mapea los 4 errores del use case a códigos HTTP específicos (no 500 genérico)', () => {
    expect(routeSource).toMatch(/PEDIDO_NOT_FOUND[\s\S]{0,100}404/)
    expect(routeSource).toMatch(/PEDIDO_ITEM_NOT_FOUND[\s\S]{0,100}404/)
    expect(routeSource).toMatch(/CANTIDAD_EXCEDE_PENDIENTE[\s\S]{0,100}409/)
    expect(routeSource).toMatch(/OBLIGACION_YA_ACTIVA[\s\S]{0,100}409/)
  })

  it('pasa offlineId al use case para idempotencia', () => {
    expect(routeSource).toMatch(/offlineId:\s*parsed\.data\.offlineId/)
  })
})
