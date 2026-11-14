// @tests #778 — Clasificador del gate de CI: skill declarativa ≠ código ERP.
//
// Criterios de cierre exigidos por el issue, cubiertos aquí uno a uno:
//   SKILL.md único · referencia Markdown · ambas copias · cambio combinado con
//   src/** · script .sh en carpeta de skill · hook · package.json · symlink ·
//   rename · diff vacío · nombre con espacios · AGENTS.md · docs-only ·
//   cambio en workflow · cambio no reconocido.
import { describe, expect, it } from 'vitest'
import {
  clasificar,
  parsearRawDiff,
  esRutaDeDocs,
  esRutaDeSkill,
  esRutaDeSkillDeclarativa,
  esRutaEjecutable,
  MODO_SYMLINK,
} from '../ci/clasificar-cambios.mjs'

/** Entrada de diff. Modos por defecto: archivo normal 100644. */
function f(ruta: string, estado = 'M', extra: Record<string, string> = {}) {
  return { estado, modoAnterior: '100644', modoNuevo: '100644', ruta, ...extra }
}

function rename(desde: string, hasta: string) {
  return { estado: 'R100', modoAnterior: '100644', modoNuevo: '100644', rutaAnterior: desde, ruta: hasta }
}

describe('clasificar — casos que DEBEN omitir el E2E del ERP', () => {
  it('un único SKILL.md de una skill', () => {
    const r = clasificar([f('.agents/skills/hallazgo/SKILL.md')])
    expect(r.e2e_required).toBe(false)
    expect(r.skill_declarativa).toBe(true)
  })

  it('una referencia Markdown de una skill', () => {
    const r = clasificar([f('.agents/skills/jl/references/api.md')])
    expect(r.e2e_required).toBe(false)
    expect(r.skill_declarativa).toBe(true)
  })

  it('las dos copias de la misma skill (agents + claude)', () => {
    const r = clasificar([
      f('.agents/skills/jl/SKILL.md'),
      f('.claude/skills/jl/SKILL.md'),
    ])
    expect(r.e2e_required).toBe(false)
    expect(r.detalle.skills).toHaveLength(2)
  })

  it('AGENTS.md de la raíz', () => {
    const r = clasificar([f('AGENTS.md')])
    expect(r.e2e_required).toBe(false)
    expect(r.skill_declarativa).toBe(false)
  })

  it('documentación del producto en docs/**', () => {
    const r = clasificar([f('docs/adr/ADR-ESCASEZ-RUTA-001.md'), f('docs/pedidos/PLAN.md')])
    expect(r.e2e_required).toBe(false)
    expect(r.detalle.docs).toHaveLength(2)
  })

  it('un nombre con espacios y tildes', () => {
    const r = clasificar([f('docs/pedidos/revisión  de   maquetas.md')])
    expect(r.e2e_required).toBe(false)
  })

  it('rename de docs/ a docs/ (misma clase declarativa)', () => {
    const r = clasificar([rename('docs/viejo.md', 'docs/nuevo.md')])
    expect(r.e2e_required).toBe(false)
  })
})

describe('clasificar — casos que DEBEN correr el E2E completo', () => {
  it('skill mezclada con src/** (§3 cambio mixto)', () => {
    const r = clasificar([f('.agents/skills/jl/SKILL.md'), f('src/lib/caja.ts')])
    expect(r.e2e_required).toBe(true)
    expect(r.skill_declarativa).toBe(false)
  })

  it('un script .sh dentro de la carpeta de una skill (§2)', () => {
    const r = clasificar([f('.agents/skills/jl/scripts/instalar.sh')])
    expect(r.e2e_required).toBe(true)
    expect(r.detalle.ejecutables).toContain('.agents/skills/jl/scripts/instalar.sh')
  })

  it('un hook ejecutable dentro de la skill (§2)', () => {
    const r = clasificar([f('.claude/skills/qa/hooks/pre-merge.py')])
    expect(r.e2e_required).toBe(true)
  })

  it('package.json (§2 dependencias)', () => {
    const r = clasificar([f('package.json')])
    expect(r.e2e_required).toBe(true)
  })

  it('un symlink (§4)', () => {
    const r = clasificar([{ estado: 'A', modoAnterior: '000000', modoNuevo: MODO_SYMLINK, ruta: 'docs/atajo.md' }])
    expect(r.e2e_required).toBe(true)
    expect(r.detalle.inciertos[0]).toContain('symlink')
  })

  it('un cambio de modo de archivo (§4)', () => {
    const r = clasificar([{ estado: 'M', modoAnterior: '100644', modoNuevo: '100755', ruta: 'docs/x.md' }])
    expect(r.e2e_required).toBe(true)
    expect(r.detalle.inciertos[0]).toContain('modo')
  })

  it('rename de código a docs/ — el caso que el allowlist viejo dejaba pasar', () => {
    const r = clasificar([rename('src/lib/motor.ts', 'docs/motor.md')])
    expect(r.e2e_required).toBe(true)
    expect(r.detalle.inciertos[0]).toContain('rename')
  })

  it('rename de docs/ a src/**', () => {
    const r = clasificar([rename('docs/x.md', 'src/x.ts')])
    expect(r.e2e_required).toBe(true)
  })

  it('diff vacío (§4)', () => {
    const r = clasificar([])
    expect(r.e2e_required).toBe(true)
    expect(r.motivo).toContain('Diff vacío')
  })

  it('diff ilegible (no es lista)', () => {
    expect(clasificar(undefined as never).e2e_required).toBe(true)
    expect(clasificar('basura' as never).e2e_required).toBe(true)
  })

  it('cambio en el propio workflow de CI', () => {
    const r = clasificar([f('.github/workflows/ci.yml')])
    expect(r.e2e_required).toBe(true)
  })

  it('el propio clasificador', () => {
    const r = clasificar([f('scripts/ci/clasificar-cambios.mjs')])
    expect(r.e2e_required).toBe(true)
  })

  it('una ruta no reconocida (código de producto)', () => {
    const r = clasificar([f('prisma/schema.prisma')])
    expect(r.e2e_required).toBe(true)
    expect(r.motivo).toContain('declarativos')
  })

  it('un .md desconocido en la raíz no entra por extensión', () => {
    const r = clasificar([f('README.md')])
    expect(r.e2e_required).toBe(true)
  })

  it('una entrada sin ruta', () => {
    const r = clasificar([{ estado: 'M', modoAnterior: '100644', modoNuevo: '100644', ruta: '' }])
    expect(r.e2e_required).toBe(true)
  })

  it('un archivo NUEVO (modoAnterior 000000) no es un cambio de modo', () => {
    // Regresión encontrada contra git real: la creación reporta 000000/100644
    // y se clasificaba como «modo cambiado», forzando E2E en un PR docs-only.
    const r = clasificar([
      { estado: 'A', modoAnterior: '000000', modoNuevo: '100644', ruta: 'docs/nuevo.md' },
    ])
    expect(r.e2e_required).toBe(false)
    expect(r.detalle.inciertos).toHaveLength(0)
  })

  it('un archivo nuevo dentro de una skill también es declarativo', () => {
    const r = clasificar([
      { estado: 'A', modoAnterior: '000000', modoNuevo: '100644', ruta: '.agents/skills/x/references/n.md' },
    ])
    expect(r.e2e_required).toBe(false)
    expect(r.skill_declarativa).toBe(true)
  })

  it('un borrado de docs/ es declarativo', () => {
    const r = clasificar([
      { estado: 'D', modoAnterior: '100644', modoNuevo: '000000', ruta: 'docs/viejo.md' },
    ])
    expect(r.e2e_required).toBe(false)
  })
})

describe('predicados de ruta', () => {
  it('esRutaDeDocs reconoce docs/ y AGENTS.md, no el resto', () => {
    expect(esRutaDeDocs('docs/a/b.md')).toBe(true)
    expect(esRutaDeDocs('AGENTS.md')).toBe(true)
    expect(esRutaDeDocs('src/AGENTS.md')).toBe(false)
    expect(esRutaDeDocs('README.md')).toBe(false)
  })

  it('esRutaDeSkill distingue la raíz desnuda de una skill real', () => {
    expect(esRutaDeSkill('.agents/skills/hallazgo/SKILL.md')).toBe(true)
    expect(esRutaDeSkill('.claude/skills/x/SKILL.md')).toBe(true)
    expect(esRutaDeSkill('.agents/skills/')).toBe(false)
    expect(esRutaDeSkill('docs/skills/x.md')).toBe(false)
  })

  it('solo Markdown de skill es declarativo', () => {
    expect(esRutaDeSkillDeclarativa('.agents/skills/jl/SKILL.md')).toBe(true)
    expect(esRutaDeSkillDeclarativa('.agents/skills/jl/scripts/x.py')).toBe(false)
    expect(esRutaDeSkillDeclarativa('.agents/skills/jl/package.json')).toBe(false)
  })

  it('esRutaEjecutable cubre lockfiles, workflows y extensiones', () => {
    expect(esRutaEjecutable('pnpm-lock.yaml')).toBe(true)
    expect(esRutaEjecutable('.github/workflows/x.yml')).toBe(true)
    expect(esRutaEjecutable('src/app/page.tsx')).toBe(true)
    expect(esRutaEjecutable('docs/guia.md')).toBe(false)
  })
})

describe('parsearRawDiff', () => {
  it('lee una modificación simple', () => {
    const raw = ':100644 100644 aaaa bbbb M\0docs/x.md\0'
    expect(parsearRawDiff(raw)).toEqual([
      { estado: 'M', modoAnterior: '100644', modoNuevo: '100644', ruta: 'docs/x.md' },
    ])
  })

  it('lee un rename con su ruta anterior', () => {
    const raw = ':100644 100644 aaaa bbbb R100\0docs/nuevo.md\0src/viejo.ts\0'
    const r = parsearRawDiff(raw)
    expect(r).toEqual([
      { estado: 'R100', modoAnterior: '100644', modoNuevo: '100644', ruta: 'docs/nuevo.md', rutaAnterior: 'src/viejo.ts' },
    ])
    // Y esa entrada, clasificada, fuerza E2E.
    expect(clasificar(r).e2e_required).toBe(true)
  })

  it('lee un symlink con modo 120000', () => {
    const raw = ':000000 120000 aaaa bbbb A\0docs/atajo\0'
    expect(parsearRawDiff(raw)[0].modoNuevo).toBe(MODO_SYMLINK)
  })

  it('devuelve vacío para entradas nulas', () => {
    expect(parsearRawDiff('')).toEqual([])
    expect(parsearRawDiff(undefined as never)).toEqual([])
  })

  it('una cabecera malformada fuerza E2E, no se descarta', () => {
    // Un residuo ilegible ya no se descarta en silencio: se devuelve marcado y
    // fuerza E2E. Perder una entrada significaría omitir la suite sin decirlo.
    const r = parsearRawDiff(':basura\0docs/x.md\0')
    expect(r).toHaveLength(1)
    expect(r[0].invalida).toBe(true)
    expect(r[0].ruta).toContain('docs/x.md')
    expect(clasificar(r).e2e_required).toBe(true)
  })

  it('un residuo sin cabecera también fuerza E2E', () => {
    const r = parsearRawDiff(':100644 100644 a b M\0docs/x.md\0basura\0')
    expect(r).toHaveLength(2)
    expect(clasificar(r).e2e_required).toBe(true)
  })
})
