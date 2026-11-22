// #896 R1: testigo Vitest para ejecutar de verdad la suite Node nativa en el CI existente.
// No altera los gates ni la cantidad de E2E y usa únicamente datos sintéticos.
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'

describe('baseline CI R1 (Node test suite)', () => {
  it('ejecuta los adversariales del reporte read-only sin acceder a GitHub', () => {
    const result = spawnSync(
      process.execPath,
      ['--test', 'scripts/ci/__tests__/baseline-ci.node.test.mjs'],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 20_000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env } },
    )
    expect(result.error?.message).toBeUndefined()
    expect(result.status, [result.stdout, result.stderr].join('\n')).toBe(0)
    expect(result.stdout).toContain('# tests 12')
    expect(result.stdout).toContain('# fail 0')
  })
})
