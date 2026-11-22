// #703 / #896 R0. Comprobación read-only de la ejecución de migraciones de un SHA de main.
// No aplica DDL, no usa secretos de base de datos y no autoriza un despliegue por sí sola.
// Debe utilizarse JUNTO al GitHub check "CI gate (resumen)" en Vercel Deployment Checks.
import { pathToFileURL } from 'node:url'

export const POLL_INTERVAL_MS = 15000
export const APPEARANCE_TIMEOUT_MS = 3 * 60_000
export const TOTAL_TIMEOUT_MS = 20 * 60_000
export const REPO = 'casasleonj/bambu'
export const WORKFLOW = 'migrate-deploy.yml'
const SHA_PATTERN = /^[0-9a-f]{40}$/

export function chooseRun(runs, sha) {
  if (!SHA_PATTERN.test(sha) || !Array.isArray(runs)) throw new Error('Invalid SHA or runs')
  const eligible = runs.filter(run =>
    run && run.head_sha === sha && run.event === 'push' &&
    run.head_branch === 'main' &&
    Number.isSafeInteger(run.id) &&
    run.id > 0 &&
    Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0 &&
    typeof run.created_at === 'string' && Number.isFinite(Date.parse(run.created_at))
  )
  // Id de run es monotónico; mismo run puede avanzar de attempt (rerun).
  return eligible.sort((a,b) => b.id - a.id || b.run_attempt - a.run_attempt)[0] || null
}

export function evaluateRun(run) {
  if (!run) return 'pending'
  if (run.status !== 'completed') return 'pending'
  return run.conclusion === 'success' ? 'success' : 'failure'
}

export async function waitForMigration({
  sha, token, fetchFn=fetch, sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  now=()=>Date.now(), interval=POLL_INTERVAL_MS,
  appearanceTimeout=APPEARANCE_TIMEOUT_MS, totalTimeout=TOTAL_TIMEOUT_MS,
} = {}) {
  if (!SHA_PATTERN.test(sha || '') || !token || typeof token !== 'string') {
    throw new Error('SHA y token del workflow requeridos')
  }
  if (![interval,appearanceTimeout,totalTimeout].every(n=>Number.isFinite(n) && n>0) ||
    appearanceTimeout > totalTimeout) throw new Error('Tiempos inválidos')
  const started=now()
  const endpoint='https://api.github.com/repos/'+REPO+
    '/actions/workflows/'+WORKFLOW+'/runs?head_sha='+sha+'&event=push&per_page=30'
  for (;;) {
    const res=await fetchFn(endpoint,{
      method:'GET',redirect:'error',
      headers:{
        Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        Authorization:'Bearer '+token,
      },
      signal:AbortSignal.timeout(12_000),
    })
    if (!res || !res.ok) throw new Error('GitHub API no disponible: HTTP '+(res?.status??'sin respuesta'))
    const data=await res.json()
    if (!data || !Array.isArray(data.workflow_runs)) throw new Error('Respuesta de API inválida')
    const run=chooseRun(data.workflow_runs,sha)
    const status=evaluateRun(run)
    if (status==='success') return {ok:true,runId:run.id,runAttempt:run.run_attempt}
    if (status==='failure') throw new Error('La migración de este SHA terminó '+run.conclusion+
      ' (run '+run.id+', intento '+run.run_attempt+')')
    const elapsed=now()-started
    if (!run && elapsed>=appearanceTimeout)
      throw new Error('No apareció la ejecución de migraciones del SHA esperado')
    if (elapsed>=totalTimeout)
      throw new Error('Tiempo agotado esperando migración (sin certificado)')
    await sleep(Math.min(interval,totalTimeout-elapsed))
  }
}

export async function main(env=process.env) {
  if (env.GITHUB_EVENT_NAME!=='push' || env.GITHUB_REF!=='refs/heads/main')
    throw new Error('Solo el evento push de main puede emitir este check')
  // El manifiesto SQL crudo se aplica a bases locales/CI; no se usa en Supabase.
  // La evidencia de producción viene de prisma/migrations/**, no del manifiesto.
  if (env.SCHEMA_CHANGED !== 'false' && env.SCHEMA_CHANGED !== 'true')
    throw new Error('Clasificación de schema Prisma ausente o ambigua')
  if (typeof env.NEW_MIGRATIONS !== 'string' || !/^\\d+$/.test(env.NEW_MIGRATIONS))
    throw new Error('Conteo de migraciones nuevas ausente o inválido')
  const newMigrations = Number(env.NEW_MIGRATIONS)
  if (!Number.isSafeInteger(newMigrations) || newMigrations > 1000)
    throw new Error('Conteo de migraciones nuevas fuera de límite')
  if (env.SCHEMA_CHANGED === 'true' && newMigrations === 0)
    throw new Error('schema.prisma cambió sin migración nueva: no certificar un migrate deploy vacío')
  if (env.SCHEMA_CHANGED === 'false' && newMigrations === 0) {
    console.log('Sin cambios de esquema ni migraciones de producción: gate no requiere migración.')
    return
  }
  const result=await waitForMigration({sha:env.GITHUB_SHA,token:env.GITHUB_TOKEN})
  console.log('Migración del mismo SHA verificada; run '+result.runId+', intento '+result.runAttempt)
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{console.error('Production migration gate: '+error.message);process.exitCode=1})
}
