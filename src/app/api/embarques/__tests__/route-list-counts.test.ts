// @tests /api/embarques GET — fila de actividad del Command Center (Fase 3)
//
// El GET debe incluir el _count de las relaciones del ledger nuevo para que
// la tarjeta del Command Center muestre "N movimientos · N recovery" sin N+1.
// Ver docs/embarques/02-api-contract.md §1.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(
  join(process.cwd(), 'src/app/api/embarques/route.ts'),
  'utf-8',
)
const ssrPage = readFileSync(
  join(process.cwd(), 'src/app/(app)/embarques/page.tsx'),
  'utf-8',
)

const RELACIONES = ['pedidos', 'movimientos', 'recoveries', 'sustituciones', 'responsibilityCases']

describe('GET /api/embarques incluye _count de actividad', () => {
  it('el include del GET pide _count de las 5 relaciones', () => {
    const countBlock = source.slice(source.indexOf('_count: {'), source.indexOf('_count: {') + 260)
    for (const rel of RELACIONES) {
      expect(countBlock, `_count debe incluir ${rel}`).toContain(`${rel}: true`)
    }
  })

  it('el SSR de /embarques pide el mismo _count (consistencia con el fetch cliente)', () => {
    const countBlock = ssrPage.slice(ssrPage.indexOf('_count: {'), ssrPage.indexOf('_count: {') + 260)
    for (const rel of RELACIONES) {
      expect(countBlock, `SSR _count debe incluir ${rel}`).toContain(`${rel}: true`)
    }
  })
})
