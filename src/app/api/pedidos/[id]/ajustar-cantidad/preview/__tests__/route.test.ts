// @tests Fase 6-0 del rediseño de Pedidos (docs/pedidos/fase6-g11-flujo-plan.md
// §2): proyección read-only del impacto de una corrección de cantidad (G11
// rama A). La lógica está probada en ProyectarAjusteCantidadUseCase.test.ts +
// la integración; acá se verifica el thin controller (rol, Zod, delegación,
// mapeo de errores, read-only por construcción) y el mapeo de guards a 409 en
// el commit.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const previewSource = readFileSync(
  join(process.cwd(), 'src/app/api/pedidos/[id]/ajustar-cantidad/preview/route.ts'),
  'utf-8',
)
const commitSource = readFileSync(
  join(process.cwd(), 'src/app/api/pedidos/[id]/ajustar-cantidad/route.ts'),
  'utf-8',
)
const ucSource = readFileSync(
  join(process.cwd(), 'src/modules/pedidos/application/use-cases/ProyectarAjusteCantidadUseCase.ts'),
  'utf-8',
)

describe('POST /api/pedidos/[id]/ajustar-cantidad/preview', () => {
  it('exige requireRole([ADMIN, ASISTENTE]) (paridad con el commit)', () => {
    expect(previewSource).toMatch(/requireRole\(\[ROLES\.ADMIN,\s*ROLES\.ASISTENTE\]/)
  })

  it('delega en ProyectarAjusteCantidadUseCase (no reimplementa la lógica)', () => {
    expect(previewSource).toMatch(/new ProyectarAjusteCantidadUseCase\(\)/)
    expect(previewSource).toMatch(/useCase\.execute\(/)
  })

  it('valida producto + cantidadNueva con Zod', () => {
    expect(previewSource).toMatch(/producto:\s*z\.string\(\)\.min\(1\)/)
    expect(previewSource).toMatch(/cantidadNueva:\s*z\.number\(\)\.int\(\)\.min\(0\)/)
  })

  it('mapea PEDIDO_NOT_FOUND / PEDIDO_ITEM_NOT_FOUND a 404', () => {
    expect(previewSource).toMatch(/PEDIDO_NOT_FOUND[\s\S]{0,80}404/)
    expect(previewSource).toMatch(/PEDIDO_ITEM_NOT_FOUND[\s\S]{0,80}404/)
  })

  it('el use case es read-only por construcción (guardrail estático)', () => {
    const sinComentarios = ucSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    expect(sinComentarios).not.toMatch(/withAdvisoryLock|executeSerializable|\$transaction/)
    expect(sinComentarios).not.toMatch(/\bprisma\.\w+\.(create|update|delete|upsert|createMany|updateMany|deleteMany)\b/)
    expect(sinComentarios).not.toMatch(/\btx\.\w+\.(create|update|delete|upsert)\b/)
    expect(sinComentarios).not.toMatch(/logAudit|incrementMetric|publishRealtimeEvent/)
  })
})

describe('POST /api/pedidos/[id]/ajustar-cantidad — mapeo de guards (Fase 6-0)', () => {
  it('los 3 guards de G11 → 409 con code estable', () => {
    for (const code of [
      'CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA',
      'CORRECCION_PEDIDO_CERRADO',
      'CORRECCION_GENERARIA_SOBREPAGO',
    ]) {
      expect(commitSource).toContain(code)
    }
    expect(commitSource).toMatch(/apiError\(msg,\s*409,\s*\{\s*code:\s*guardCode\s*\}\)/)
  })

  it('PEDIDO_NOT_FOUND / PEDIDO_ITEM_NOT_FOUND → 404', () => {
    expect(commitSource).toMatch(/PEDIDO_NOT_FOUND[\s\S]{0,80}404/)
    expect(commitSource).toMatch(/PEDIDO_ITEM_NOT_FOUND[\s\S]{0,80}404/)
  })

  it('AJUSTE_EXIGE_AUTORIZACION sigue mapeado a 403 (sin cambio)', () => {
    expect(commitSource).toMatch(/AJUSTE_EXIGE_AUTORIZACION[\s\S]{0,80}403/)
  })

  it('el use case de dominio NO se importa/modifica desde el controlador para el mapeo', () => {
    // El controlador solo inspecciona error.message; no reimplementa guards.
    expect(commitSource).toMatch(/new AjustarPedidoCantidadUseCase\(\)/)
    expect(commitSource).not.toMatch(/cantEntrega|estadoEntrega\s*[=!]==|totalPagado\s*>/)
  })
})
