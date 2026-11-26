/**
 * #334: baseline E2E exacto de main, sin sobreinterpretar runs antiguos.
 * API GitHub actions:read; el fracaso de lectura es INFORMATIVO (no convierte un
 * fallo de aplicación en verde ni bloquea el CI por no tener artefacto).
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const MAX_ARCHIVE = 90 * 1024 * 1024
const MAX_UNPACKED = 80 * 1024 * 1024

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function buildManifest(jobKey, env = process.env) {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  return {
    schema: 1,
    jobKey,
    playwright: packageJson.devDependencies?.['@playwright/test'],
    nodeMajor: process.versions.node.split('.')[0],
    runnerOS: env.RUNNER_OS || '',
    imageOS: env.ImageOS || '',
    v2: env.NEXT_PUBLIC_PEDIDOS_V2 || '',
    workers: env.PW_WORKERS || '',
    configHash: sha256('playwright.config.ts'),
    fixtureHash: sha256('e2e/fixtures.ts'),
    // La declaración de package.json NO prueba qué versión quedó instalada.
    // Hash del lockfile evita homologar regresiones contra un árbol de dependencias diferente.
    lockHash: sha256('package-lock.json'),
  }
}

export function compareManifests(a, b) {
  if (!a || !b) return { comparable: false, reason: 'falta manifiesto del PR o de main' }
  const props = ['schema', 'jobKey', 'playwright', 'nodeMajor', 'runnerOS', 'imageOS',
    'v2', 'workers', 'configHash', 'fixtureHash', 'lockHash']
  const required = ['schema', 'jobKey', 'playwright', 'nodeMajor', 'runnerOS',
    'imageOS', 'configHash', 'fixtureHash', 'lockHash']
  if (required.some(k => a[k] === undefined || a[k] === null || a[k] === '' ||
      b[k] === undefined || b[k] === null || b[k] === '')) {
    return { comparable: false, reason: 'faltan datos requeridos para certificar la compatibilidad' }
  }
  const mismatch = props.filter(k => a[k] !== b[k])
  return mismatch.length
    ? { comparable: false, reason: 'entornos/configuraciones diferentes (' + mismatch.join(', ') + ')' }
    : { comparable: true, reason: 'mismo job, versión y configuración de test' }
}

export function pickRun(runs, sha) {
  return (Array.isArray(runs) ? runs : [])
    .filter(r => r?.head_sha === sha && r.event === 'push' &&
      r.head_branch === 'main' && r.status === 'completed' &&
      !['cancelled', 'skipped', 'timed_out'].includes(r.conclusion))
    .sort((a, b) => (b.run_attempt || 0) - (a.run_attempt || 0) ||
      String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null
}

export function pickArtifact(items, name) {
  return (Array.isArray(items) ? items : [])
    .find(x => x?.name === name && x.expired === false && Number.isInteger(x.id)) || null
}

async function readJson(apiBase, suffix, token) {
  const result = await fetch(apiBase + suffix, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15000),
  })
  if (!result.ok) throw new Error('GitHub HTTP ' + result.status)
  return result.json()
}

async function fetchBaseline(artifactName, destination, env = process.env) {
  if (env.GITHUB_EVENT_NAME !== 'pull_request')
    return 'evento sin PR: no corresponde comparar contra main'
  if (!env.GITHUB_TOKEN) return 'sin permiso/token de lectura de Actions'
  const repo = env.GITHUB_REPOSITORY || ''
  const sha = env.BAMBU_CI_BASE_SHA || ''
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo) ||
      !/^[0-9a-f]{40}$/.test(sha) ||
      !/^playwright-json-(hub|[1-8])$/.test(artifactName))
    return 'referencia de PR o artefacto inválida'
  const url = (env.GITHUB_API_URL || 'https://api.github.com') + '/repos/' + repo
  const params = new URLSearchParams({ branch: 'main', event: 'push', head_sha: sha, per_page: '30' })
  const data = await readJson(url, '/actions/workflows/ci.yml/runs?' + params, env.GITHUB_TOKEN)
  const run = pickRun(data.workflow_runs, sha)
  if (!run) return 'no hay corrida de CI de main completada en el SHA base ' + sha.slice(0, 8)
  const inventory = await readJson(url, '/actions/runs/' + run.id + '/artifacts?per_page=100', env.GITHUB_TOKEN)
  const artifact = pickArtifact(inventory.artifacts, artifactName)
  if (!artifact) return 'main carece de artefacto JSON ' + artifactName + ' para run ' + run.id

  const response = await fetch(url + '/actions/artifacts/' + artifact.id + '/zip', {
    headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok || Number(response.headers.get('content-length') || 0) > MAX_ARCHIVE)
    return 'ZIP de baseline no accesible o demasiado grande'
  const buf = Buffer.from(await response.arrayBuffer())
  if (buf.length > MAX_ARCHIVE) return 'ZIP de baseline excede límite'
  const temp = mkdtempSync(join(tmpdir(), 'bambu-334-'))
  try {
    const zip = join(temp, 'baseline.zip')
    writeFileSync(zip, buf)
    const dataJson = spawnSync('unzip', ['-p', zip, 'resultado.json'],
      { encoding: 'buffer', maxBuffer: MAX_UNPACKED, timeout: 12000 })
    const manifestJson = spawnSync('unzip', ['-p', zip, 'manifest.json'],
      { encoding: 'buffer', maxBuffer: 1024 * 1024, timeout: 12000 })
    if (dataJson.status !== 0 || manifestJson.status !== 0 ||
        !dataJson.stdout?.length || !manifestJson.stdout?.length)
      return 'ZIP de main carece de JSON/manifest válido'
    // No extraer rutas ni seguir symlinks desde un ZIP, solamente dos ficheros conocidos.
    const parsed = JSON.parse(manifestJson.stdout.toString('utf8'))
    const report = JSON.parse(dataJson.stdout.toString('utf8'))
    if (!parsed || !report?.suites || !report?.stats)
      return 'baseline de main no tiene estructura Playwright válida'
    mkdirSync(destination, { recursive: true })
    writeFileSync(join(destination, 'resultado.json'), dataJson.stdout)
    writeFileSync(join(destination, 'manifest.json'), manifestJson.stdout)
    return 'baseline de main disponible desde run ' + run.id
  } catch {
    return 'ZIP de main no pudo analizarse'
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [action, arg1, arg2] = process.argv.slice(2)
  if (action === 'manifest' && arg1 && arg2) {
    mkdirSync(resolve(arg2, '..'), { recursive: true })
    writeFileSync(arg2, JSON.stringify(buildManifest(arg1)) + '\n')
  } else if (action === 'fetch' && arg1 && arg2) {
    // La ausencia de baseline no es cero regresiones ni un motivo para cambiar el status E2E.
    fetchBaseline(arg1, arg2).then(result => process.stdout.write('Baseline: ' + result + '\n'))
      .catch(error => process.stdout.write('Baseline NO DISPONIBLE: ' + String(error.message).slice(0, 110) + '\n'))
  } else {
    console.error('Uso: playwright-baseline.mjs manifest <jobKey> <archivo> | fetch <artefacto> <directorio>')
    process.exitCode = 2
  }
}
