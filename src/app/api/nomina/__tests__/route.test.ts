// @tests nomina route POST AUTO — F-N13 fix verification
// Hallazgo: el bloque AUTO usaba prisma.$transaction (ReadCommitted)
// con findFirst + create. Dos requests AUTO simultáneos para el
// mismo trabajdor+período podían ambos leer "no existe" y crear
// 2 nóminas PENDIENTES para el mismo período. No hay unique
// constraint DB sobre (trabajadorId, fechaInicio, fechaFin).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/nomina/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-N13: bloque AUTO usa executeSerializableWithRetry', () => {
  it('FIX: el bloque AUTO importa executeSerializableWithRetry', () => {
    expect(source).toMatch(/import\s+\{\s*executeSerializableWithRetry\s*\}\s+from\s+['"]@\/lib\/serializable['"]/)
  })

  it('FIX: el bloque AUTO usa executeSerializableWithRetry (no prisma.$transaction)', () => {
    // Extraer el bloque AUTO (entre tipoCalculo === 'AUTO' y el final)
    const autoMatch = source.match(/if\s*\(tipoCalculo\s*===\s*['"]AUTO['"]\)[\s\S]+?return apiSuccess\(\{[\s\S]+?\}\)/)
    expect(autoMatch).not.toBeNull()
    const autoBlock = autoMatch![0]

    expect(autoBlock).toMatch(/executeSerializableWithRetry/)

    // Quitar comentarios para verificar que no hay prisma.$transaction en código
    const codeOnly = autoBlock
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')

    expect(codeOnly).not.toMatch(/prisma\.\$transaction/)
  })

  it('FIX: el callback de Serializable tiene tipo de retorno explícito', () => {
    const autoMatch = source.match(/if\s*\(tipoCalculo\s*===\s*['"]AUTO['"]\)[\s\S]+?return apiSuccess\(\{[\s\S]+?\}\)/)
    const autoBlock = autoMatch![0]

    // Debe tener executeSerializableWithRetry<{...}>(async (tx) => { ... })
    expect(autoBlock).toMatch(/executeSerializableWithRetry\s*<\{[\s\S]+?\}>/)
  })

  it('FIX: se pasa context "nomina.POST:AUTO" para logging', () => {
    const autoMatch = source.match(/if\s*\(tipoCalculo\s*===\s*['"]AUTO['"]\)[\s\S]+?return apiSuccess\(\{[\s\S]+?\}\)/)
    const autoBlock = autoMatch![0]

    expect(autoBlock).toMatch(/['"]nomina\.POST:AUTO['"]/)
  })
})

describe('F-N13: el check de duplicados sigue funcionando dentro de Serializable', () => {
  it('FIX: el findFirst de duplicados está dentro del callback del Serializable', () => {
    const autoMatch = source.match(/if\s*\(tipoCalculo\s*===\s*['"]AUTO['"]\)[\s\S]+?return apiSuccess\(\{[\s\S]+?\}\)/)
    const autoBlock = autoMatch![0]

    // El findFirst está dentro del callback
    const serializableOpen = autoBlock.indexOf('executeSerializableWithRetry')
    const findFirstIdx = autoBlock.indexOf('tx.nomina.findFirst')
    const lastClose = autoBlock.lastIndexOf('}, ') // cierre del callback

    expect(serializableOpen).toBeGreaterThan(-1)
    expect(findFirstIdx).toBeGreaterThan(serializableOpen)
    expect(findFirstIdx).toBeLessThan(lastClose)
  })

  it('FIX: el findFirst usa tx (no prisma global)', () => {
    const autoMatch = source.match(/if\s*\(tipoCalculo\s*===\s*['"]AUTO['"]\)[\s\S]+?return apiSuccess\(\{[\s\S]+?\}\)/)
    const autoBlock = autoMatch![0]

    expect(autoBlock).toMatch(/tx\.nomina\.findFirst/)
    expect(autoBlock).not.toMatch(/prisma\.nomina\.findFirst/)
  })

  it('FIX: si existe nómina, throw con mensaje específico', () => {
    const autoMatch = source.match(/if\s*\(tipoCalculo\s*===\s*['"]AUTO['"]\)[\s\S]+?return apiSuccess\(\{[\s\S]+?\}\)/)
    const autoBlock = autoMatch![0]

    expect(autoBlock).toMatch(/Ya existe una nómina/)
  })
})

describe('F-N13: el path MANUAL NO usa Serializable (es seguro sin lock)', () => {
  it('FIX: el path MANUAL sigue usando prisma.$transaction simple', () => {
    // El path MANUAL crea nómina con datos del body. No hay race
    // con AUTO porque son caminos distintos. La prisma.$transaction
    // del MANUAL es solo para atomicidad del create.
    expect(source).toMatch(/Crear nomina manual[\s\S]+?prisma\.\$transaction/)
  })
})

describe('F-N13: el catch maneja el error de duplicado', () => {
  it('FIX: el catch mapea "Ya existe una nómina" a 409', () => {
    expect(source).toMatch(/msg === ['"]Ya existe una nómina para este trabajador en el período seleccionado['"]/)
    expect(source).toMatch(/return apiError\(msg,\s*409\)/)
  })
})

describe('F-N13: el response del AUTO sigue trabajando (no rompe backward compat)', () => {
  it('FIX: el response final sigue retornando nomina + detalles', () => {
    const autoMatch = source.match(/if\s*\(tipoCalculo\s*===\s*['"]AUTO['"]\)[\s\S]+?return apiSuccess\(\{[\s\S]+?\}\)/)
    const autoBlock = autoMatch![0]

    expect(autoBlock).toMatch(/nomina:\s*result\.nomina/)
    expect(autoBlock).toMatch(/detalles:\s*\{/)
    expect(autoBlock).toMatch(/entregasAgua:\s*result\.entregasAgua/)
  })

  it('FIX: el logAudit sigue funcionando (fuera de tx)', () => {
    const autoMatch = source.match(/if\s*\(tipoCalculo\s*===\s*['"]AUTO['"]\)[\s\S]+?return apiSuccess\(\{[\s\S]+?\}\)/)
    const autoBlock = autoMatch![0]

    expect(autoBlock).toMatch(/logAudit\(/)
    expect(autoBlock).toMatch(/\.catch\(\(\)\s*=>\s*\{\}\)/)
  })
})
