// #703 / #896 R0. Comprobación read-only de la ejecución de migraciones de un SHA de main.
// No aplica DDL, no usa secretos de base de datos y no autoriza un despliegue por sí sola.
// Debe utilizarse JUNTO al GitHub check "CI gate (resumen)" en Vercel Deployment Checks.
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

export const POLL_INTERVAL_MS = 15000
export const APPEARANCE_TIMEOUT_MS = 3 * 60_000
export const TOTAL_TIMEOUT_MS = 20 * 60_000
export const REPO = 'casasleonj/bambu'
export const WORKFLOW = 'migrate-deploy.yml'
const SHA_PATTERN = /^(?!0{40}$)[0-9a-f]{40}$/

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


export function commitIsAncestor(before,after){
  if (![before,after].every(s=>SHA_PATTERN.test(s||''))) throw Error('SHA inválido')
  try { execFileSync('git',['merge-base','--is-ancestor',before,after],{stdio:'ignore',timeout:5000});return true }
  catch(e){if(e.status===1)return false;throw Error('No se pudo comprobar ancestralidad Git')}
}

// Los workflows push se crean para el SHA FINAL del push, no necesariamente
// para el commit intermedio que añadió la migración. Encontramos un workflow
// de push sobre la cadena ancestral que cubra la última revisión del esquema.
export async function findEffectiveMigrationSha({
  candidateSha,schemaSha,token,fetchFn=fetch,isAncestor=commitIsAncestor,maxPages=5,
}={}){
  if (![candidateSha,schemaSha].every(s=>SHA_PATTERN.test(s||'')) ||
      !token || !Number.isSafeInteger(maxPages) || maxPages<1 || maxPages>10)
    throw Error('Datos de búsqueda inválidos')
  if(!isAncestor(schemaSha,candidateSha))throw Error('Esquema no es ancestro de candidato')
  for(let page=1;page<=maxPages;page++){
    const url='https://api.github.com/repos/'+REPO+'/actions/workflows/'+WORKFLOW+
      '/runs?branch=main&event=push&per_page=100&page='+page
    const res=await fetchFn(url,{method:'GET',redirect:'error',
      headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
        Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)})
    if(!res?.ok)throw Error('No fue posible leer historial de migraciones: HTTP '+(res?.status||'desconocido'))
    const data=await res.json()
    if(!Array.isArray(data?.workflow_runs))throw Error('Respuesta del historial inválida')
    const entries=data.workflow_runs.filter(x=>x?.event==='push'&&x.head_branch==='main'&&
      SHA_PATTERN.test(x.head_sha||'')&&Number.isSafeInteger(x.id)&&x.id>0&&
      Number.isSafeInteger(x.run_attempt)&&x.run_attempt>0).sort((a,b)=>b.id-a.id)
    for(const e of entries){
      if(isAncestor(schemaSha,e.head_sha)&&isAncestor(e.head_sha,candidateSha))return e.head_sha
    }
    if(data.workflow_runs.length<100)break
  }
  throw Error('No se encontró una ejecución ancestral de migraciones que cubra el esquema')
}

export async function main(env=process.env,{verify=waitForMigration,find=findEffectiveMigrationSha,log=console.log}={}) {
  if (env.GITHUB_EVENT_NAME!=='push' || env.GITHUB_REF!=='refs/heads/main')
    throw new Error('Solo el evento push de main puede emitir este check')
  // El manifiesto SQL crudo se aplica a bases locales/CI; no se usa en Supabase.
  // La evidencia de producción viene de prisma/migrations/**, no del manifiesto.
  if (env.SCHEMA_CHANGED !== 'false' && env.SCHEMA_CHANGED !== 'true')
    throw new Error('Clasificación de schema Prisma ausente o ambigua')
  if (typeof env.NEW_MIGRATIONS !== 'string' || !/^\d+$/.test(env.NEW_MIGRATIONS))
    throw new Error('Conteo de migraciones nuevas ausente o inválido')
  const newMigrations = Number(env.NEW_MIGRATIONS)
  if (!Number.isSafeInteger(newMigrations) || newMigrations > 1000)
    throw new Error('Conteo de migraciones nuevas fuera de límite')
  if (env.SCHEMA_CHANGED === 'true' && newMigrations === 0)
    throw new Error('schema.prisma cambió sin migración nueva: no certificar un migrate deploy vacío')
  // El último commit de esquema es relevante incluso cuando este push
  // no cambia Prisma. Así, un fallo anterior no queda oculto por merges nuevos.
  const latestSchemaSha=env.LAST_SCHEMA_SHA
  const latestTrustSha=env.LAST_TRUST_SHA
  if (!SHA_PATTERN.test(env.GITHUB_SHA || '') || !SHA_PATTERN.test(latestSchemaSha || '') ||
      !SHA_PATTERN.test(latestTrustSha || ''))
    throw new Error('Identidad SHA del candidato, esquema o pipeline inválida')
  const changesPrisma = env.SCHEMA_CHANGED === 'true' || newMigrations > 0
  const effectiveSha=changesPrisma ? env.GITHUB_SHA :
    await find({candidateSha:env.GITHUB_SHA,schemaSha:latestTrustSha,token:env.GITHUB_TOKEN})
  if(!SHA_PATTERN.test(effectiveSha||''))throw Error('SHA efectivo de migración inválido')
  const result=await verify({sha:effectiveSha,token:env.GITHUB_TOKEN})
  log('Esquema '+latestSchemaSha.slice(0,12)+' y pipeline '+latestTrustSha.slice(0,12)+
    ' cubiertos por push '+effectiveSha.slice(0,12)+
    '; run '+result.runId+', intento '+result.runAttempt)
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{console.error('Production migration gate: '+error.message);process.exitCode=1})
}
