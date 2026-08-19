// @tests FASE FINAL — endpoints HTTP de los conceptos nuevos del plan maestro
// Verifica que recovery, obligación/actividad, ajuste de pedido, promoción,
// responsabilidad, botellones y movimientos físicos quedaron expuestos como
// endpoints (no solo como use cases de aplicación).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf-8')
}

describe('endpoints del ledger/plan maestro', () => {
  it('POST /api/embarques/[id]/recovery usa CrearRecoveryDecisionUseCase', () => {
    const s = read('src/app/api/embarques/[id]/recovery/route.ts')
    expect(s).toMatch(/CrearRecoveryDecisionUseCase/)
    expect(s).toMatch(/requireRole\(\[ROLES\.ADMIN, ROLES\.ASISTENTE\]/)
  })

  it('POST /api/obligaciones/[id]/asignar usa AsignarActividadUseCase', () => {
    const s = read('src/app/api/obligaciones/[id]/asignar/route.ts')
    expect(s).toMatch(/AsignarActividadUseCase/)
    expect(s).toMatch(/SOBRECONSUMO/)
  })

  it('POST /api/pedidos/[id]/ajustar-cantidad usa AjustarPedidoCantidadUseCase', () => {
    const s = read('src/app/api/pedidos/[id]/ajustar-cantidad/route.ts')
    expect(s).toMatch(/AjustarPedidoCantidadUseCase/)
    expect(s).toMatch(/AJUSTE_EXIGE_AUTORIZACION/)
  })

  it('POST /api/promociones valida autorización y crea PromotionRule', () => {
    const s = read('src/app/api/promociones/route.ts')
    expect(s).toMatch(/validarPromocion/)
    expect(s).toMatch(/promotionRule\.create/)
  })

  it('POST /api/responsabilidades/[id]/resolver usa ResolverResponsibilityCaseUseCase', () => {
    const s = read('src/app/api/responsabilidades/[id]/resolver/route.ts')
    expect(s).toMatch(/ResolverResponsibilityCaseUseCase/)
    expect(s).toMatch(/RESUELTA_CON_CARGO_EXIGE_AUTORIZACION/)
  })

  it('POST /api/embarques/[id]/botellones usa movimientos físicos separados', () => {
    const s = read('src/app/api/embarques/[id]/botellones/route.ts')
    expect(s).toMatch(/construirMovimientoRecogidaBotellon/)
    expect(s).toMatch(/construirMovimientoEntregaBotellon/)
    expect(s).toMatch(/validarMovimientoFisico/)
  })

  it('POST /api/embarques/[id]/movimientos valida movimiento físico genérico', () => {
    const s = read('src/app/api/embarques/[id]/movimientos/route.ts')
    expect(s).toMatch(/validarMovimientoFisico/)
    expect(s).toMatch(/AJUSTE_AUTORIZADO/)
  })

  it('GET /api/embarques/[id]/movimientos exige requireOwnership antes de listar', () => {
    const s = read('src/app/api/embarques/[id]/movimientos/route.ts')
    const getStart = s.indexOf('export async function GET')
    const getBody = s.slice(getStart)
    expect(getBody).toMatch(/requireAuth\(\)/)
    expect(getBody).toMatch(/requireOwnership\('embarque', id/)
    expect(getBody).toMatch(/embarqueMovimiento\.findMany/)
    expect(getBody).toMatch(/orderBy: \{ createdAt: 'desc' \}/)
  })

  it('GET /api/embarques/[id]/recovery exige requireOwnership antes de listar', () => {
    const s = read('src/app/api/embarques/[id]/recovery/route.ts')
    const getStart = s.indexOf('export async function GET')
    const getBody = s.slice(getStart)
    expect(getBody).toMatch(/requireAuth\(\)/)
    expect(getBody).toMatch(/requireOwnership\('embarque', id/)
    expect(getBody).toMatch(/recoveryDecision\.findMany/)
    expect(getBody).toMatch(/sourceEvent: \{ select/)
  })
})
