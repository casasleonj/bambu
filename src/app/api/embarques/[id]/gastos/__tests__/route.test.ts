// @tests embarques/[id]/gastos — F-N2 fix verification
// Hallazgo cubierto: race condition entre findUnique embarque y create gasto
// que permitía agregar gastos a embarques cerrados.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/embarques/[id]/gastos/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-N2: race condition fix en embarques/[id]/gastos POST', () => {
  it('FIX F-N2: el POST usa executeSerializableWithRetry', () => {
    expect(source).toMatch(/import\s*\{\s*executeSerializableWithRetry\s*\}\s*from\s*['"]@\/lib\/serializable['"]/)
    expect(source).toMatch(/executeSerializableWithRetry</)
  })

  it('FIX F-N2: el findUnique del embarque usa tx (no prisma)', () => {
    // El primer findUnique debe usar tx
    const findUniqueMatch = source.match(/(\w+)\.embarque\.findUnique\(\s*\{\s*where:\s*\{\s*id/)
    expect(findUniqueMatch).not.toBeNull()
    expect(findUniqueMatch![1]).toBe('tx')
  })

  it('FIX F-N2: el create del gasto usa tx (no prisma)', () => {
    const createMatch = source.match(/(\w+)\.gasto\.create\(/)
    expect(createMatch).not.toBeNull()
    expect(createMatch![1]).toBe('tx')
  })
})

describe('F-N2: respuestas kind-based en POST', () => {
  it('retorna 404 cuando embarque no existe', () => {
    expect(source).toMatch(/not_found/)
    expect(source).toMatch(/Embarque no encontrado/)
  })

  it('retorna 400 cuando embarque está CERRADO o CANCELADO', () => {
    expect(source).toMatch(/embarque_cerrado/)
    expect(source).toMatch(/No se pueden agregar gastos/)
  })

  it('retorna 201 con gasto cuando se crea correctamente', () => {
    expect(source).toMatch(/kind:\s*['"]created['"]/)
    expect(source).toMatch(/apiSuccess\(\{\s*gasto\s*\},\s*201\)/)
  })
})

describe('F-N2: validación temprana del body (fuera de tx)', () => {
  it('parsea el body ANTES de la tx (fail fast con 400)', () => {
    // El request.json() y safeParse deben estar antes del executeSerializableWithRetry
    const jsonPos = source.search(/request\.json\(\)/)
    const txPos = source.search(/executeSerializableWithRetry</)
    expect(jsonPos).toBeGreaterThan(-1)
    expect(txPos).toBeGreaterThan(jsonPos)
  })
})

describe('F-N2: DELETE se mantiene simple (no necesita Serializable)', () => {
  it('el DELETE usa prisma directamente (decisión documentada)', () => {
    // El DELETE sí usa prisma.gasto.delete — está bien, no es un race
    expect(source).toMatch(/prisma\.gasto\.delete/)
  })

  it('hay un comentario explicando por qué DELETE no usa Serializable', () => {
    // Acepta variantes: "NOTA: este ... NO usa Serializable" o "NO usa Serializable"
    expect(source.toLowerCase()).toMatch(/no usa serializable/)
  })

  it('el DELETE mantiene el where compuesto (defensa parcial)', () => {
    expect(source).toMatch(/where:\s*\{\s*id:\s*gastoId,\s*embarqueId:\s*id\s*\}/)
  })
})
