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
const serializablePath = join(process.cwd(), 'src/lib/serializable.ts')

const recurrentesSource = readFileSync(recurrentesPath, 'utf-8')
const routeSource = readFileSync(routePath, 'utf-8')
const serializableSource = readFileSync(serializablePath, 'utf-8')

describe('H-12 fix: generarPedidosRecurrentes usa Serializable isolation', () => {
  it('FIX F-15: ordena decisiones por recurrenteId al inicio (evita deadlocks cíclicos)', () => {
    // El sort por recurrenteId antes de iterar garantiza que admin y cron
    // procesen en el mismo orden, eliminando la posibilidad de A→B vs B→A.
    expect(recurrentesSource).toContain('[...decisiones].sort')
    expect(recurrentesSource).toContain('a.recurrenteId.localeCompare(b.recurrenteId)')
  })

  it('FIX H-12: importa el helper executeSerializableWithRetry del módulo compartido', () => {
    // El helper se extrajo a src/lib/serializable.ts para evitar duplicación
    expect(recurrentesSource).toMatch(/import\s*\{\s*executeSerializableWithRetry\s*\}\s*from\s*['"]@\/lib\/serializable['"]/)
  })

  it('FIX H-12: usa el helper en el for loop (no inline)', () => {
    // Debe llamar executeSerializableWithRetry, no definir un $transaction
    // con Serializable directamente (eso es responsabilidad del helper)
    expect(recurrentesSource).toMatch(/executeSerializableWithRetry</)
    // Y NO debe tener un isolationLevel inline (eso está en el helper)
    expect(recurrentesSource).not.toMatch(/isolationLevel:\s*Prisma\.TransactionIsolationLevel\.Serializable/)
  })

  it('FIX H-12: el helper compartido tiene el patrón Serializable + retry P2034', () => {
    // La lógica del helper está en src/lib/serializable.ts (ver serializable.test.ts
    // para los tests detallados del helper). Aquí solo verificamos que el helper
    // se invoca desde recurrentes.ts.
    expect(serializableSource).toMatch(/isolationLevel:\s*Prisma\.TransactionIsolationLevel\.Serializable/)
    expect(serializableSource).toMatch(/P2034/)
    expect(serializableSource).toMatch(/SERIALIZABLE_MAX_RETRIES\s*=\s*\d+/)
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
