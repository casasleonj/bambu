import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { diffAptoBorrador, planCI, revisarGate } from '../politica-ci.mjs'

const pr = { event: 'pull_request', action: 'opened', draft: 'true', fastDraft: 'true', required: 'true', diffOk: 'true' }
const verde = { detect: 'success', quality: 'success', integration: 'success', integrationOk: 'true', e2e: 'success', hub: 'success', run: 'true', deferred: 'false' }
const saltado = { ...verde, e2e: 'skipped', hub: 'skipped', run: 'false' }

test('diff de borrador: archivos normales A/M/D; estructura rara y maquinaria del gate no', () => {
  const f = { estado: 'M', modoAnterior: '100644', modoNuevo: '100644', ruta: 'src/components/a.tsx' }
  assert.equal(diffAptoBorrador([f]), true)
  assert.equal(diffAptoBorrador([{ ...f, estado: 'A', modoAnterior: '000000' }]), true)
  assert.equal(diffAptoBorrador([{ ...f, estado: 'D', modoNuevo: '000000' }]), true)
  for (const e of [null, { ...f, invalida: true }, { ...f, estado: 'R100' }, { ...f, modoNuevo: '100755' }, { ...f, modoNuevo: '120000' }, { ...f, ruta: '.github/workflows/ci.yml' }, { ...f, ruta: 'src/archivo\nextra.ts' }]) {
    assert.equal(diffAptoBorrador([f, e]), false)
  }
  assert.equal(diffAptoBorrador([]), false)
  for (const diffOk of ['', undefined, 'false']) assert.equal(planCI({ ...pr, diffOk }).e2e_run, 'true')
})
test('solo borrador explícito y opt-in puede diferir E2E', () => {
  for (const action of ['opened', 'synchronize', 'reopened']) {
    assert.deepEqual(planCI({ ...pr, action }), { e2e_run: 'false', draft_deferred: 'true', draft_candidate: 'true' })
  }
})
test('por defecto es sombra: conserva suite al faltar opt-in', () => {
  for (const fastDraft of ['', undefined, 'false', 'TRUE']) {
    assert.deepEqual(planCI({ ...pr, fastDraft }), { e2e_run: 'true', draft_deferred: 'false', draft_candidate: 'true' })
  }
})
test('ready_for_review, incluso payload contradictorio, no difiere', () => {
  assert.equal(planCI({ ...pr, action: 'ready_for_review' }).e2e_run, 'true')
  assert.equal(planCI({ ...pr, draft: 'false' }).e2e_run, 'true')
  assert.equal(planCI({ ...pr, draft: undefined }).e2e_run, 'true')
})
test('push main, dispatch, merge_group y eventos desconocidos conservan full', () => {
  for (const event of ['push', 'workflow_dispatch', 'merge_group', 'schedule', '']) {
    assert.equal(planCI({ ...pr, event }).e2e_run, 'true')
    assert.throws(() => planCI({ ...pr, event, required: 'false' }))
  }
})
test('docs declarativo conserva regla #778; nunca certifica integración falsa', () => {
  const docs = { ...pr, required: 'false' }
  assert.deepEqual(planCI(docs), { e2e_run: 'false', draft_deferred: 'false', draft_candidate: 'false' })
  assert.equal(revisarGate(docs, saltado).ok, true)
  assert.equal(revisarGate(docs, { ...saltado, integrationOk: 'false' }).ok, false)
})
test('un borrador diferido no pasa el gate aunque el resto sea verde', () => {
  assert.equal(revisarGate(pr, { ...saltado, deferred: 'true' }).ok, false)
  assert.equal(revisarGate(pr, verde).ok, false)
})
test('candidato listo exige exactamente la suite completa e integración real', () => {
  const listo = { ...pr, draft: 'false' }
  assert.equal(revisarGate(listo, verde).ok, true)
  for (const key of Object.keys(verde)) {
    for (const val of ['', undefined, 'failure', 'cancelled', 'skipped']) {
      assert.equal(revisarGate(listo, { ...verde, [key]: val }).ok, false, `${key}=${val}`)
    }
  }
})
test('salidas inválidas del clasificador nunca certifican', () => {
  for (const required of [undefined, '', 'TRUE', true, 'unknown']) {
    assert.throws(() => planCI({ ...pr, required }))
    assert.equal(revisarGate({ ...pr, required }, verde).ok, false)
  }
})
test('combinaciones de eventos y estado no autorizan un candidato parcial', () => {
  for (const event of ['pull_request', 'push', 'workflow_dispatch'])
    for (const draft of ['true', 'false', ''])
      for (const action of ['opened', 'synchronize', 'ready_for_review', ''])
        for (const fastDraft of ['true', 'false', '']) {
          const c = { event, draft, action, fastDraft, required: 'true', diffOk: 'true' }
          assert.equal(revisarGate(c, { ...saltado, ...{ deferred: planCI(c).draft_deferred } }).ok, false)
          assert.equal(revisarGate(c, verde).ok, planCI(c).e2e_run === 'true')
        }
})
test('regresión nocturna exige lint, integración y E2E completo', () => {
  const full = { event: 'workflow_call', draft: 'false', required: 'true', diffOk: 'false', nightlyFull: 'true' }
  assert.equal(revisarGate(full, { ...verde, lint: 'success' }).ok, true)
  for (const lint of ['failure', 'skipped', 'cancelled', '', undefined]) {
    assert.equal(revisarGate(full, { ...verde, lint }).ok, false)
  }
  assert.equal(revisarGate({ ...full, required: 'false' }, { ...saltado, lint: 'success' }).ok, false)
  assert.equal(revisarGate(full, { ...verde, lint: 'success', integrationOk: 'false' }).ok, false)
})
test('CI de código no puede reportar integración fallida como verde', () => {
  const ready = { ...pr, action: 'ready_for_review', draft: 'false', fastDraft: 'false' }
  assert.equal(revisarGate(ready, { ...verde, integration: 'success', integrationOk: 'false' }).ok, false)
  assert.equal(revisarGate(ready, { ...verde, integration: 'failure', integrationOk: 'true' }).ok, false)
})

test('CLI real publica outputs y no concede verde a borrador diferido', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ci-policy-'))
  try {
    const output = join(dir, 'out')
    const script = fileURLToPath(new URL('../politica-ci.mjs', import.meta.url))
    const env = { ...process.env, GITHUB_OUTPUT: output, CI_EVENT: 'pull_request', CI_ACTION: 'opened', CI_DRAFT: 'true', CI_FAST_DRAFT: 'true', CI_DIFF_OK: 'true', E2E_REQUIRED: 'true', E2E_RUN: 'false', DRAFT_DEFERRED: 'true', R_DETECT: 'success', R_QUALITY: 'success', R_INTEGRATION: 'success', INTEGRATION_OK: 'true', R_E2E: 'skipped', R_HUB: 'skipped' }
    execFileSync(process.execPath, [script, 'plan'], { env })
    assert.equal(readFileSync(output, 'utf8'), 'e2e_run=false\ndraft_deferred=true\ndraft_candidate=true\n')
    assert.equal(spawnSync(process.execPath, [script, 'gate'], { env }).status, 1)
    assert.equal(spawnSync(process.execPath, [script, 'gate'], { env: { ...env, CI_ACTION: 'ready_for_review', CI_DRAFT: 'false', E2E_RUN: 'true', DRAFT_DEFERRED: 'false', R_E2E: 'success', R_HUB: 'success' } }).status, 0)
    assert.equal(spawnSync(process.execPath, [script, 'plan'], { env: { ...env, GITHUB_OUTPUT: '' } }).status, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// Integración estática del enrutamiento. Protege contra una regresión como
// #955: sin ready_for_review, el gate del draft no se puede certificar.
test('workflow progresivo preserva transición, gate estable y cancelación separada', () => {
  const fs = readFileSync(fileURLToPath(new URL('../../../.github/workflows/ci.yml', import.meta.url)), 'utf8')
  assert.match(fs, /types: \[opened, synchronize, reopened, ready_for_review\]/)
  assert.match(fs, /CI_FAST_DRAFT: \$\{\{ vars\.BAMBU_CI_896_DRAFT_PILOT != 'false' && 'true' \|\| 'false' \}\}/)
  assert.equal((fs.match(/CI_FAST_DRAFT: /g) ?? []).length, 2)
  assert.match(fs, /CI_DRAFT: \$\{\{ github\.event\.pull_request\.draft \}\}/)
  assert.match(fs, /group: ci-.*github\.event\.pull_request\.draft.*-draft/)
  assert.match(fs, /if: always\(\)\s*\n\s*needs: \[detect-changes, quality, e2e, e2e-hub, lint, integration\]/)
  assert.match(fs, /scripts\/ci\/politica-ci\.mjs gate/)
  assert.match(fs, /node --test scripts\/ci\/__tests__\/clasificar-cambios\.node\.test\.mjs scripts\/ci\/__tests__\/politica-ci\.node\.test\.mjs/)
  const shadow = readFileSync(fileURLToPath(new URL('../../../.github/workflows/ci-impact-shadow.yml', import.meta.url)), 'utf8')
  assert.doesNotMatch(shadow, /types: \[[^\]]*ready_for_review/)
})

test('activar por defecto solo difiere borradores aptos; desactivar restaura full', () => {
  for (const action of ['opened', 'synchronize', 'reopened']) {
    assert.equal(planCI({ ...pr, action, fastDraft: 'true' }).draft_deferred, 'true')
    assert.equal(planCI({ ...pr, action, fastDraft: 'false' }).e2e_run, 'true')
  }
  for (const action of ['ready_for_review']) {
    assert.equal(planCI({ ...pr, action, draft: 'false', fastDraft: 'true' }).e2e_run, 'true')
  }
  for (const diffOk of ['false', '', undefined]) {
    assert.equal(planCI({ ...pr, diffOk, fastDraft: 'true' }).e2e_run, 'true')
  }
  assert.equal(revisarGate(pr, { ...saltado, deferred: 'true' }).ok, false)
})

// #1023/#1025 · la evidencia `.qa/pr-<N>.md` también cuenta en el diff apto de borrador,
// con la MISMA regex exacta del clasificador (un solo criterio, dos consumidores).
test('borrador: src/ + evidencia .qa es apto; en .qa/ solo la estructura dudosa no (política #1023)', () => {
  const f = (ruta, extra = {}) => ({ estado: 'M', modoAnterior: '100644', modoNuevo: '100644', ruta, ...extra })
  assert.equal(diffAptoBorrador([f('src/lib/x.ts'), f('.qa/pr-1027.md', { estado: 'A', modoAnterior: '000000' })]), true)
  assert.equal(diffAptoBorrador([f('.qa/pr-1.md')]), true)
  // Hasta #1026 solo la ruta exacta `.qa/pr-<N>.md` era apta; desde #1023 lo es cualquier archivo normal.
  for (const ruta of ['.qa/README.md', '.qa/pr-abc.md', '.qa/sub/pr-1.md']) {
    assert.equal(diffAptoBorrador([f('src/lib/x.ts'), f(ruta)]), true, ruta)
  }
  for (const extra of [{ modoNuevo: '100755' }, { modoNuevo: '120000' }, { estado: 'R100' }]) {
    assert.equal(diffAptoBorrador([f('src/lib/x.ts'), f('.qa/pr-1.md', extra)]), false, JSON.stringify(extra))
  }
  assert.equal(diffAptoBorrador([f('src/lib/x.ts'), f('.qa/pr-1.md\n')]), false) // carácter de control
})

// #1023 · el E2E largo se difiere en borrador para CUALQUIER diff con archivos normales,
// salvo la maquinaria que define qué significa «pasar» (ci.yml, scripts/ci/**, su prueba vitest).
// Al pasar a «Ready for review» el E2E completo corre siempre (planCI no difiere ese evento).
test('borrador: cualquier ruta de producto o prueba es apta (prisma, e2e, config, lockfile)', () => {
  const f = ruta => ({ estado: 'M', modoAnterior: '100644', modoNuevo: '100644', ruta })
  for (const ruta of ['prisma/schema.prisma', 'prisma/migrations/20261126_x/migration.sql', 'e2e/example.spec.ts',
    'package.json', 'package-lock.json', 'playwright.config.ts', 'vercel.json', 'tsconfig.json',
    'scripts/otro/herramienta.ts', '.github/workflows/migrate-deploy.yml', 'src/lib/x.ts', 'docs/a.md', '.qa/pr-9.md']) {
    assert.equal(diffAptoBorrador([f(ruta)]), true, ruta)
  }
  assert.equal(diffAptoBorrador([f('src/lib/x.ts'), f('prisma/schema.prisma'), f('e2e/a.spec.ts'), f('package.json')]), true)
})
test('borrador: la maquinaria del gate fuerza el E2E completo aunque venga mezclada con archivos aptos', () => {
  const f = ruta => ({ estado: 'M', modoAnterior: '100644', modoNuevo: '100644', ruta })
  for (const ruta of ['.github/workflows/ci.yml', '.GITHUB/workflows/CI.yml', 'scripts/ci/politica-ci.mjs',
    'scripts/ci/clasificar-cambios.mjs', 'scripts/ci/__tests__/politica-ci.node.test.mjs',
    'scripts/ci/migration-ledger-recover.mjs', 'SCRIPTS/CI/x.mjs', 'scripts/__tests__/clasificar-cambios.test.ts']) {
    assert.equal(diffAptoBorrador([f(ruta)]), false, ruta)
    assert.equal(diffAptoBorrador([f('src/lib/x.ts'), f(ruta)]), false, 'mezclado ' + ruta)
  }
})
test('borrador: estructura dudosa sigue siendo no apta aunque la ruta sea de producto', () => {
  const f = (ruta, extra = {}) => ({ estado: 'M', modoAnterior: '100644', modoNuevo: '100644', ruta, ...extra })
  for (const e of [f('prisma/schema.prisma', { modoNuevo: '100755' }), f('e2e/a.spec.ts', { modoNuevo: '120000' }),
    f('src/a.ts', { estado: 'R100' }), f('src/a.ts', { estado: 'C75' }), f('src/a.ts', { estado: 'T' }),
    f('src/a.ts', { modoAnterior: '100755' }), f('', {}), f('/etc/passwd'), f('src/a\u0000.ts'), f('src/a\u007f.ts'),
    { ...f('src/a.ts'), ruta: 123 }, { ...f('src/a.ts'), invalida: true }]) {
    assert.equal(diffAptoBorrador([e]), false, JSON.stringify(e))
  }
  assert.equal(diffAptoBorrador([f('src/a.ts'), null]), false)
})
test('al pasar a listo el E2E completo siempre corre, sea cual sea el diff', () => {
  for (const diffOk of ['true', 'false']) {
    assert.deepEqual(planCI({ ...pr, action: 'ready_for_review', draft: 'false', diffOk }),
      { e2e_run: 'true', draft_deferred: 'false', draft_candidate: 'false' })
  }
  // y un borrador apto difiere, mientras que uno que toca la maquinaria no.
  assert.equal(planCI({ ...pr, diffOk: 'true' }).draft_deferred, 'true')
  assert.equal(planCI({ ...pr, diffOk: 'false' }).draft_deferred, 'false')
})
