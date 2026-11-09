// @tests #703 — Ignored Build Step de Vercel: el despliegue de producción espera la migración de su commit.
import { describe, expect, it, vi } from 'vitest'
import { decidir, tocaMigraciones, VENTANA_APARICION_MS, TIMEOUT_TOTAL_MS } from '../vercel-ignore-build.mjs'

const SHA = 'abcdef1234567890abcdef1234567890abcdef12'
const prod = { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_SHA: SHA }

function entorno(opts: {
  archivos?: string[]
  commitOk?: boolean
  runs: Array<Array<{ id: number; status: string; conclusion: string | null; created_at?: string }>>
}) {
  let t = 0
  let llamadaRuns = 0
  const llamadas: string[] = []
  const fetchFn = vi.fn(async (url: string, _init?: { headers: Record<string, string> }) => {
    llamadas.push(url)
    if (url.includes('/commits/')) {
      if (opts.commitOk === false) return { ok: false, status: 500, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => ({ files: (opts.archivos ?? []).map((filename) => ({ filename })) }) }
    }
    const lote = opts.runs[Math.min(llamadaRuns++, opts.runs.length - 1)]
    return { ok: true, status: 200, json: async () => ({ workflow_runs: lote.map((r) => ({ created_at: '2026-11-09T10:00:00Z', ...r })) }) }
  })
  return { fetchFn, llamadas, dormir: async (ms: number) => { t += ms }, ahora: () => t }
}

describe('tocaMigraciones', () => {
  it('detecta schema.prisma y prisma/migrations/**', () => {
    expect(tocaMigraciones(['prisma/schema.prisma'])).toBe(true)
    expect(tocaMigraciones(['src/a.ts', 'prisma/migrations/2026_x/migration.sql'])).toBe(true)
  })
  it('no confunde otros archivos de prisma ni de src', () => {
    expect(tocaMigraciones(['prisma/seed.ts', 'src/lib/prisma.ts', 'docs/prisma/migrations/x.md'])).toBe(false)
  })
})

describe('decidir (#703)', () => {
  it('una vista previa no espera nada y construye', async () => {
    const e = entorno({ runs: [[]] })
    const r = await decidir({ env: { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_SHA: SHA }, ...e })
    expect(r.construir).toBe(true)
    expect(e.fetchFn).not.toHaveBeenCalled()
  })

  it('sin SHA de Git (despliegue manual) construye', async () => {
    const e = entorno({ runs: [[]] })
    expect((await decidir({ env: { VERCEL_ENV: 'production' }, ...e })).construir).toBe(true)
  })

  it('un commit sin migración construye y no consulta el workflow', async () => {
    const e = entorno({ archivos: ['src/app/page.tsx'], runs: [[]] })
    const r = await decidir({ env: prod, ...e })
    expect(r.construir).toBe(true)
    expect(e.llamadas.some((u) => u.includes('actions/workflows'))).toBe(false)
  })

  it('con migración y workflow en success construye', async () => {
    const e = entorno({ archivos: ['prisma/migrations/x/migration.sql'], runs: [[{ id: 1, status: 'completed', conclusion: 'success' }]] })
    expect((await decidir({ env: prod, ...e })).construir).toBe(true)
  })

  it('con migración fallida CANCELA (el código nuevo no sale)', async () => {
    const e = entorno({ archivos: ['prisma/schema.prisma'], runs: [[{ id: 2, status: 'completed', conclusion: 'failure' }]] })
    const r = await decidir({ env: prod, ...e })
    expect(r.construir).toBe(false)
    expect(r.motivo).toContain("'failure'")
  })

  it('espera mientras corre y construye al terminar bien', async () => {
    const e = entorno({
      archivos: ['prisma/schema.prisma'],
      runs: [[], [{ id: 3, status: 'queued', conclusion: null }], [{ id: 3, status: 'in_progress', conclusion: null }], [{ id: 3, status: 'completed', conclusion: 'success' }]],
    })
    expect((await decidir({ env: prod, ...e })).construir).toBe(true)
    expect(e.ahora()).toBeGreaterThan(0)
  })

  it('si la ejecución nunca aparece, cancela tras la ventana de aparición', async () => {
    const e = entorno({ archivos: ['prisma/schema.prisma'], runs: [[]] })
    const r = await decidir({ env: prod, ...e })
    expect(r.construir).toBe(false)
    expect(e.ahora()).toBeGreaterThanOrEqual(VENTANA_APARICION_MS)
    expect(e.ahora()).toBeLessThan(TIMEOUT_TOTAL_MS)
  })

  it('si la migración no termina a tiempo, cancela', async () => {
    const e = entorno({ archivos: ['prisma/schema.prisma'], runs: [[{ id: 4, status: 'in_progress', conclusion: null }]] })
    const r = await decidir({ env: prod, ...e })
    expect(r.construir).toBe(false)
    expect(e.ahora()).toBeGreaterThanOrEqual(TIMEOUT_TOTAL_MS)
  })

  it('si GitHub no responde al leer el commit, cancela por seguridad', async () => {
    const e = entorno({ commitOk: false, runs: [[]] })
    expect((await decidir({ env: prod, ...e })).construir).toBe(false)
  })

  it('una lista de archivos truncada (300) se trata como si tocara migraciones', async () => {
    const e = entorno({ archivos: Array.from({ length: 300 }, (_, i) => `src/f${i}.ts`), runs: [[{ id: 5, status: 'completed', conclusion: 'success' }]] })
    await decidir({ env: prod, ...e })
    expect(e.llamadas.some((u) => u.includes('actions/workflows'))).toBe(true)
  })

  it('con GITHUB_TOKEN lo envía como Bearer', async () => {
    const e = entorno({ archivos: ['src/a.ts'], runs: [[]] })
    await decidir({ env: { ...prod, GITHUB_TOKEN: 'tok' } as unknown as NodeJS.ProcessEnv, ...e })
    const init = e.fetchFn.mock.calls[0][1]
    expect(init?.headers.Authorization).toBe('Bearer tok')
  })
})
