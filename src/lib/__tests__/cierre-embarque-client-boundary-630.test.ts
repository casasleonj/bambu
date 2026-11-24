import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('#630: límite Client Component de Cierre Embarque (Next.js 16)', () => {
  it('mantiene use client como primera directiva del módulo principal', () => {
    const path = join(process.cwd(), 'src/app/(app)/embarques/[id]/cerrar/cerrar-client/index.tsx')
    const text = readFileSync(path, 'utf8')
    expect(text.startsWith("'use client'\n")).toBe(true)
  })
})
