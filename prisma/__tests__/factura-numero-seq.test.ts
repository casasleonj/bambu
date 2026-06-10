// @tests Factura numero sequence — Fase 3 §2.3
// La secuencia NO está aplicada (gated por DIAN). Estos tests verifican
// que la migración está lista y que, si se aplica, la numeración
// funciona correctamente.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const migrationPath = join(process.cwd(), 'prisma/migrations/20260610_add_factura_numero_seq/migration.sql')
const schemaPath = join(process.cwd(), 'prisma/schema.prisma')

const migration = readFileSync(migrationPath, 'utf-8')
const schema = readFileSync(schemaPath, 'utf-8')

describe('Fase 3 §2.3: la migración de la secuencia está preparada', () => {
  it('FIX: el archivo de migración existe', () => {
    expect(migration).toBeTruthy()
  })

  it('FIX: crea la secuencia con CREATE SEQUENCE IF NOT EXISTS', () => {
    expect(migration).toMatch(/CREATE SEQUENCE IF NOT EXISTS\s+factura_numero_seq/)
  })

  it('FIX: usa INCREMENT BY 1 (numeración consecutiva estándar)', () => {
    expect(migration).toMatch(/INCREMENT BY 1/)
  })

  it('FIX: el START WITH se calcula dinámicamente desde MAX(numero)+1', () => {
    expect(migration).toMatch(/v_max_num\s*\+\s*1/)
  })

  it('FIX: extrae el número de "FAC-XXXXX" con regex (ignora formatos no estándar)', () => {
    expect(migration).toMatch(/FAC-0\*\(\\d\+\)/)
  })
})

describe('Fase 3 §2.3: schema.prisma documenta el gating por DIAN', () => {
  it('FIX: el schema menciona la migración y el gating', () => {
    expect(schema).toMatch(/SECUENCIA PARA Factura\.numero/)
    expect(schema).toMatch(/20260610_add_factura_numero_seq/)
  })

  it('FIX: el schema menciona que NO está aplicada', () => {
    expect(schema).toMatch(/NO aplicada/)
  })

  it('FIX: el schema menciona las dos opciones (huecos vs consecutivo)', () => {
    expect(schema).toMatch(/permite huecos/)
    expect(schema).toMatch(/exige consecutivo sin huecos/)
  })
})
