// @tests negocios PUT + DELETE — F-35 fix verification
// Hallazgos F-35b + F-35c:
//   F-35b: dos admins editando el mismo negocio, last-write-wins
//   silencioso.
//   F-35c: si un pedido se crea entre el count y el delete,
//   FK constraint falla con 500.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/negocios/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-35b: negocios PUT usa optimistic locking con updatedAt', () => {
  // Extraer el PUT handler
  const putStart = source.indexOf('export async function PUT')
  const deleteStart = source.indexOf('export async function DELETE')
  const putSource = source.substring(putStart, deleteStart)

  it('FIX: el PUT usa prisma.$transaction', () => {
    expect(putSource).toMatch(/prisma\.\$transaction\(/)
  })

  it('FIX: el findUnique para updatedAt está DENTRO de tx', () => {
    expect(putSource).toMatch(/tx\.negocio\.findUnique\(\s*\{[\s\S]+?select:\s*\{\s*updatedAt:\s*true\s*\}/)
  })

  it('FIX: el updateMany usa condición sobre updatedAt (optimistic lock)', () => {
    expect(putSource).toMatch(/tx\.negocio\.updateMany\(\s*\{[\s\S]+?where:\s*\{[\s\S]+?id,[\s\S]+?updatedAt:\s*existing\.updatedAt/)
  })

  it('FIX: si count === 0, throw NEGOCIO_MODIFICADO_POR_OTRO_ADMIN', () => {
    expect(putSource).toMatch(/updateResult\.count\s*===\s*0/)
    expect(putSource).toMatch(/NEGOCIO_MODIFICADO_POR_OTRO_ADMIN/)
  })

  it('FIX: el catch mapea NEGOCIO_MODIFICADO_POR_OTRO_ADMIN → 409', () => {
    const catchBlock = putSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/NEGOCIO_MODIFICADO_POR_OTRO_ADMIN/)
    expect(catchBlock).toMatch(/modificado por otro admin/)
    expect(catchBlock).toMatch(/409/)
  })

  it('FIX: el catch mapea NEGOCIO_NOT_FOUND → 404', () => {
    const catchBlock = putSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/NEGOCIO_NOT_FOUND/)
    expect(catchBlock).toMatch(/404/)
  })

  it('FIX: re-leer el negocio post-updateMany para devolver estado final', () => {
    expect(putSource).toMatch(/tx\.negocio\.findUnique\(\s*\{[\s\S]+?where:\s*\{\s*id/)
  })

  it('FIX: hay un comentario F-35b explicando el fix', () => {
    expect(putSource).toMatch(/FIX F-35b/)
  })
})

describe('F-35c: negocios DELETE usa tx atómica', () => {
  const deleteStart = source.indexOf('export async function DELETE')
  const deleteSource = source.substring(deleteStart)

  it('FIX: el DELETE usa prisma.$transaction', () => {
    expect(deleteSource).toMatch(/prisma\.\$transaction\(/)
  })

  it('FIX: el findUnique con _count.pedidos está DENTRO de tx', () => {
    expect(deleteSource).toMatch(/tx\.negocio\.findUnique\(\s*\{[\s\S]+?include:\s*\{\s*_count:\s*\{\s*select:\s*\{\s*pedidos:\s*true\s*\}\s*\}\s*\}/)
  })

  it('FIX: el delete usa tx.negocio.delete', () => {
    expect(deleteSource).toMatch(/tx\.negocio\.delete\(/)
  })

  it('FIX: si hay pedidos, throw NEGOCIO_TIENE_PEDIDOS:N', () => {
    expect(deleteSource).toMatch(/NEGOCIO_TIENE_PEDIDOS:/)
  })

  it('FIX: el catch mapea NEGOCIO_TIENE_PEDIDOS:N → 400 con mensaje específico', () => {
    const catchBlock = deleteSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/NEGOCIO_TIENE_PEDIDOS:/)
    expect(catchBlock).toMatch(/No se puede eliminar/)
    expect(catchBlock).toMatch(/400/)
  })

  it('FIX: el catch mapea NEGOCIO_NOT_FOUND → 404', () => {
    const catchBlock = deleteSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/NEGOCIO_NOT_FOUND/)
    expect(catchBlock).toMatch(/404/)
  })

  it('FIX: hay un comentario F-35c explicando el fix', () => {
    expect(deleteSource).toMatch(/FIX F-35c/)
  })
})

describe('F-35: el flujo normal sigue funcionando', () => {
  it('FIX: el PUT loggea UPDATE con negocio.id', () => {
    const putStart = source.indexOf('export async function PUT')
    const deleteStart = source.indexOf('export async function DELETE')
    const putSource = source.substring(putStart, deleteStart)
    expect(putSource).toMatch(/logAudit\([\s\S]+?accion:\s*['"]UPDATE['"]/)
  })

  it('FIX: el DELETE loggea DELETE con deleted.nombre', () => {
    const deleteStart = source.indexOf('export async function DELETE')
    const deleteSource = source.substring(deleteStart)
    expect(deleteSource).toMatch(/logAudit\([\s\S]+?accion:\s*['"]DELETE['"]/)
    expect(deleteSource).toMatch(/nombre:\s*deleted\.nombre/)
  })
})
