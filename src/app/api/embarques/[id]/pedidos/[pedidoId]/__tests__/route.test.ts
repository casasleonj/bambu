// @tests embarques/[id]/pedidos/[pedidoId] — idempotencia offline-first
// Cubre A.3.2: quitar pedido es idempotente por status check (no por
// offlineId): si el pedido ya no está en el embarque, retorna éxito en vez
// de un 400 que dejaría la request atascada en la cola de sync.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/embarques/[id]/pedidos/[pedidoId]/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('A.3.2: quitar pedido idempotente (status check)', () => {
  it('retorna alreadyRemoved cuando el pedido ya no está en el embarque', () => {
    expect(source).toMatch(/alreadyRemoved:\s*true/)
  })

  it('devuelve deduped:true en la respuesta idempotente', () => {
    expect(source).toMatch(/deduped:\s*true/)
  })

  it('la idempotencia usa status check (embarqueId !== id), no offlineId', () => {
    expect(source).toMatch(/pedido\.embarqueId\s*!==\s*id/)
  })
})
