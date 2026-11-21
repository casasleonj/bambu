import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildManifest, compareManifests, pickRun, pickArtifact } from '../playwright-baseline.mjs'
import { collectSpecs, summarize } from '../playwright-spec-summary.mjs'

test('solo compara manifiestos con runner y flags homologables', () => {
  const a = buildManifest('playwright-json-1', { RUNNER_OS: 'Linux', ImageOS: 'ubuntu26',
    NEXT_PUBLIC_PEDIDOS_V2: '', PW_WORKERS: '' })
  assert.deepEqual(compareManifests(a, { ...a }), {
    comparable: true, reason: 'mismo job, versión y configuración de test',
  })
  assert.equal(compareManifests(a, { ...a, v2: 'true' }).comparable, false)
  assert.equal(compareManifests(a, { ...a, playwright: 'otra' }).comparable, false)
  assert.equal(compareManifests(a, { ...a, lockHash: 'lockfile-changed' }).comparable, false)
  assert.equal(compareManifests(a, { ...a, jobKey: 'playwright-json-2' }).comparable, false)
  assert.equal(compareManifests(a, null).comparable, false)
})

test('no selecciona run de otra rama, SHA, evento o cancelado', () => {
  const sha = 'a'.repeat(40)
  const valid = { id: 123, event: 'push', head_branch: 'main', head_sha: sha,
    status: 'completed', conclusion: 'failure', run_attempt: 1 }
  const wrong = [
    { ...valid, id: 1, head_sha: 'b'.repeat(40) },
    { ...valid, id: 2, event: 'pull_request' },
    { ...valid, id: 3, head_branch: 'other' },
    { ...valid, id: 4, status: 'in_progress' },
    { ...valid, id: 5, conclusion: 'cancelled' },
  ]
  assert.equal(pickRun([...wrong, valid], sha)?.id, 123)
  assert.equal(pickRun(wrong, sha), null)
  assert.equal(pickRun([valid, { ...valid, id: 88, run_attempt: 2 }], sha)?.id, 88)
})

test('ignora artefactos de otro shard o expirados', () => {
  const items = [{ name: 'playwright-json-1', id: 2, expired: true },
    { name: 'playwright-json-2', id: 3, expired: false },
    { name: 'playwright-json-1', id: 4, expired: false }]
  assert.equal(pickArtifact(items, 'playwright-json-1')?.id, 4)
  assert.equal(pickArtifact(items, 'playwright-json-8'), null)
})

test('identidad de spec no cambia al moverse de línea', () => {
  const mk = (line, status) => ({
    suites: [{ title: 'suite', file: 'e2e/sensible.spec.ts', specs: [
      { title: 'caso secreto', file: 'e2e/sensible.spec.ts', line,
        tests: [{ projectName: 'chromium', status, results: [{ status: status === 'expected' ? 'passed' : 'failed' }] }] },
    ] }], stats: {}, errors: [],
  })
  const current = mk(118, 'unexpected')
  const baseline = mk(98, 'expected')
  assert.equal(collectSpecs(current)[0].id, collectSpecs(baseline)[0].id)
  const diff = summarize({ available: true, report: current }, {
    baseline: { available: true, report: baseline }, comparable: true,
  })
  assert.match(diff, /1 candidatos nuevos/)
  assert.doesNotMatch(diff, /caso secreto/)
})

test('no compara si un runner falló fuera de specs, aunque exista baseline', () => {
  const mk = () => ({ suites: [{ specs: [{ title: 'caso', line: 9, file: 'e2e/a.spec.ts',
    tests: [{ projectName: 'chromium', status: 'unexpected', results: [{ status: 'failed' }] }] }] }], stats: {}, errors: [] })
  const current = mk()
  const baseline = mk()
  baseline.errors.push({ message: 'hidden credential' })
  const message = summarize({ available: true, report: current },
    { baseline: { available: true, report: baseline }, comparable: true })
  assert.match(message, /NO DISPONIBLE \/ NO COMPARABLE/)
  assert.doesNotMatch(message, /hidden credential/)
})
