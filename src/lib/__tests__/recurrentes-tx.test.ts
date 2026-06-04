// @tests recurrentes.ts — H-12 fix verification (Serializable + sort + retry P2034)
// Hallazgos cubiertos: F-α a F-15 del análisis a bisturí
//
// Estos tests son META: verifican que el código sigue el patrón correcto,
// no ejecutan lógica de DB real (eso requiere Postgres local y se prueba
// en e2e/recurrentes.spec.ts).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const recurrentesPath = join(process.cwd(), 'src/lib/recurrentes.ts')
const routePath = join(process.cwd(), 'src/app/api/pedidos/recurrentes/route.ts')

const recurrentesSource = readFileSync(recurrentesPath, 'utf-8')
const routeSource = readFileSync(routePath, 'utf-8')

describe('H-12 fix: generarPedidosRecurrentes usa Serializable isolation', () => {
  it('FIX F-15: ordena decisiones por recurrenteId al inicio (evita deadlocks cíclicos)', () => {
    // El sort por recurrenteId antes de iterar garantiza que admin y cron
    // procesen en el mismo orden, eliminando la posibilidad de A→B vs B→A.
    expect(recurrentesSource).toContain('[...decisiones].sort')
    expect(recurrentesSource).toContain('a.recurrenteId.localeCompare(b.recurrenteId)')
  })

  it('FIX H-12: usa isolationLevel Serializable en prisma.$transaction', () => {
    // Patrón oficial de Prisma 4.4+ para prevenir LOST UPDATE y race en
    // getNextNumero via PostgreSQL SSI tracking.
    expect(recurrentesSource).toMatch(/isolationLevel:\s*Prisma\.TransactionIsolationLevel\.Serializable/)
  })

  it('FIX H-12: el helper retry captura P2034 y reintenta con backoff', () => {
    // Detección: err.code === 'P2034' o err.message.includes('P2034')
    expect(recurrentesSource).toMatch(/P2034/)
    // Backoff exponencial
    expect(recurrentesSource).toMatch(/Math\.pow\(2, attempt\)/)
  })

  it('FIX H-12: el helper retry respeta maxRetries (no loop infinito)', () => {
    // El for loop tiene un límite definido (SERIALIZABLE_MAX_RETRIES)
    expect(recurrentesSource).toMatch(/SERIALIZABLE_MAX_RETRIES\s*=\s*\d+/)
    expect(recurrentesSource).toMatch(/attempt\s*<\s*SERIALIZABLE_MAX_RETRIES/)
  })

  it('FIX H-12: route.ts ya NO contiene el doc-comment erróneo sobre race de numero', () => {
    // El comentario viejo afirmaba que "dos admins podrían generar pedidos
    // con el mismo numero en race". Eso era incorrecto: el race real es
    // LOST UPDATE en plantillaRecurrente, no duplicación de numero.
    expect(routeSource).not.toMatch(/pedidos con el mismo `numero` en race/)
    // El nuevo doc-comment menciona el fix y la causa correcta
    expect(routeSource).toMatch(/H-12 RESUELTO/)
    expect(routeSource).toMatch(/LOST UPDATE/)
  })
})
