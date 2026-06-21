// @tests recurrentes client — F-N14 parte 2: el cliente envía offlineId
// Hallazgo: handleGenerar hacía fetch directo sin offlineId, rompiendo
// la deduplicación offline-first de generación de pedidos recurrentes.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const clientPath = join(process.cwd(), 'src/app/(app)/recurrentes/recurrentes-client/index.tsx')
const clientSource = readFileSync(clientPath, 'utf-8')

describe('F-N14: cliente de recurrentes envía offlineId', () => {
  it('FIX: importa generateUUID', () => {
    expect(clientSource).toMatch(/import\s+\{[^}]*generateUUID[^}]*\}\s+from\s+['"]@\/lib\/uuid['"]/)
  })

  it('FIX: handleGenerar genera un offlineId antes del fetch', () => {
    // El offlineId debe generarse dentro de handleGenerar, antes del fetch
    const handleStart = clientSource.indexOf('async function handleGenerar')
    expect(handleStart).toBeGreaterThan(-1)
    const fetchIdx = clientSource.indexOf("fetch('/api/pedidos/recurrentes'", handleStart)
    expect(fetchIdx).toBeGreaterThan(handleStart)

    const block = clientSource.substring(handleStart, fetchIdx)
    expect(block).toMatch(/const\s+offlineId\s*=\s*generateUUID\(\)/)
  })

  it('FIX: el body del POST incluye offlineId junto a decisiones', () => {
    const handleStart = clientSource.indexOf('async function handleGenerar')
    const fetchIdx = clientSource.indexOf("fetch('/api/pedidos/recurrentes'", handleStart)
    const block = clientSource.substring(handleStart, fetchIdx + 400)

    expect(block).toMatch(/body:\s*JSON\.stringify\(\s*\{\s*decisiones:\s*decisionesArray,\s*offlineId\s*\}\)/)
  })
})
