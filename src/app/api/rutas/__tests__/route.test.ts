// @tests rutas POST + PUT — F-33 fix verification
// Hallazgos F-33a + F-33b:
//   F-33a: dos admins creando ruta con el mismo nombre casi
//   simultáneo. P2002 → 500.
//   F-33b: dos admins editando la misma ruta, last-write-wins
//   silencioso.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/rutas/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-33a: rutas POST usa prisma.$transaction', () => {
  // Extraer el POST handler
  const postStart = source.indexOf('export async function POST')
  const putStart = source.indexOf('export async function PUT')
  const postSource = source.substring(postStart, putStart)

  it('FIX: el POST usa prisma.$transaction', () => {
    expect(postSource).toMatch(/prisma\.\$transaction\(/)
  })

  it('FIX: el create usa tx.ruta.create', () => {
    expect(postSource).toMatch(/tx\.ruta\.create\(/)
  })

  it('FIX: el catch mapea P2002 → 409 con mensaje claro', () => {
    const catchBlock = postSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/P2002/)
    expect(catchBlock).toMatch(/Ya existe una ruta con ese nombre/)
    expect(catchBlock).toMatch(/409/)
  })

  it('FIX: hay un comentario F-33a explicando el fix', () => {
    expect(postSource).toMatch(/FIX F-33a/)
  })
})

describe('F-33b: rutas PUT usa optimistic locking con updatedAt', () => {
  const putStart = source.indexOf('export async function PUT')
  const deleteStart = source.indexOf('export async function DELETE')
  const putSource = source.substring(putStart, deleteStart)

  it('FIX: el PUT usa prisma.$transaction', () => {
    expect(putSource).toMatch(/prisma\.\$transaction\(/)
  })

  it('FIX: el findUnique para updatedAt está DENTRO de tx', () => {
    expect(putSource).toMatch(/tx\.ruta\.findUnique\(\s*\{[\s\S]+?select:\s*\{\s*updatedAt:\s*true\s*\}/)
  })

  it('FIX: el updateMany usa condición sobre updatedAt (optimistic lock)', () => {
    expect(putSource).toMatch(/tx\.ruta\.updateMany\(\s*\{[\s\S]+?where:\s*\{[\s\S]+?id,[\s\S]+?updatedAt:\s*existing\.updatedAt/)
  })

  it('FIX: si count === 0, throw RUTA_MODIFICADA_POR_OTRO_ADMIN', () => {
    expect(putSource).toMatch(/updateResult\.count\s*===\s*0/)
    expect(putSource).toMatch(/RUTA_MODIFICADA_POR_OTRO_ADMIN/)
  })

  it('FIX: si ruta no existe, throw RUTA_NOT_FOUND', () => {
    expect(putSource).toMatch(/RUTA_NOT_FOUND/)
  })

  it('FIX: el catch mapea RUTA_MODIFICADA_POR_OTRO_ADMIN → 409', () => {
    const catchBlock = putSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/RUTA_MODIFICADA_POR_OTRO_ADMIN/)
    expect(catchBlock).toMatch(/modificada por otro admin/)
    expect(catchBlock).toMatch(/409/)
  })

  it('FIX: el catch mapea RUTA_NOT_FOUND → 404', () => {
    const catchBlock = putSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/RUTA_NOT_FOUND/)
    expect(catchBlock).toMatch(/404/)
  })

  it('FIX: re-leer la ruta post-updateMany para devolver estado final', () => {
    expect(putSource).toMatch(/tx\.ruta\.findUnique\(\s*\{[\s\S]+?where:\s*\{\s*id/)
  })

  it('FIX: hay un comentario F-33b explicando el fix', () => {
    expect(putSource).toMatch(/FIX F-33b/)
  })
})

describe('F-33: el DELETE sigue intacto (idempotente)', () => {
  it('FIX: el DELETE no se refactorizó (es idempotente)', () => {
    const deleteStart = source.indexOf('export async function DELETE')
    const deleteSource = source.substring(deleteStart)
    expect(deleteSource).toMatch(/prisma\.ruta\.update\(\{[\s\S]+?data:\s*\{\s*activo:\s*false\s*\}/)
  })
})

describe('F-33: el logAudit sigue funcionando', () => {
  it('FIX: el POST loggea CREATE con ruta.id', () => {
    const postStart = source.indexOf('export async function POST')
    const putStart = source.indexOf('export async function PUT')
    const postSource = source.substring(postStart, putStart)
    expect(postSource).toMatch(/logAudit\([\s\S]+?accion:\s*['"]CREATE['"]/)
  })

  it('FIX: el PUT loggea UPDATE con ruta.id', () => {
    const putStart = source.indexOf('export async function PUT')
    const deleteStart = source.indexOf('export async function DELETE')
    const putSource = source.substring(putStart, deleteStart)
    expect(putSource).toMatch(/logAudit\([\s\S]+?accion:\s*['"]UPDATE['"]/)
  })
})
