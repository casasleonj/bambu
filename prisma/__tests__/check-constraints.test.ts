// @tests CHECK constraints Fase 3 §1.1
// Hallazgo cubierto: Prisma Schema Language no soporta CHECK. Las
// reglas de integridad vivían solo como comentarios y la BD aceptaba
// estados financieros imposibles.
//
// Fix: migración SQL raw 20260610_add_check_constraints aplica
// 9 CHECK constraints (Pedido, Pago, Factura, Abono).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const migrationPath = join(process.cwd(), 'prisma/migrations/20260610_add_check_constraints/migration.sql')
const schemaPath = join(process.cwd(), 'prisma/schema.prisma')

const migration = readFileSync(migrationPath, 'utf-8')
const schema = readFileSync(schemaPath, 'utf-8')

describe('Fase 3 §1.1: la migración existe y tiene los CHECKs', () => {
  it('FIX: el archivo de migración existe', () => {
    expect(migration).toBeTruthy()
  })

  it('FIX: aplica 4 CHECKs a Pedido (saldo, totalPagado<=total, calc, total>=0)', () => {
    expect(migration).toMatch(/chk_pedido_saldo_nonneg\s+CHECK\s*\(\s*saldo\s*>=\s*0\s*\)/)
    expect(migration).toMatch(/chk_pedido_montopagado_le_total\s+CHECK\s*\(\s*"totalPagado"\s*<=\s*total\s*\)/)
    expect(migration).toMatch(/chk_pedido_saldo_calc\s+CHECK\s*\(\s*saldo\s*=\s*total\s*-\s*"totalPagado"\s*\)/)
    expect(migration).toMatch(/chk_pedido_total_nonneg\s+CHECK\s*\(\s*total\s*>=\s*0\s*\)/)
  })

  it('FIX: aplica CHECK de monto > 0 a Pago', () => {
    expect(migration).toMatch(/chk_pago_monto_pos\s+CHECK\s*\(\s*monto\s*>\s*0\s*\)/)
  })

  it('FIX: aplica 3 CHECKs a Factura (saldo, montoPagado<=total, total>=0)', () => {
    expect(migration).toMatch(/chk_factura_saldo_nonneg\s+CHECK\s*\(\s*saldo\s*>=\s*0\s*\)/)
    expect(migration).toMatch(/chk_factura_montopagado_le_total\s+CHECK\s*\(\s*"montoPagado"\s*<=\s*total\s*\)/)
    expect(migration).toMatch(/chk_factura_total_nonneg\s+CHECK\s*\(\s*total\s*>=\s*0\s*\)/)
  })

  it('FIX: aplica CHECK de monto > 0 a Abono', () => {
    expect(migration).toMatch(/chk_abono_monto_pos\s+CHECK\s*\(\s*monto\s*>\s*0\s*\)/)
  })

  it('FIX: usa NOT VALID + VALIDATE para evitar downtime', () => {
    // Cada CHECK se aplica NOT VALID y luego VALIDATE CONSTRAINT por separado
    const notValidCount = (migration.match(/NOT VALID/g) || []).length
    const validateCount = (migration.match(/VALIDATE CONSTRAINT/g) || []).length
    expect(notValidCount).toBeGreaterThanOrEqual(9)
    expect(validateCount).toBeGreaterThanOrEqual(9)
  })
})

describe('Fase 3 §1.1: schema.prisma referencia la migración (no los CHECKs en schema)', () => {
  it('FIX: el schema tiene un bloque explicativo apuntando a la migración', () => {
    expect(schema).toMatch(/CHECK CONSTRAINTS via raw SQL migration/)
    expect(schema).toMatch(/20260610_add_check_constraints/)
  })

  it('FIX: el schema NO intenta usar @@check (Prisma no lo soporta)', () => {
    // Si alguien intenta meter @@check, Prisma va a fallar con error de sintaxis
    expect(schema).not.toMatch(/@@check\s/)
  })

  it('FIX: el schema documenta los CHECKs aplicados y los pendientes', () => {
    expect(schema).toMatch(/chk_pedido_saldo_nonneg/)
    expect(schema).toMatch(/chk_pago_monto_pos/)
    expect(schema).toMatch(/chk_factura_saldo_nonneg/)
    expect(schema).toMatch(/chk_abono_monto_pos/)
    // Pendientes
    expect(schema).toMatch(/chk_nomina_fechas/)
    expect(schema).toMatch(/chk_gasto_monto/)
  })
})
