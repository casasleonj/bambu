import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectSpecs, readReport, summarize } from './playwright-spec-summary.mjs'

const report = (status, results = []) => ({
  suites: [{ title: 'Mi suite', file: 'e2e/prueba.spec.ts', suites: [{ title: 'Subsuite', specs: [
    { title: 'el caso', line: 34, file: 'e2e/prueba.spec.ts',
      tests: [{ projectName: 'chromium', status, results }] },
  ] }] }],
  stats: { expected: 0, unexpected: 1, flaky: 0, skipped: 0 }, errors: [],
})

test('distingue fallidos, flaky, omitidos y preserva intentos', () => {
  for (const [status, expected] of [['unexpected', 'failed'], ['flaky', 'flaky'],
    ['skipped', 'skipped'], ['expected', 'passed']]) {
    const actual = collectSpecs(report(status, [{ status: 'failed' }, { status: 'passed' }]))
    assert.equal(actual[0].status, expected)
    assert.equal(actual[0].attempts, 2)
    assert.match(actual[0].key, /e2e\/prueba.spec.ts › chromium › línea 34/)
  }
})

test('sin JSON, corrupto y sin estadísticas no indica cero fallos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bambu334-'))
  try {
    assert.match(summarize(readReport(join(dir, 'missing.json'))), /Resultados no disponibles/)
    writeFileSync(join(dir, 'report.json'), '{bad')
    assert.equal(readReport(join(dir, 'report.json')).available, false)
    writeFileSync(join(dir, 'report.json'), JSON.stringify({ suites: [] }))
    assert.equal(readReport(join(dir, 'report.json')).available, false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('nunca publica nombres de tests ni errores que contengan secretos', () => {
  const input = report('unexpected', [{ status: 'failed', error: { message: 'TOKEN=SECRETO' } }])
  input.suites[0].suites[0].specs[0].title = 'hola|<script>\nTOKEN=SECRETO'
  const out = summarize({ available: true, report: input }, { label: 'shard 1' })
  assert.doesNotMatch(out, /<script>|TOKEN=SECRETO/)
  assert.match(out, /Fallidos: 1/)
})

test('reporta errores del runner aunque no tenga specs', () => {
  const input = { suites: [], stats: {}, errors: [{ message: 'PRIVATE_KEY=foo' }] }
  const out = summarize({ available: true, report: input })
  assert.match(out, /No se ejecutaron casos/)
  assert.match(out, /Errores del runner: 1/)
  assert.doesNotMatch(out, /PRIVATE_KEY/)
})

test('sin evidencia de homología, baseline no es comparable', () => {
  const current = { available: true, report: report('unexpected') }
  const baseline = { available: true, report: report('expected') }
  assert.match(summarize(current, { baseline }), /NO DISPONIBLE \/ NO COMPARABLE/)
  assert.match(summarize(current, { baseline, comparable: true }), /1 candidatos nuevos/)
})

test('sin casos no implica éxito', () => {
  const out = summarize({ available: true, report: { suites: [], stats: {}, errors: [] } })
  assert.match(out, /No se ejecutaron casos identificables/)
})
