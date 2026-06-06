// @tests deudas/[id] route PATCH — F-N16 fix verification
// Hallazgo: read+validate+update SIN tx. Dos PATCH simultáneos
// podían perderse el uno al otro (last-write-wins silencioso)
// sin error. Ajuste manual perdido.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/deudas/[id]/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-N16: PATCH usa optimistic locking con updatedAt', () => {
  // Extraer el PATCH handler SIN comentarios
  const patchStart = source.indexOf('export async function PATCH')
  const patchSourceWithComments = source.substring(patchStart)
  // Quitar comentarios (líneas que empiezan con //)
  const patchSource = patchSourceWithComments
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')

  it('FIX: el PATCH lee la deuda ANTES del update (incluye updatedAt)', () => {
    // El findUnique debe estar antes del updateMany
    const findIdx = patchSource.indexOf('findUnique')
    const updateManyIdx = patchSource.indexOf('updateMany')
    expect(findIdx).toBeGreaterThan(-1)
    expect(updateManyIdx).toBeGreaterThan(findIdx)
  })

  it('FIX: el updateMany usa updatedAt como condición (optimistic locking)', () => {
    // where: { id, updatedAt: deuda.updatedAt }
    // (el { puede tener saltos de línea antes de id,)
    expect(patchSource).toMatch(/where:\s*\{[\s\S]*?id,[\s\S]*?updatedAt:\s*deuda\.updatedAt/)
  })

  it('FIX: el PATCH usa updateMany atómico (no update directo)', () => {
    // Antes: prisma.deudaTrabajador.update({ where: { id }, data: ... })
    // Ahora: prisma.deudaTrabajador.updateMany({ where: { id, updatedAt }, data: ... })
    expect(patchSource).toMatch(/prisma\.deudaTrabajador\.updateMany/)

    // El updateMany debe estar DENTRO del try (no en un helper separado)
    expect(patchSource).toMatch(/updateResult\.count/)
  })

  it('FIX: si count === 0, devuelve 409 con mensaje claro', () => {
    expect(patchSource).toMatch(/updateResult\.count\s*===\s*0/)
    expect(patchSource).toMatch(/modificada por otro usuario/)
    // El return apiError está partido en varias líneas
    expect(patchSource).toMatch(/return apiError\([\s\S]+?409\s*,\s*\)/)
  })

  it('FIX: después del updateMany, re-leer la deuda para devolver estado final', () => {
    // Hay un findUnique POST-updateMany
    const findMany = patchSource.match(/prisma\.deudaTrabajador\.findUnique/g)
    expect(findMany).not.toBeNull()
    // Debe haber al menos 2 findUnique (uno pre, uno post)
    expect(findMany!.length).toBeGreaterThanOrEqual(2)
  })
})

describe('F-N16: el catch sigue funcionando', () => {
  const patchStart = source.indexOf('export async function PATCH')
  const patchSource = source.substring(patchStart)
  const catchBlock = patchSource.match(/catch[\s\S]+?(?=\n\})/)?.[0] || ''

  it('FIX: el catch genérico loggea y devuelve 500', () => {
    expect(catchBlock).toMatch(/logger\.error/)
    expect(catchBlock).toMatch(/return apiError\(['"]Error actualizando deuda['"],\s*500\)/)
  })
})

describe('F-N16: la validación de montoPendiente sigue funcionando', () => {
  const patchStart = source.indexOf('export async function PATCH')
  const patchSource = source.substring(patchStart)

  it('FIX: valida montoPendiente <= montoOriginal', () => {
    expect(patchSource).toMatch(/montoPendiente\s*>\s*Number\(deuda\.montoOriginal\)/)
    expect(patchSource).toMatch(/no puede exceder el monto original/)
  })

  it('FIX: si la validación falla, devuelve 400', () => {
    // El early return tiene 400
    expect(patchSource).toMatch(/return apiError\(['"]El monto pendiente no puede exceder el monto original['"],\s*400\)/)
  })
})

describe('F-N16: el logAudit sigue funcionando (fuera del update)', () => {
  const patchStart = source.indexOf('export async function PATCH')
  const patchSource = source.substring(patchStart)

  it('FIX: logAudit se ejecuta solo si el updateMany tuvo éxito', () => {
    // El logAudit debe estar DESPUÉS del if (updateResult.count === 0)
    const updateResultIdx = patchSource.indexOf('updateResult.count')
    const logAuditIdx = patchSource.indexOf('logAudit(')
    expect(logAuditIdx).toBeGreaterThan(updateResultIdx)
  })

  it('FIX: logAudit es fire-and-forget con .catch', () => {
    expect(patchSource).toMatch(/logAudit\([\s\S]+?\)\.catch\(\(\)\s*=>\s*\{\}\)/)
  })
})
