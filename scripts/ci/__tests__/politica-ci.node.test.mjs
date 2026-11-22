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

test('diff del piloto: solo rutas permitidas y archivos normales A/M/D', () => {
  const f = { estado: 'M', modoAnterior: '100644', modoNuevo: '100644', ruta: 'src/components/a.tsx' }
  assert.equal(diffAptoBorrador([f]), true)
  assert.equal(diffAptoBorrador([{ ...f, estado: 'A', modoAnterior: '000000' }]), true)
  assert.equal(diffAptoBorrador([{ ...f, estado: 'D', modoNuevo: '000000' }]), true)
  for (const e of [null, { ...f, invalida: true }, { ...f, estado: 'R100' }, { ...f, modoNuevo: '100755' }, { ...f, modoNuevo: '120000' }, { ...f, ruta: '.github/workflows/ci.yml' }, { ...f, ruta: 'prisma/schema.prisma' }, { ...f, ruta: 'package-lock.json' }, { ...f, ruta: 'e2e/example.spec.ts' }, { ...f, ruta: 'src/archivo\nextra.ts' }]) {
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
