// @tests Fase 2 del rediseño de Pedidos (docs/pedidos/00-plan-frontend-rediseno-integral.md
// D4): primer endpoint HTTP de LiberarActividadUseCase (N2). El caso de uso
// ya está probado contra Postgres real
// (src/lib/__tests__/integration/liberar-actividad-integridad.test.ts) —
// este archivo verifica solo el thin controller.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routeSource = readFileSync(
  join(process.cwd(), 'src/app/api/actividades/[id]/liberar/route.ts'),
  'utf-8',
)

describe('POST /api/actividades/[id]/liberar', () => {
  it('exige requireRole([ADMIN, ASISTENTE])', () => {
    expect(routeSource).toMatch(/requireRole\(\[ROLES\.ADMIN,\s*ROLES\.ASISTENTE\]/)
  })

  it('delega en LiberarActividadUseCase (no reimplementa la lógica)', () => {
    expect(routeSource).toMatch(/new LiberarActividadUseCase\(\)/)
    expect(routeSource).toMatch(/useCase\.execute\(/)
  })

  it('exige motivo no vacío (nunca liberar sin justificación, ver ALS A8)', () => {
    expect(routeSource).toMatch(/motivo:\s*z\.string\(\)\.min\(1\)/)
  })

  it('mapea los errores del use case a códigos HTTP específicos (no 500 genérico)', () => {
    expect(routeSource).toMatch(/ACTIVIDAD_NOT_FOUND[\s\S]{0,100}404/)
    expect(routeSource).toMatch(/ACTIVIDAD_NO_MODIFICABLE[\s\S]{0,100}409/)
  })
})
