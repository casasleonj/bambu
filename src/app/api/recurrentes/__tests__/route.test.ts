// @tests recurrentes route POST + PUT — F-26 fix verification
// Hallazgos F-26a + F-26b:
//   F-26a: POST con findUnique + create FUERA de tx. Dos admins
//   creando plantilla para el mismo cliente casi simultáneo
//   pasaban el check, segundo recibía P2002 → 409 (vía catch).
//   F-26b: PUT con findUnique + update sin verificar updatedAt.
//   Dos PATCH con cambios a `cadaNDias` recalculaban
//   `proxGeneracion` desde `ultimaGeneracion` stale (last-write-wins).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/recurrentes/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-26a: recurrentes POST usa tx atómica', () => {
  // Extraer el POST handler
  const postStart = source.indexOf('export async function POST')
  const putStart = source.indexOf('export async function PUT')
  const postSource = source.substring(postStart, putStart)

  it('FIX: el POST usa prisma.$transaction', () => {
    expect(postSource).toMatch(/prisma\.\$transaction\(/)
  })

  it('FIX: el findUnique de clienteId está DENTRO de la tx', () => {
    expect(postSource).toMatch(/tx\.plantillaRecurrente\.findUnique/)
  })

  it('FIX: el create usa tx.plantillaRecurrente.create', () => {
    expect(postSource).toMatch(/tx\.plantillaRecurrente\.create/)
  })

  it('FIX: si ya existe, throw PLANTILLA_YA_EXISTE', () => {
    expect(postSource).toMatch(/PLANTILLA_YA_EXISTE/)
  })

  it('FIX: el catch mapea PLANTILLA_YA_EXISTE → 409', () => {
    const catchBlock = postSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/PLANTILLA_YA_EXISTE/)
    expect(catchBlock).toMatch(/409/)
  })

  it('FIX: el catch sigue manejando P2002 (defensa en profundidad)', () => {
    const catchBlock = postSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/P2002/)
  })
})

describe('F-26b: recurrentes PUT usa optimistic locking con updatedAt', () => {
  const putStart = source.indexOf('export async function PUT')
  const deleteStart = source.indexOf('export async function DELETE')
  const putSource = source.substring(putStart, deleteStart)

  it('FIX: el PUT usa updateMany con condición sobre updatedAt', () => {
    expect(putSource).toMatch(/prisma\.plantillaRecurrente\.updateMany\(\s*\{[\s\S]+?where:\s*\{[\s\S]+?id,[\s\S]+?updatedAt:\s*existente\.updatedAt/)
  })

  it('FIX: si count === 0, devuelve 409 con mensaje claro', () => {
    expect(putSource).toMatch(/updateResult\.count\s*===\s*0/)
    expect(putSource).toMatch(/modificada por otro usuario/)
    expect(putSource).toMatch(/409/)
  })

  it('FIX: re-leer la plantilla post-updateMany para devolver estado final', () => {
    expect(putSource).toMatch(/prisma\.plantillaRecurrente\.findUnique\(\s*\{[\s\S]+?where:\s*\{\s*id/)
  })

  it('FIX: el findUnique de read se hace ANTES del updateMany', () => {
    // Quitar comentarios para verificar solo código
    const codeOnly = putSource
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')

    // El read debe estar antes del updateMany
    const findIdx = codeOnly.indexOf('findUnique({ where: { id } })')
    const updateManyIdx = codeOnly.indexOf('updateMany')
    expect(findIdx).toBeGreaterThan(-1)
    expect(updateManyIdx).toBeGreaterThan(findIdx)
  })
})

describe('F-26: hay comentarios F-26 explicando los fixes', () => {
  it('FIX: el POST tiene un comentario F-26a', () => {
    const postStart = source.indexOf('export async function POST')
    const putStart = source.indexOf('export async function PUT')
    const postSource = source.substring(postStart, putStart)
    expect(postSource).toMatch(/FIX F-26a/)
  })

  it('FIX: el PUT tiene un comentario F-26b', () => {
    const putStart = source.indexOf('export async function PUT')
    const deleteStart = source.indexOf('export async function DELETE')
    const putSource = source.substring(putStart, deleteStart)
    expect(putSource).toMatch(/FIX F-26b/)
  })
})

describe('F-26: el logAudit sigue funcionando (fuera de updates)', () => {
  it('FIX: el POST loggea CREATE con plantilla.id', () => {
    const postStart = source.indexOf('export async function POST')
    const putStart = source.indexOf('export async function PUT')
    const postSource = source.substring(postStart, putStart)
    expect(postSource).toMatch(/logAudit\([\s\S]+?accion:\s*['"]CREATE['"]/)
  })

  it('FIX: el PUT loggea UPDATE con plantilla.id', () => {
    const putStart = source.indexOf('export async function PUT')
    const deleteStart = source.indexOf('export async function DELETE')
    const putSource = source.substring(putStart, deleteStart)
    expect(putSource).toMatch(/logAudit\([\s\S]+?accion:\s*['"]UPDATE['"]/)
  })
})
