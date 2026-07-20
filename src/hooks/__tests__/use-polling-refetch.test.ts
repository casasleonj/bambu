// @tests use-polling-refetch.ts — no initial 2s tick that aborts mount fetch
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const hookPath = join(process.cwd(), 'src/hooks/use-polling-refetch.ts')
const source = readFileSync(hookPath, 'utf-8')

describe('FIX Bug 6: usePollingRefetch no dispara tick inicial prematuro', () => {
  it('FIX: no usa setTimeout(tick, 2_000) para un primer tick agresivo', () => {
    expect(source).not.toMatch(/setTimeout\(\s*tick\s*,\s*2_000\s*\)/)
    expect(source).not.toMatch(/setTimeout\(\s*tick\s*,\s*2000\s*\)/)
  })

  it('FIX: sigue usando setInterval para el polling periodico', () => {
    expect(source).toMatch(/setInterval\(\s*tick\s*,\s*intervalMs\s*\)/)
  })

  it('FIX: mantiene listeners de visibilitychange y online', () => {
    expect(source).toMatch(/addEventListener\(['"]visibilitychange['"]/)
    expect(source).toMatch(/addEventListener\(['"]online['"]/)
  })
})
