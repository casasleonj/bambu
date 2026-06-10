// @tests pedidos/[id]/enviar — Fase 1 fix verification
// Hallazgo cubierto: el dedup se hacía FUERA de la tx por estado
// (embarqueId+EN_RUTA), fragil a TOCTOU. Dos requests idénticos podían
// pasar el check antes de que cualquiera entrara a la tx.
//
// Fix: dedup por `envioOfflineId` (campo único, persistente) DENTRO de
// la tx. Si la request ya fue procesada, el server retorna deduped: true.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/pedidos/[id]/enviar/route.ts')
const schemaPath = join(process.cwd(), 'prisma/schema.prisma')

const source = readFileSync(routePath, 'utf-8')
const schema = readFileSync(schemaPath, 'utf-8')

describe('Fase 1: envioOfflineId existe en el schema y es único', () => {
  it('FIX: el schema define envioOfflineId como String? @unique', () => {
    expect(schema).toMatch(/envioOfflineId\s+String\?\s+@unique/)
  })

  it('FIX: el schema tiene @@index([envioOfflineId]) para queries', () => {
    expect(schema).toMatch(/@@index\(\[envioOfflineId\]\)/)
  })
})

describe('Fase 1: el dedup está DENTRO de la tx por envioOfflineId', () => {
  it('FIX: el route ya no hace prisma.pedido.findUnique FUERA de la tx', () => {
    // Buscar el bloque de "Offline-first: dedup" que estaba antes de la tx
    expect(source).not.toMatch(/Offline-first:\s*dedup\s*[—-]\s*si el pedido ya está/)
  })

  it('FIX: el route chequea current.envioOfflineId === offlineId DENTRO de la tx', () => {
    // El check debe estar DENTRO del callback de prisma.$transaction
    const txOpen = source.indexOf('prisma.$transaction(')
    const dedupCheck = source.indexOf('current.envioOfflineId === offlineId')

    expect(txOpen).toBeGreaterThan(-1)
    expect(dedupCheck).toBeGreaterThan(txOpen)
  })

  it('FIX: el dedup retorna { deduped: true, ... } sin re-aplicar cambios', () => {
    // El camino deduped debe retornar con el flag y NO ejecutar tx.pedido.update
    const dedupReturn = source.indexOf('deduped: true as const,')
    const updatePos = source.indexOf('tx.pedido.update(')

    // El dedup return debe estar ANTES del tx.pedido.update
    expect(dedupReturn).toBeGreaterThan(-1)
    expect(updatePos).toBeGreaterThan(dedupReturn)
  })

  it('FIX: el route persiste envioOfflineId en el update normal', () => {
    expect(source).toMatch(/envioOfflineId:\s*offlineId/)
  })
})

describe('Fase 1: el response distingue deduped vs nuevo (status code)', () => {
  it('FIX: cuando es deduped, la route retorna 200 con deduped: true', () => {
    expect(source).toMatch(/if\s*\(result\.deduped\)\s*\{[\s\S]+?return\s+apiSuccess\([\s\S]+?deduped:\s*true,[\s\S]+?},\s*200/)
  })

  it('FIX: el camino normal retorna 201 sin deduped flag', () => {
    // El return final del POST exitoso debe tener 201
    expect(source).toMatch(/apiSuccess\([\s\S]+?201[\s\S]+?\)/)
  })
})

describe('Fase 1: la route sigue trabajando (no rompe flujo normal)', () => {
  it('FIX: el check de estado PENDIENTE sigue presente', () => {
    expect(source).toMatch(/PEDIDO_NOT_PENDIENTE/)
  })

  it('FIX: el check de embarque capacity sigue presente', () => {
    expect(source).toMatch(/EMBARQUE_CAPACIDAD_EXCEDIDA/)
  })

  it('FIX: el mapeo de errores en el catch sigue presente', () => {
    expect(source).toMatch(/PEDIDO_NOT_FOUND.*Pedido no encontrado/)
    expect(source).toMatch(/EMBARQUE_CAPACIDAD_EXCEDIDA.*excede la capacidad/)
  })

  it('FIX: el schema Zod sigue aceptando offlineId opcional', () => {
    expect(source).toMatch(/offlineId:\s*z\.string\(\)\.optional\(\)/)
  })
})
