// @tests Fase 5-0 del rediseño de Pedidos (docs/pedidos/fase5-n2-flujo-plan.md
// P2): proyección read-only del impacto económico de una acción N2. La lógica
// está probada en ProyectarGestionPendienteUseCase.test.ts + la integración;
// acá se verifica solo el thin controller (rol, Zod, delegación, mapeo de
// errores, read-only por construcción).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routeSource = readFileSync(
  join(process.cwd(), 'src/app/api/pedidos/[id]/gestionar-pendiente/preview/route.ts'),
  'utf-8',
)
const ucSource = readFileSync(
  join(process.cwd(), 'src/modules/embarques/application/use-cases/ProyectarGestionPendienteUseCase.ts'),
  'utf-8',
)

describe('POST /api/pedidos/[id]/gestionar-pendiente/preview', () => {
  it('exige requireRole([ADMIN, ASISTENTE])', () => {
    expect(routeSource).toMatch(/requireRole\(\[ROLES\.ADMIN,\s*ROLES\.ASISTENTE\]/)
  })

  it('delega en ProyectarGestionPendienteUseCase (no reimplementa la lógica)', () => {
    expect(routeSource).toMatch(/new ProyectarGestionPendienteUseCase\(\)/)
    expect(routeSource).toMatch(/useCase\.execute\(/)
  })

  it('valida accion + campos condicionales con Zod (superRefine)', () => {
    expect(routeSource).toMatch(/accion:\s*z\.enum\(\['gestionar',\s*'cambiar-modo',\s*'liberar'\]\)/)
    expect(routeSource).toMatch(/superRefine/)
    expect(routeSource).toMatch(/gestionar requiere producto, cantidad y modoDestino/)
    expect(routeSource).toMatch(/requiere actividadId/)
  })

  it('mapea PEDIDO_NOT_FOUND / PEDIDO_ITEM_NOT_FOUND / ACTIVIDAD_NOT_FOUND a 404', () => {
    expect(routeSource).toMatch(/PEDIDO_NOT_FOUND[\s\S]{0,80}404/)
    expect(routeSource).toMatch(/PEDIDO_ITEM_NOT_FOUND[\s\S]{0,80}404/)
    expect(routeSource).toMatch(/ACTIVIDAD_NOT_FOUND[\s\S]{0,80}404/)
  })

  it('el use case es read-only por construcción (guardrail estático)', () => {
    // no invoca el service que aplica el diferencial (solo lo menciona en el docstring),
    // ni locks, ni $transaction de escritura, ni escrituras de prisma
    const sinComentarios = ucSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    expect(sinComentarios).not.toMatch(/aplicarConsecuenciaEconomicaDiferencial\s*\(|revertirDiferencialEnPedido\s*\(/)
    expect(sinComentarios).not.toMatch(/withAdvisoryLock|executeSerializable|\$transaction/)
    expect(sinComentarios).not.toMatch(/\bprisma\.\w+\.(create|update|delete|upsert|createMany|updateMany|deleteMany)\b/)
    expect(ucSource).toMatch(/[Cc]ompone `calcularDiferencial`/)
  })
})
