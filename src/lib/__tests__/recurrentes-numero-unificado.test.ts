// Regresión del incidente 2026-10-08: las recurrencias insertaban Pedido
// sin numero; el DEFAULT de Postgres usaba una secuencia legacy divergente.
// Esta prueba es un guard de contrato del writer; E2E con Postgres valida
// además unicidad y persistencia bajo concurrencia.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(process.cwd(), 'src/lib/recurrentes.ts'), 'utf8')
const seqSource = readFileSync(join(process.cwd(), 'src/lib/sequence.ts'), 'utf8')

describe('Recurrentes — Pedido.numero', () => {
  it('consume la misma secuencia que los pedidos normales antes del insert', () => {
    const insert = source.indexOf('const creado = await tx.pedido.create(')
    expect(insert).toBeGreaterThan(-1)
    const generacion = source.indexOf("const numero = await getNextNumero(tx, { model: 'pedido' })")
    expect(generacion).toBeGreaterThan(-1)
    expect(generacion).toBeLessThan(insert)
    const body = source.slice(insert, source.indexOf('// 8. Crear factura', insert))
    expect(body).toMatch(/data:\s*\{\s*numero\s*,/)
  })

  it('mapea el modelo pedido a pedido_numero_seq y no al default legacy', () => {
    expect(seqSource).toContain("'pedido:numero': 'pedido_numero_seq'")
    expect(source).toContain('import { getNextNumero } from "@/lib/sequence"')
  })
})
