// @tests insumos POST + PUT — F-34 fix verification
// Hallazgos F-34a + F-34b:
//   F-34a: dos admins creando insumo con el mismo nombre casi
//   simultáneo. P2002 → 500.
//   F-34b: dos admins editando el mismo insumo, last-write-wins
//   silencioso.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const insumosPath = join(process.cwd(), 'src/app/api/insumos/route.ts')
const insumosIdPath = join(process.cwd(), 'src/app/api/insumos/[id]/route.ts')

const insumosSource = readFileSync(insumosPath, 'utf-8')
const insumosIdSource = readFileSync(insumosIdPath, 'utf-8')

describe('F-34a: insumos POST usa prisma.$transaction', () => {
  // Extraer el POST handler
  const postStart = insumosSource.indexOf('export async function POST')
  const postSource = insumosSource.substring(postStart)

  it('FIX: el POST usa prisma.$transaction', () => {
    expect(postSource).toMatch(/prisma\.\$transaction\(/)
  })

  it('FIX: el create usa tx.insumo.create', () => {
    expect(postSource).toMatch(/tx\.insumo\.create\(/)
  })

  it('FIX: el catch mapea P2002 → 409 con mensaje claro', () => {
    const catchBlock = postSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/P2002/)
    expect(catchBlock).toMatch(/Ya existe un insumo con ese nombre/)
    expect(catchBlock).toMatch(/409/)
  })

  it('FIX: hay un comentario F-34a explicando el fix', () => {
    expect(postSource).toMatch(/FIX F-34a/)
  })
})

describe('F-34b: insumos PUT usa optimistic locking con updatedAt', () => {
  // Extraer el PUT handler
  const putStart = insumosIdSource.indexOf('export async function PUT')
  const deleteStart = insumosIdSource.indexOf('export async function DELETE')
  const putSource = insumosIdSource.substring(putStart, deleteStart)

  it('FIX: el PUT usa prisma.$transaction', () => {
    expect(putSource).toMatch(/prisma\.\$transaction\(/)
  })

  it('FIX: el findUnique para updatedAt está DENTRO de tx', () => {
    expect(putSource).toMatch(/tx\.insumo\.findUnique\(\s*\{[\s\S]+?select:\s*\{\s*updatedAt:\s*true\s*\}/)
  })

  it('FIX: el updateMany usa condición sobre updatedAt (optimistic lock)', () => {
    expect(putSource).toMatch(/tx\.insumo\.updateMany\(\s*\{[\s\S]+?where:\s*\{[\s\S]+?id,[\s\S]+?updatedAt:\s*existing\.updatedAt/)
  })

  it('FIX: si count === 0, throw INSUMO_MODIFICADO_POR_OTRO_ADMIN', () => {
    expect(putSource).toMatch(/updateResult\.count\s*===\s*0/)
    expect(putSource).toMatch(/INSUMO_MODIFICADO_POR_OTRO_ADMIN/)
  })

  it('FIX: el catch mapea INSUMO_MODIFICADO_POR_OTRO_ADMIN → 409', () => {
    const catchBlock = putSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/INSUMO_MODIFICADO_POR_OTRO_ADMIN/)
    expect(catchBlock).toMatch(/modificado por otro admin/)
    expect(catchBlock).toMatch(/409/)
  })

  it('FIX: el catch mapea INSUMO_NOT_FOUND → 404', () => {
    const catchBlock = putSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/INSUMO_NOT_FOUND/)
    expect(catchBlock).toMatch(/404/)
  })

  it('FIX: re-leer el insumo post-updateMany para devolver estado final', () => {
    expect(putSource).toMatch(/tx\.insumo\.findUnique\(\s*\{[\s\S]+?where:\s*\{\s*id/)
  })
})

describe('F-34: el DELETE sigue intacto (idempotente)', () => {
  it('FIX: el DELETE no se refactorizó (es idempotente)', () => {
    const deleteStart = insumosIdSource.indexOf('export async function DELETE')
    const deleteSource = insumosIdSource.substring(deleteStart)
    expect(deleteSource).toMatch(/prisma\.insumo\.update\(\{[\s\S]+?data:\s*\{\s*activo:\s*false\s*\}/)
  })
})

describe('F-34: el logAudit sigue funcionando', () => {
  it('FIX: el POST loggea CREATE con insumo.id', () => {
    const postStart = insumosSource.indexOf('export async function POST')
    const postSource = insumosSource.substring(postStart)
    expect(postSource).toMatch(/logAudit\([\s\S]+?accion:\s*['"]CREATE['"]/)
  })

  it('FIX: el PUT loggea UPDATE con insumo.id', () => {
    const putStart = insumosIdSource.indexOf('export async function PUT')
    const deleteStart = insumosIdSource.indexOf('export async function DELETE')
    const putSource = insumosIdSource.substring(putStart, deleteStart)
    expect(putSource).toMatch(/logAudit\([\s\S]+?accion:\s*['"]UPDATE['"]/)
  })
})
