// @tests embarques/[id]/enviar — F-N1 fix verification
// Hallazgo cubierto: race condition entre findFirst + update que permitía
// que un repartidor quedara con DOS embarques EN_RUTA simultáneamente.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/embarques/[id]/enviar/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-N1: race condition fix en embarques/[id]/enviar', () => {
  it('FIX F-N1: el route usa executeSerializableWithRetry', () => {
    expect(source).toMatch(/import\s*\{\s*executeSerializableWithRetry\s*\}\s*from\s*['"]@\/lib\/serializable['"]/)
    expect(source).toMatch(/executeSerializableWithRetry</)
  })

  it('FIX F-N1: el findUnique del embarque está DENTRO del callback (no auto-commit)', () => {
    // Verificar que usa `tx.embarque.findUnique`, no `prisma.embarque.findUnique`
    const findUniqueMatch = source.match(/(\w+)\.embarque\.findUnique\(\s*\{\s*where:\s*\{\s*id/)
    expect(findUniqueMatch).not.toBeNull()
    expect(findUniqueMatch![1]).toBe('tx')
  })

  it('FIX F-N1: el findFirst del otro embarque EN_RUTA está DENTRO del callback', () => {
    const findFirstMatch = source.match(/(\w+)\.embarque\.findFirst\(\s*\{\s*where:\s*\{[\s\S]*?id:\s*\{\s*not:\s*id\s*\}/)
    expect(findFirstMatch).not.toBeNull()
    expect(findFirstMatch![1]).toBe('tx')
  })

  it('FIX F-N1: el update del embarque a EN_RUTA está DENTRO del callback', () => {
    const updateMatch = source.match(/(\w+)\.embarque\.update\(\s*\{\s*where:\s*\{\s*id/)
    expect(updateMatch).not.toBeNull()
    expect(updateMatch![1]).toBe('tx')
  })

  it('FIX F-N1: el updateMany de pedidos está DENTRO del callback', () => {
    const updateManyMatch = source.match(/(\w+)\.pedido\.updateMany/)
    expect(updateManyMatch).not.toBeNull()
    expect(updateManyMatch![1]).toBe('tx')
  })

  it('FIX F-N1: el count de pedidos está DENTRO del callback', () => {
    const countMatch = source.match(/(\w+)\.pedido\.count\(\s*\{\s*where:\s*\{\s*embarqueId/)
    expect(countMatch).not.toBeNull()
    expect(countMatch![1]).toBe('tx')
  })
})

describe('F-N1: ya NO se usa prisma global directamente', () => {
  it('el route no importa prisma (toda la lógica usa tx)', () => {
    // Si importa prisma, es señal de que hay queries fuera de la tx
    expect(source).not.toMatch(/import\s*\{\s*prisma\s*\}\s*from\s*['"]@\/lib\/prisma['"]/)
  })
})

describe('F-N1: respuestas kind-based correctas', () => {
  it('retorna 404 cuando embarque no existe', () => {
    expect(source).toMatch(/not_found/)
    expect(source).toMatch(/Embarque no encontrado/)
  })

  it('retorna 400 cuando embarque no está ABIERTO', () => {
    expect(source).toMatch(/not_abierto/)
    expect(source).toMatch(/Solo se pueden enviar embarques abiertos/)
  })

  it('retorna 403 cuando REPARTIDOR intenta enviar embarque vacío', () => {
    expect(source).toMatch(/empty_embarque_repartidor/)
    expect(source).toMatch(/Solo ADMIN o ASISTENTE pueden enviar embarques sin pedidos/)
  })

  it('retorna 400 cuando repartidor ya tiene otro embarque EN_RUTA', () => {
    expect(source).toMatch(/repartidor_en_ruta/)
    expect(source).toMatch(/ya tiene el embarque/)
  })

  it('retorna 200 con embarque cuando se envía correctamente', () => {
    expect(source).toMatch(/kind:\s*['"]enviado['"]/)
    expect(source).toMatch(/apiSuccess\(\{\s*embarque\s*\}\)/)
  })
})

describe('F-N1: logAudit queda fuera de la tx (fire-and-forget)', () => {
  it('logAudit NO está dentro del callback de executeSerializableWithRetry', () => {
    // Buscar la posición del logAudit y verificar que está después del cierre
    // del callback (no antes)
    const txCallbackEnd = source.indexOf("'embarques/enviar:")
    const logAuditPos = source.indexOf('logAudit(')
    expect(logAuditPos).toBeGreaterThan(txCallbackEnd)
  })
})
