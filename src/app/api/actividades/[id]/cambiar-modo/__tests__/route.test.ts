// @tests Fase 2 del rediseño de Pedidos (docs/pedidos/00-plan-frontend-rediseno-integral.md
// D4): primer endpoint HTTP de CambiarModoActividadUseCase (N2). El caso de
// uso ya está probado contra Postgres real
// (src/lib/__tests__/integration/cambiar-modo-actividad-integridad.test.ts)
// — este archivo verifica solo el thin controller.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routeSource = readFileSync(
  join(process.cwd(), 'src/app/api/actividades/[id]/cambiar-modo/route.ts'),
  'utf-8',
)

describe('POST /api/actividades/[id]/cambiar-modo', () => {
  it('exige requireRole([ADMIN, ASISTENTE])', () => {
    expect(routeSource).toMatch(/requireRole\(\[ROLES\.ADMIN,\s*ROLES\.ASISTENTE\]/)
  })

  it('delega en CambiarModoActividadUseCase (no reimplementa la lógica)', () => {
    expect(routeSource).toMatch(/new CambiarModoActividadUseCase\(\)/)
    expect(routeSource).toMatch(/useCase\.execute\(/)
  })

  it('valida modoDestino con Zod antes de delegar', () => {
    expect(routeSource).toMatch(/modoDestino:\s*z\.enum\(\['PUNTO',\s*'DOMICILIO'\]\)/)
  })

  it('mapea los errores del use case a códigos HTTP específicos (no 500 genérico)', () => {
    expect(routeSource).toMatch(/ACTIVIDAD_NOT_FOUND[\s\S]{0,100}404/)
    expect(routeSource).toMatch(/ACTIVIDAD_NO_MODIFICABLE[\s\S]{0,100}409/)
    expect(routeSource).toMatch(/ACTIVIDAD_SIN_MODO[\s\S]{0,100}409/)
  })
})
