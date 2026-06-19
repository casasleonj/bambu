// @tests clientes/quick — F-N5/F-N6 fix verification
// Hallazgos cubiertos:
//   F-N5: clientes/quick no tenía offlineId dedup para offline-first
//   F-N6: race condition entre findFirst y create (auto-commit)

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/clientes/quick/route.ts')
const validatorsPath = join(process.cwd(), 'src/lib/validators.ts')
const routeSource = readFileSync(routePath, 'utf-8')
const validatorsSource = readFileSync(validatorsPath, 'utf-8')

describe('F-N5: offlineId dedup en clientes/quick', () => {
  it('el validator ClienteQuickCreateSchema incluye offlineId opcional', () => {
    // Buscar el bloque del schema quick y verificar que tiene offlineId
    const schemaMatch = validatorsSource.match(
      /export const ClienteQuickCreateSchema\s*=\s*z\.object\(\{[\s\S]*?\}\)/,
    )
    expect(schemaMatch).not.toBeNull()
    expect(schemaMatch![0]).toMatch(/offlineId:\s*z\.string\(\)\.optional\(\)/)
  })

  it('el route destructura offlineId del body', () => {
    expect(routeSource).toMatch(/const\s*\{\s*[^}]*offlineId[^}]*\}\s*=\s*parsed\.data/)
  })

  it('el route hace dedup por offlineId antes de buscar por teléfono', () => {
    // El orden importa: offlineId primero (más rápido, replay safety),
    // después teléfono (validación de negocio)
    const offlineIdIdx = routeSource.indexOf('offlineId')
    const telefonoIdx = routeSource.indexOf('duplicadoTelefono')
    expect(offlineIdIdx).toBeGreaterThan(-1)
    expect(telefonoIdx).toBeGreaterThan(offlineIdIdx)
  })

  it('el route usa findUnique con where: { offlineId } (no findFirst)', () => {
    expect(routeSource).toMatch(/tx\.cliente\.findUnique\(\s*\{\s*where:\s*\{\s*offlineId\s*\}/)
  })

  it('el route pasa offlineId al create del cliente', () => {
    expect(routeSource).toMatch(/offlineId:\s*offlineId\s*\?\?\s*null/)
  })
})

describe('F-N6: race condition fix con Serializable', () => {
  it('el route usa el helper executeSerializableWithRetry', () => {
    expect(routeSource).toMatch(/executeSerializableWithRetry/)
    expect(routeSource).toMatch(/from\s+['"]@\/lib\/serializable['"]/)
  })

  it('el route pasa contexto para logging', () => {
    expect(routeSource).toMatch(/['"]clientes\/quick:create['"]/)
  })

  it('el findFirst por teléfono está DENTRO del callback (no auto-commit)', () => {
    // Verificar que el findFirst usa `tx.` y no `prisma.`
    const telefonoQuery = routeSource.match(/duplicadoTelefono\s*=\s*await\s+(\w+)\.cliente\.findFirst/)
    expect(telefonoQuery).not.toBeNull()
    expect(telefonoQuery![1]).toBe('tx')
  })

  it('el create del cliente está DENTRO del callback', () => {
    const createQuery = routeSource.match(/cliente\s*=\s*await\s+(\w+)\.cliente\.create/)
    expect(createQuery).not.toBeNull()
    expect(createQuery![1]).toBe('tx')
  })
})

describe('Manejo de respuestas (kind-based)', () => {
  it('retorna 200 con el cliente existente cuando hay teléfono duplicado', () => {
    // FIX e2e/clientes.spec.ts: quick create es idempotente para teléfono
    // duplicado y devuelve el cliente existente (no 409), para no romper
    // callers que usan el resultado para crear pedidos.
    expect(routeSource).toMatch(/duplicate_phone/)
    expect(routeSource).toMatch(/apiSuccess\(\{\s*cliente:\s*result\.existing\s*\},\s*200\)/)
  })

  it('retorna 200 con deduped: true cuando offlineId ya existe', () => {
    expect(routeSource).toMatch(/deduped:\s*true/)
  })

  it('retorna 201 cuando crea cliente nuevo', () => {
    expect(routeSource).toMatch(/,\s*201\)/)
  })
})
