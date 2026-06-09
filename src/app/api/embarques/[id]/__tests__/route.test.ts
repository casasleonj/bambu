// @tests embarques/[id] route — F-N12 fix verification
// Hallazgo: el PUT hacía 100+ líneas de checks pre-tx con prisma.*
// (cliente global), FUERA del lock EMBARQUE. TOCTOU permitía que
// los checks se hicieran con datos stale (antes de que otros
// admins modificaran el embarque) y resultaran en embarques
// sobre-asignados (>70 unidades).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/embarques/[id]/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-N12: TODOS los checks pre-tx están DENTRO del lock EMBARQUE', () => {
  it('FIX: el currentEmbarque.findUnique está dentro del callback del lock', () => {
    // El lock abre con withAdvisoryLock('EMBARQUE', async (tx) => {
    const lockOpen = source.indexOf("withAdvisoryLock('EMBARQUE'")
    const currentRead = source.indexOf('currentEmbarque = await tx.embarque.findUnique')
    const lockClose = source.lastIndexOf('})')  // cierre del callback del lock

    expect(lockOpen).toBeGreaterThan(-1)
    expect(currentRead).toBeGreaterThan(lockOpen)
    expect(currentRead).toBeLessThan(lockClose)
  })

  it('FIX: el dedup por offlineId está dentro del lock', () => {
    const lockOpen = source.indexOf("withAdvisoryLock('EMBARQUE'")
    const dedupCheck = source.indexOf('currentEmbarque.offlineId === offlineId')
    const lockClose = source.lastIndexOf('})')

    expect(dedupCheck).toBeGreaterThan(lockOpen)
    expect(dedupCheck).toBeLessThan(lockClose)
  })

  it('FIX: el check de estado (ABIERTO_ONLY_FIELDS) está dentro del lock', () => {
    const lockOpen = source.indexOf("withAdvisoryLock('EMBARQUE'")
    const stateCheck = source.indexOf('ABIERTO_ONLY_FIELDS.filter')
    const lockClose = source.lastIndexOf('})')

    expect(stateCheck).toBeGreaterThan(lockOpen)
    expect(stateCheck).toBeLessThan(lockClose)
  })

  it('FIX: la validación de carga (totalUnidades ≤ 70) está dentro del lock', () => {
    const lockOpen = source.indexOf("withAdvisoryLock('EMBARQUE'")
    const cargaCheck = source.indexOf('totalUnidades > 70')
    const lockClose = source.lastIndexOf('})')

    // Asegurar que está dentro del lock
    expect(cargaCheck).toBeGreaterThan(lockOpen)
    expect(cargaCheck).toBeLessThan(lockClose)
  })

  it('FIX: la validación de peso del trabajador está dentro del lock', () => {
    const lockOpen = source.indexOf("withAdvisoryLock('EMBARQUE'")
    const pesoCheck = source.indexOf('pesoKg > capacidadKg * 1.1')
    const lockClose = source.lastIndexOf('})')

    expect(pesoCheck).toBeGreaterThan(lockOpen)
    expect(pesoCheck).toBeLessThan(lockClose)
  })

  it('FIX: la validación de stock está dentro del lock', () => {
    const lockOpen = source.indexOf("withAdvisoryLock('EMBARQUE'")
    const stockCheck = source.indexOf('STOCK_EXCEDIDO')
    const lockClose = source.lastIndexOf('})')

    expect(stockCheck).toBeGreaterThan(lockOpen)
    expect(stockCheck).toBeLessThan(lockClose)
  })

  it('FIX: la validación de trabajadorId (moto) está dentro del lock', () => {
    const lockOpen = source.indexOf("withAdvisoryLock('EMBARQUE'")
    const motoCheck = source.indexOf('TRABAJADOR_SIN_MOTO')
    const lockClose = source.lastIndexOf('})')

    expect(motoCheck).toBeGreaterThan(lockOpen)
    expect(motoCheck).toBeLessThan(lockClose)
  })

  it('FIX: la validación de pedidoIds (unidades) está dentro del lock', () => {
    const lockOpen = source.indexOf("withAdvisoryLock('EMBARQUE'")
    const pedidoCheck = source.indexOf('unidadesActuales + unidadesNuevas')
    const lockClose = source.lastIndexOf('})')

    expect(pedidoCheck).toBeGreaterThan(lockOpen)
    expect(pedidoCheck).toBeLessThan(lockClose)
  })
})

describe('F-N12: NO hay checks pre-tx con prisma.* global en PUT', () => {
  // Extraer solo el bloque del PUT handler
  const putMatch = source.match(/export async function PUT[\s\S]+?^}/m)
  const putSource = putMatch ? putMatch[0] : source

  it('FIX: no hay prisma.embarque.findUnique para currentEmbarque pre-lock', () => {
    // Encontrar el lock DEL PUT (no el del DELETE)
    const lockOpen = putSource.indexOf("withAdvisoryLock('EMBARQUE'")
    const preLockPart = putSource.substring(0, lockOpen)
    expect(preLockPart).not.toMatch(/prisma\.embarque\.findUnique/)
  })

  it('FIX: no hay prisma.trabajador.findUnique para validar trabajador pre-lock', () => {
    const lockOpen = putSource.indexOf("withAdvisoryLock('EMBARQUE'")
    const preLockPart = putSource.substring(0, lockOpen)
    expect(preLockPart).not.toMatch(/prisma\.trabajador\.findUnique/)
  })

  it('FIX: no hay prisma.pedido.findMany para validar pedidoIds pre-lock', () => {
    const lockOpen = putSource.indexOf("withAdvisoryLock('EMBARQUE'")
    const preLockPart = putSource.substring(0, lockOpen)
    expect(preLockPart).not.toMatch(/prisma\.pedido\.findMany/)
  })
})

describe('F-N12: los errores thrown se mapean a HTTP responses (en PUT)', () => {
  // Extraer solo el catch del PUT handler
  const putCatch = source.match(/export async function PUT[\s\S]+?\n\}/)?.[0].match(/catch\s*\(error\)[\s\S]+?(?=\n  \}\s*\n})/)?.[0] || ''

  it('FIX: EMBARQUE_NOT_FOUND → 404', () => {
    expect(putCatch).toMatch(/EMBARQUE_NOT_FOUND/)
    expect(putCatch).toMatch(/404/)
  })

  it('FIX: TRABAJADOR_NOT_FOUND y TRABAJADOR_SIN_MOTO → 400', () => {
    expect(putCatch).toMatch(/TRABAJADOR_NOT_FOUND/)
    expect(putCatch).toMatch(/TRABAJADOR_SIN_MOTO/)
  })

  it('FIX: MAX_UNIDADES → 400 con mensaje específico', () => {
    expect(putCatch).toMatch(/MAX_UNIDADES/)
  })

  it('FIX: PESO_EXCEDIDO → 400 con peso y capacidad', () => {
    expect(putCatch).toMatch(/PESO_EXCEDIDO/)
  })

  it('FIX: STOCK_EXCEDIDO → 400 con key y max', () => {
    expect(putCatch).toMatch(/STOCK_EXCEDIDO/)
  })

  it('FIX: FORBIDDEN_FIELDS → 400 con estado y campos', () => {
    expect(putCatch).toMatch(/FORBIDDEN_FIELDS/)
  })
})

describe('F-N12: el response distingue deduped vs camino normal', () => {
  it('FIX: el handler verifica "deduped" in embarque antes de procesar normal', () => {
    expect(source).toMatch(/['"]deduped['"]\s+in\s+embarque/)
  })

  it('FIX: el caso deduped propaga embarque.embarque (pre-construido en lock)', () => {
    expect(source).toMatch(/deduped:\s*true,\s*embarque:\s*embarque\.embarque/)
  })

  it('FIX: el caso normal sigue calculando totalPacas/pesoKg/capacidadInfo', () => {
    expect(source).toMatch(/calcularPacasEmbarque\(embarque\.pedidos\)/)
  })
})

describe('F-N12: la route sigue trabajando (no rompe flujo normal)', () => {
  it('FIX: el lock EMBARQUE sigue envolviendo toda la operación', () => {
    expect(source).toMatch(/withAdvisoryLock\(['"]EMBARQUE['"]/)
  })

  it('FIX: el update de embarque sigue al final del lock', () => {
    expect(source).toMatch(/tx\.embarque\.update\(\{[\s\S]{0,200}data:\s*updateData/)
  })

  it('FIX: el updateMany de pedido (asignar al embarque) sigue dentro del lock', () => {
    const lockOpen = source.indexOf("withAdvisoryLock('EMBARQUE'")
    const pedidoUpdate = source.indexOf('tx.pedido.updateMany')
    const lockClose = source.lastIndexOf('})')

    expect(pedidoUpdate).toBeGreaterThan(lockOpen)
    expect(pedidoUpdate).toBeLessThan(lockClose)
  })

  it('FIX: el deleteMany + createMany de EmbarqueProducto sigue dentro del lock', () => {
    const lockOpen = source.indexOf("withAdvisoryLock('EMBARQUE'")
    const deleteMany = source.indexOf('tx.embarqueProducto.deleteMany')
    const lockClose = source.lastIndexOf('})')

    expect(deleteMany).toBeGreaterThan(lockOpen)
    expect(deleteMany).toBeLessThan(lockClose)
  })
})

describe('F-N22: race en asignación de pedidos a embarques distintos', () => {
  const putStart = source.indexOf('export async function PUT')
  const deleteStart = source.indexOf('export async function DELETE')
  const putSource = source.substring(putStart, deleteStart)

  it('FIX: el updateMany de pedidos captura el count de asignaciones', () => {
    expect(putSource).toMatch(/assignResult\.count\s*<\s*pedidoIds\.length/)
  })

  it('FIX: si count < length, identifica los pedidos no asignados', () => {
    expect(putSource).toMatch(/noAsignados/)
    expect(putSource).toMatch(/filter\(/)
  })

  it('FIX: throw con código específico PEDIDOS_YA_ASIGNADOS', () => {
    expect(putSource).toMatch(/PEDIDOS_YA_ASIGNADOS:/)
  })

  it('FIX: el catch mapea PEDIDOS_YA_ASIGNADOS a 409 con mensaje claro', () => {
    const catchBlock = putSource.match(/catch[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/PEDIDOS_YA_ASIGNADOS:/)
    expect(catchBlock).toMatch(/ya estaban asignados a otro embarque/)
    expect(catchBlock).toMatch(/409/)
  })

  it('FIX: hay un comentario F-N22 explicando el fix', () => {
    expect(putSource).toMatch(/FIX F-N22/)
  })
})
