/** #334: lista segura de specs E2E desde Playwright JSON. */
import { readFileSync, statSync, appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAX_JSON_BYTES = 80 * 1024 * 1024
const MAX_ROWS = 60

function cleanText(input, limit = 180) {
  return String(input ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\x60|<>\\]/g, ' ').replace(/\s+/g, ' ').slice(0, limit)
}

export function readReport(path) {
  try {
    if (statSync(path).size > MAX_JSON_BYTES) return { available: false, reason: 'JSON demasiado grande' }
    const report = JSON.parse(readFileSync(path, 'utf8'))
    if (!report || typeof report !== 'object' || !Array.isArray(report.suites) ||
      !report.stats || typeof report.stats !== 'object') {
      return { available: false, reason: 'formato JSON incompleto' }
    }
    return { available: true, report }
  } catch {
    return { available: false, reason: 'archivo ausente o JSON ilegible' }
  }
}

function classify(test) {
  if (test.status === 'unexpected') return 'failed'
  if (test.status === 'flaky') return 'flaky'
  if (test.status === 'skipped') return 'skipped'
  if (test.status === 'expected') return 'passed'
  const results = Array.isArray(test.results) ? test.results : []
  if (results.length === 0) return 'unknown'
  const states = results.map(r => r.status)
  if (states.includes('passed') && states.some(s => s === 'failed' || s === 'timedOut')) return 'flaky'
  if (states.every(s => s === 'skipped')) return 'skipped'
  if (states.some(s => s === 'failed' || s === 'timedOut' || s === 'interrupted')) return 'failed'
  if (states.every(s => s === 'passed')) return 'passed'
  return 'unknown'
}

export function collectSpecs(report) {
  const out = []
  function visit(suite, inheritedFile = '') {
    const file = typeof suite.file === 'string' ? suite.file : inheritedFile
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
      for (const test of Array.isArray(spec.tests) ? spec.tests : []) {
        // Nunca publicar el nombre del caso: puede contener datos dinámicos de fixtures.
        const key = [spec.file || file || 'spec desconocido',
          test.projectName || 'proyecto',
          'línea ' + (Number.isInteger(spec.line) ? spec.line : '?')].join(' › ')
        out.push({ key, status: classify(test), attempts: Array.isArray(test.results) ? test.results.length : 0 })
      }
    }
    for (const child of Array.isArray(suite.suites) ? suite.suites : []) visit(child, file)
  }
  for (const suite of report.suites) visit(suite)
  return out
}

/** La comparación solo se habilita si otra fuente certificó equivalencia de suites y entorno. */
export function summarize(current, { label = 'E2E', baseline = null, comparable = false } = {}) {
  const lines = ['### Specs E2E · ' + cleanText(label, 70), '']
  if (!current.available) return [...lines, '**Resultados no disponibles** (' +
    cleanText(current.reason) + '). Esto NO significa cero fallos.', '',
    'Comparación con main: **NO DISPONIBLE**.'].join('\n') + '\n'

  const all = collectSpecs(current.report)
  const failures = all.filter(x => ['failed', 'flaky', 'unknown'].includes(x.status))
  const failed = failures.filter(x => x.status === 'failed').length
  const flaky = failures.filter(x => x.status === 'flaky').length
  const unknown = failures.filter(x => x.status === 'unknown').length
  const skipped = all.filter(x => x.status === 'skipped').length
  const runnerErrors = Array.isArray(current.report.errors) ? current.report.errors.length : 0
  lines.push('**Casos:** ' + all.length + ' · Fallidos: ' + failed +
    ' · Intermitentes: ' + flaky + ' · Sin clasificar: ' + unknown +
    ' · Omitidos: ' + skipped + ' · Errores del runner: ' + runnerErrors + '.')
  if (!all.length) lines.push('**No se ejecutaron casos identificables**; no interpretar como éxito.')
  if (failures.length) {
    lines.push('', '| Estado | Spec / proyecto / ubicación | Intentos |', '|---|---|---:|')
    for (const x of failures.slice(0, MAX_ROWS)) {
      lines.push('| ' + x.status + ' | ' + cleanText(x.key, 220) + ' | ' + x.attempts + ' |')
    }
    if (failures.length > MAX_ROWS) lines.push('_Se muestran ' + MAX_ROWS + ' de ' +
      failures.length + '; consultar el artefacto completo._')
  } else if (all.length && !runnerErrors) lines.push('', 'Sin specs fallidos ni intermitentes en el JSON disponible.')
  if (runnerErrors) lines.push('', '**Atención:** Playwright registró errores fuera de casos individuales; consulta los logs/trazas.')
  if (!baseline?.available || !comparable) {
    lines.push('', 'Comparación con main: **NO DISPONIBLE / NO COMPARABLE**. No se atribuyen regresiones sin baseline equivalente.')
  } else {
    const previous = new Map(collectSpecs(baseline.report).map(x => [x.key, x.status]))
    const added = failures.filter(x => previous.has(x.key) &&
      !['failed', 'flaky', 'unknown'].includes(previous.get(x.key)))
    const absent = failures.filter(x => !previous.has(x.key))
    lines.push('', 'Comparación con main (equivalencia certificada): ' + added.length +
      ' candidatos nuevos; ' + absent.length + ' casos sin equivalente.')
    for (const x of added.slice(0, 20)) lines.push('- Posible regresión: ' + cleanText(x.key, 220))
    if (absent.length) lines.push('**No equiparar pruebas ausentes del baseline a regresiones confirmadas.**')
  }
  return lines.join('\n') + '\n'
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [reportPath, label = 'E2E'] = process.argv.slice(2)
  if (!reportPath) {
    console.error('Uso: node scripts/ci/playwright-spec-summary.mjs <report.json> [etiqueta]')
    process.exitCode = 2
  } else {
    const output = summarize(readReport(reportPath), { label })
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, output)
    process.stdout.write(output)
  }
}
