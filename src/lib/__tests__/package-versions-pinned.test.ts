// @tests R4 (hallazgo histórico: PR #121) — AGENTS.md declara
// "ALL dependency versions are pinned (no ^ or ~)" como regla del
// proyecto. package.json tenía 4 paquetes con rango `^` (residuo de un
// `npm install` sin --save-exact). Este test evita que la regla y el
// archivo real vuelvan a divergir en silencio.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const packageJsonPath = join(process.cwd(), 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

describe('R4: todas las versiones en package.json están pinned (sin ^ ni ~)', () => {
  it('dependencies no tiene rangos ^ ni ~', () => {
    const offenders = Object.entries(packageJson.dependencies ?? {})
      .filter(([, version]) => /^[\^~]/.test(version))
      .map(([name, version]) => `${name}: ${version}`)
    expect(offenders).toEqual([])
  })

  it('devDependencies no tiene rangos ^ ni ~', () => {
    const offenders = Object.entries(packageJson.devDependencies ?? {})
      .filter(([, version]) => /^[\^~]/.test(version))
      .map(([name, version]) => `${name}: ${version}`)
    expect(offenders).toEqual([])
  })
})
