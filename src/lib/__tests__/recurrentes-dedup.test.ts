// @tests recurrentes lib + route — F-N14 fix verification
// Hallazgo: el dedup por offlineId (recurrenteBatchId) estaba en
// la route, FUERA de generarPedidosRecurrentes. Dos requests con
// mismo offlineId podían ambos pasar el findMany ([]), ambos
// entrar a la función, y ambos crear pedidos con mismo
// recurrenteBatchId → doble pedido, doble factura, doble cobro.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const libPath = join(process.cwd(), 'src/lib/recurrentes.ts')
const routePath = join(process.cwd(), 'src/app/api/pedidos/recurrentes/route.ts')

const libSource = readFileSync(libPath, 'utf-8')
const routeSource = readFileSync(routePath, 'utf-8')

describe('F-N14: dedup por recurrenteBatchId está al INICIO de generarPedidosRecurrentes', () => {
  it('FIX: la función hace findMany por recurrenteBatchId antes del loop', () => {
    // El findMany debe estar ANTES del for loop
    const funcMatch = libSource.match(/export async function generarPedidosRecurrentes[\s\S]+?^}/m)
    expect(funcMatch).not.toBeNull()
    const funcBlock = funcMatch![0]

    const findBatchIdx = funcBlock.indexOf('recurrenteBatchId: options.recurrenteBatchId')
    const loopIdx = funcBlock.indexOf('for (const decision of decisionesOrdenadas)')

    expect(findBatchIdx).toBeGreaterThan(-1)
    expect(loopIdx).toBeGreaterThan(findBatchIdx)
  })

  it('FIX: si encuentra pedidos existentes, retorna el set sin iterar', () => {
    const funcMatch = libSource.match(/export async function generarPedidosRecurrentes[\s\S]+?^}/m)
    const funcBlock = funcMatch![0]

    // Debe haber un early return con el set existente
    expect(funcBlock).toMatch(/pedidosExistentes\.length\s*>\s*0/)
    expect(funcBlock).toMatch(/return\s*\{[\s\S]+?generados:\s*pedidosExistentes[\s\S]+?\}/)
  })

  it('FIX: usa prisma.pedido.findMany con where:{recurrenteBatchId}', () => {
    const funcMatch = libSource.match(/export async function generarPedidosRecurrentes[\s\S]+?^}/m)
    const funcBlock = funcMatch![0]

    expect(funcBlock).toMatch(/prisma\.pedido\.findMany\(\s*\{[\s\S]+?where:\s*\{\s*recurrenteBatchId:\s*options\.recurrenteBatchId/)
  })

  it('FIX: hay un comentario F-N14 explicando el fix', () => {
    expect(libSource).toMatch(/FIX F-N14/)
  })
})

describe('F-N14: la route ya NO tiene el dedup redundante', () => {
  it('FIX: la route NO hace findMany por recurrenteBatchId', () => {
    // Antes: const pedidosExistentes = await prisma.pedido.findMany({ where: { recurrenteBatchId: offlineId } })
    expect(routeSource).not.toMatch(/prisma\.pedido\.findMany\(\s*\{[\s\S]+?where:\s*\{\s*recurrenteBatchId/)
  })

  it('FIX: la route tiene un comentario explicando que el dedup se movió al lib', () => {
    expect(routeSource).toMatch(/F-N14/)
  })
})

// Helper: extraer el último `return apiSuccess({ ... }, <status>)` del POST
// con balanceo de paréntesis correcto
function extractLastApiSuccessReturn(source: string): string | null {
  const postStart = source.indexOf('export async function POST')
  if (postStart === -1) return null
  const postSource = source.substring(postStart)
  // Buscar el ÚLTIMO `return apiSuccess(`
  const matches = [...postSource.matchAll(/return apiSuccess\(/g)]
  if (matches.length === 0) return null
  const lastMatch = matches[matches.length - 1]
  // lastMatch.index! apunta al inicio de "return apiSuccess("
  // Necesitamos buscar el { después de (
  const startIdx = lastMatch.index! + 'return apiSuccess('.length - 1  // apunta al (
  // Ahora balancear LLAVES desde el primer {
  let depth = 0
  let endIdx = startIdx
  for (let i = startIdx; i < postSource.length; i++) {
    if (postSource[i] === '{') depth++
    if (postSource[i] === '}') {
      depth--
      if (depth === 0) {
        endIdx = i
        break
      }
    }
  }
  // Devolver desde "return apiSuccess(" hasta el } (incluyendo el ,<status>)
  const afterBrace = postSource.substring(endIdx + 1)
  // Después de } viene ), <status>
  return postSource.substring(lastMatch.index!, endIdx + 1) + afterBrace.substring(0, afterBrace.indexOf(')') + 1)
}

describe('F-N14: el response distingue deduped vs nuevo (status code)', () => {
  const postLastReturn = extractLastApiSuccessReturn(routeSource)

  it('FIX: cuando es deduped, la route retorna 200; cuando es nuevo, 201', () => {
    expect(postLastReturn).not.toBeNull()
    expect(postLastReturn).toMatch(/deduped\s*\?\s*200\s*:\s*201/)
  })

  it('FIX: el response incluye el flag deduped condicionalmente', () => {
    expect(postLastReturn).not.toBeNull()
    // Spread condicional: ...(deduped && { deduped: true })
    expect(postLastReturn).toMatch(/\.\.\.\(deduped\s*&&\s*\{\s*deduped:\s*true\s*\}\)/)
  })
})

describe('F-N14: la route sigue trabajando (no rompe flujo normal)', () => {
  const postStart = routeSource.indexOf('export async function POST')
  const postSource = routeSource.substring(postStart)

  it('FIX: la route sigue llamando a generarPedidosRecurrentes', () => {
    expect(postSource).toMatch(/generarPedidosRecurrentes\(decisiones,\s*fecha,\s*\{\s*recurrenteBatchId:\s*offlineId\s*\}\)/)
  })

  it('FIX: el logBulkAudit solo se ejecuta si NO es deduped', () => {
    // No queremos loggear CREATE para pedidos que ya existían
    expect(postSource).toMatch(/if\s*\(resultado\.generados\.length\s*>\s*0\s*&&\s*!deduped\)/)
  })

  it('FIX: la route sigue retornando generados, saltados, pedidos, saltadosIds', () => {
    const finalReturn = extractLastApiSuccessReturn(routeSource)
    expect(finalReturn).not.toBeNull()
    expect(finalReturn).toMatch(/generados:\s*resultado\.generados\.length/)
    expect(finalReturn).toMatch(/saltados:\s*resultado\.saltados\.length/)
    expect(finalReturn).toMatch(/pedidos:\s*resultado\.generados/)
  })
})
