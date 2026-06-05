// @tests clientes/route.ts — F-N3 fix verification
// Hallazgo cubierto: race condition entre findFirst por teléfono y create
// en POST /api/clientes (mismo bug que F-N5/N6 en /api/clientes/quick).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/clientes/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-N3: race condition fix en clientes POST', () => {
  it('FIX F-N3: el POST importa executeSerializableWithRetry', () => {
    expect(source).toMatch(/import\s*\{\s*executeSerializableWithRetry\s*\}\s*from\s*['"]@\/lib\/serializable['"]/)
  })

  it('FIX F-N3: el POST usa executeSerializableWithRetry', () => {
    // Solo el POST debe usarlo (no el GET)
    const postSection = source.split('export async function POST')[1] || ''
    expect(postSection).toMatch(/executeSerializableWithRetry</)
  })

  it('FIX F-N3: el findUnique por offlineId usa tx (no prisma)', () => {
    const postSection = source.split('export async function POST')[1] || ''
    const findUniqueMatch = postSection.match(/(\w+)\.cliente\.findUnique\(\s*\{\s*where:\s*\{\s*offlineId/)
    expect(findUniqueMatch).not.toBeNull()
    expect(findUniqueMatch![1]).toBe('tx')
  })

  it('FIX F-N3: el findFirst por teléfono usa tx (no prisma)', () => {
    const postSection = source.split('export async function POST')[1] || ''
    const findFirstMatch = postSection.match(/(\w+)\.cliente\.findFirst\(/)
    expect(findFirstMatch).not.toBeNull()
    expect(findFirstMatch![1]).toBe('tx')
  })

  it('FIX F-N3: el create del cliente usa tx (no prisma)', () => {
    const postSection = source.split('export async function POST')[1] || ''
    const createMatch = postSection.match(/(\w+)\.cliente\.create\(/)
    expect(createMatch).not.toBeNull()
    expect(createMatch![1]).toBe('tx')
  })

  it('FIX F-N3: el contexto de logging es "clientes:create"', () => {
    const postSection = source.split('export async function POST')[1] || ''
    expect(postSection).toMatch(/['"]clientes:create['"]/)
  })
})

describe('F-N3: respuestas kind-based en POST', () => {
  it('retorna 200 con deduped: true cuando offlineId ya existe', () => {
    const postSection = source.split('export async function POST')[1] || ''
    expect(postSection).toMatch(/kind:\s*['"]existing['"]/)
    expect(postSection).toMatch(/deduped:\s*true/)
  })

  it('retorna 409 cuando hay teléfono duplicado', () => {
    const postSection = source.split('export async function POST')[1] || ''
    expect(postSection).toMatch(/kind:\s*['"]duplicate_phone['"]/)
    expect(postSection).toMatch(/Ya existe un cliente con ese teléfono/)
  })

  it('retorna 201 cuando crea cliente nuevo', () => {
    const postSection = source.split('export async function POST')[1] || ''
    expect(postSection).toMatch(/,\s*201\)/)
  })
})

describe('F-N3: logAudit fuera de la tx (fire-and-forget)', () => {
  it('logAudit usa .catch para no bloquear', () => {
    const postSection = source.split('export async function POST')[1] || ''
    expect(postSection).toMatch(/logAudit\([\s\S]*?\)\.catch\(\(\) => \{\}\)/)
  })
})

describe('F-N3: el GET NO usa Serializable (no es necesario, es read-only)', () => {
  it('el GET no usa executeSerializableWithRetry', () => {
    const getSection = source.split('export async function GET')[1]?.split('export async function POST')[0] || ''
    expect(getSection).not.toMatch(/executeSerializableWithRetry/)
  })
})
