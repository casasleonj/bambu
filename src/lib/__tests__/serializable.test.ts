// @tests serializable.ts — F-N5/F-N6 helper compartido
// Verifica que el helper tiene la API correcta y exporta los símbolos esperados.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const serializablePath = join(process.cwd(), 'src/lib/serializable.ts')
const source = readFileSync(serializablePath, 'utf-8')

describe('executeSerializableWithRetry (helper compartido)', () => {
  it('exporta SERIALIZABLE_MAX_RETRIES = 3', () => {
    expect(source).toMatch(/export const SERIALIZABLE_MAX_RETRIES\s*=\s*3/)
  })

  it('exporta la función executeSerializableWithRetry', () => {
    expect(source).toMatch(/export async function executeSerializableWithRetry/)
  })

  it('usa isolationLevel: Prisma.TransactionIsolationLevel.Serializable', () => {
    expect(source).toMatch(/isolationLevel:\s*Prisma\.TransactionIsolationLevel\.Serializable/)
  })

  it('detecta P2034 tanto por err.code como por err.message.includes (compatibilidad)', () => {
    expect(source).toMatch(/err\?\.code\s*===\s*['"]P2034['"]/)
    expect(source).toMatch(/err\.message\.includes\(['"]P2034['"]\)/)
  })

  it('implementa backoff exponencial (50ms * 2^attempt)', () => {
    expect(source).toMatch(/50\s*\*\s*Math\.pow\(2,\s*attempt\)/)
  })

  it('respeta maxRetries (no loop infinito)', () => {
    expect(source).toMatch(/attempt\s*<\s*SERIALIZABLE_MAX_RETRIES\s*-\s*1/)
  })

  it('loguea el retry con contexto para debugging', () => {
    expect(source).toMatch(/logger\.warn/)
    expect(source).toMatch(/context/)
  })

  it('usa maxWait: 5000 y timeout: 15000 (alineado con cierre/route.ts)', () => {
    expect(source).toMatch(/maxWait:\s*5000/)
    expect(source).toMatch(/timeout:\s*15000/)
  })
})

describe('Helper NO exporta prisma directamente (mantiene abstracción)', () => {
  it('no expone el prisma client fuera del módulo', () => {
    // Solo importa prisma, no lo re-exporta
    expect(source).not.toMatch(/export\s*\{\s*prisma/)
  })
})
