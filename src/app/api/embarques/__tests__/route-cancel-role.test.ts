// @tests /api/embarques — rol de cancelación unificado (plan Fase 2, deuda #3)
//
// `DELETE /api/embarques?id=` y `DELETE /api/embarques/[id]` son la misma
// acción (cancelar embarque). Antes el primero exigía solo ADMIN y el
// segundo ADMIN+ASISTENTE — inconsistencia señalada por la auditoría
// (B.8 #2). Este test fija que ambos caminos exigen el mismo rol.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const collectionRoute = readFileSync(
  join(process.cwd(), 'src/app/api/embarques/route.ts'),
  'utf-8',
)
const resourceRoute = readFileSync(
  join(process.cwd(), 'src/app/api/embarques/[id]/route.ts'),
  'utf-8',
)

/** Extrae el array de roles del `requireRole` dentro del handler DELETE. */
function rolesInDelete(source: string): string {
  const deleteIdx = source.indexOf('export async function DELETE')
  expect(deleteIdx).toBeGreaterThan(-1)
  const body = source.slice(deleteIdx, deleteIdx + 600)
  const match = body.match(/requireRole\(\s*(\[[^\]]*\])/)
  expect(match, 'DELETE debe llamar requireRole').not.toBeNull()
  return match![1].replace(/\s+/g, '')
}

describe('cancelar embarque: mismo rol por ambos endpoints', () => {
  it('DELETE /api/embarques (colección) exige ADMIN + ASISTENTE', () => {
    const roles = rolesInDelete(collectionRoute)
    expect(roles).toContain('ROLES.ADMIN')
    expect(roles).toContain('ROLES.ASISTENTE')
  })

  it('DELETE /api/embarques/[id] exige ADMIN + ASISTENTE', () => {
    const roles = rolesInDelete(resourceRoute)
    expect(roles).toContain('ROLES.ADMIN')
    expect(roles).toContain('ROLES.ASISTENTE')
  })

  it('ambos endpoints declaran el mismo conjunto de roles', () => {
    expect(rolesInDelete(collectionRoute)).toBe(rolesInDelete(resourceRoute))
  })
})
