// @tests cierre-dia route POST — F-N15 fix verification
// Hallazgo: el POST hacía prisma.cierreDia.create SIN lock. Dos
// admins cerrando el mismo día casi simultáneo generaban P2002 → 500.
// Además había inconsistencia con /api/cierre que SÍ usa el lock
// 'CIERRE' (id=7).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/cierre-dia/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-N15: cierre-dia POST usa withAdvisoryLock CIERRE', () => {
  // Extraer el POST handler
  const postStart = source.indexOf('export async function POST')
  const postSource = source.substring(postStart)

  it('FIX: el POST importa withAdvisoryLock', () => {
    expect(source).toMatch(/import\s+\{\s*withAdvisoryLock\s*\}\s+from\s+['"]@\/lib\/locks['"]/)
  })

  it('FIX: el POST usa withAdvisoryLock("CIERRE")', () => {
    expect(postSource).toMatch(/withAdvisoryLock\(\s*['"]CIERRE['"]/)
  })

  it('FIX: el POST valida previamente con findFirst DENTRO del lock', () => {
    // Debe haber un findFirst dentro del lock para detectar duplicados
    expect(postSource).toMatch(/tx\.cierreDia\.findFirst/)
    // El findFirst debe estar DENTRO del lock (después del withAdvisoryLock)
    const lockOpen = postSource.indexOf('withAdvisoryLock(')
    const findFirstIdx = postSource.indexOf('tx.cierreDia.findFirst')
    expect(findFirstIdx).toBeGreaterThan(lockOpen)
  })

  it('FIX: si ya existe un cierre, throw con código específico', () => {
    expect(postSource).toMatch(/CIERRE_YA_EXISTE/)
  })

  it('FIX: el POST usa tx.cierreDia.create (no prisma.cierreDia.create directo)', () => {
    // Antes: const cierre = await prisma.cierreDia.create(...)
    // Ahora: dentro del lock: return tx.cierreDia.create(...)
    expect(postSource).toMatch(/tx\.cierreDia\.create/)

    // Quitar comentarios para verificar que no hay prisma.cierreDia.create en código
    const codeOnly = postSource
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
    expect(codeOnly).not.toMatch(/prisma\.cierreDia\.create/)
  })
})

describe('F-N15: el catch mapea errores a HTTP responses específicos', () => {
  const postStart = source.indexOf('export async function POST')
  const postSource = source.substring(postStart)
  const catchBlock = postSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''

  it('FIX: CIERRE_YA_EXISTE → 409 con mensaje claro', () => {
    expect(catchBlock).toMatch(/CIERRE_YA_EXISTE/)
    expect(catchBlock).toMatch(/Ya existe un cierre para esta fecha/)
    expect(catchBlock).toMatch(/409/)
  })

  it('FIX: P2002 residual → 409 (defensa por si el lock falla)', () => {
    expect(catchBlock).toMatch(/P2002|Unique constraint/)
  })
})

describe('F-N15: el response final sigue retornando el cierre creado', () => {
  const postStart = source.indexOf('export async function POST')
  const postSource = source.substring(postStart)

  it('FIX: el response final usa apiSuccess con status 201', () => {
    expect(postSource).toMatch(/return apiSuccess\(\{\s*cierre\s*\},\s*201\)/)
  })

  it('FIX: el logAudit sigue funcionando (fuera del lock)', () => {
    expect(postSource).toMatch(/logAudit\(/)
    expect(postSource).toMatch(/\.catch\(\(\)\s*=>\s*\{\}\)/)
  })
})

describe('F-N15: validación de fecha usa helpers de Bogotá', () => {
  const postStart = source.indexOf('export async function POST')
  const postSource = source.substring(postStart)

  it('FIX: la validación de fecha existente usa startOfDayInBogota/endOfDayInBogota', () => {
    expect(postSource).toMatch(/startOfDayInBogota/)
    expect(postSource).toMatch(/endOfDayInBogota/)
  })

  it('FIX: el where del findFirst usa rango gte/lte (no equality)', () => {
    // Equality fallaría si el cliente pasa una hora diferente
    expect(postSource).toMatch(/fecha:\s*\{\s*gte:\s*start,\s*lte:\s*end\s*\}/)
  })
})
