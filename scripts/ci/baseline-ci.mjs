// #896 R1 · Métricas GitHub Actions de solo lectura; NO es gate de release.
// Uso: GITHUB_REPOSITORY=casasleonj/bambu GH_TOKEN=<token-read-only> node scripts/ci/baseline-ci.mjs --hours 72 --pages 3
// Duración de workflow created_at→updated_at, NO runner-minutos ni ready→merge.
import { pathToFileURL } from 'node:url'

const WORKFLOW = '.github/workflows/ci.yml'
const VALID_EVENTS = ['pull_request', 'push']

function dateMs(s) {
  const n = typeof s === 'string' ? Date.parse(s) : NaN
  return Number.isFinite(n) ? n : null
}
export function percentile(nums, p) {
  if (!Number.isFinite(p) || p < 0 || p > 100) throw Error('Percentil inválido')
  const sorted = nums.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  return Math.round(sorted[Math.max(0, Math.ceil(sorted.length * p / 100) - 1)] * 10) / 10
}
export function summarize(runs, {event, now = Date.now(), hours = 72} = {}) {
  if (!VALID_EVENTS.includes(event) || !Array.isArray(runs) ||
      !Number.isFinite(hours) || hours < 1 || hours > 720 || !Number.isFinite(now)) {
    throw Error('Ventana, evento o datos inválidos')
  }
  const seen = new Set(), selected = []
  let malformed = 0
  for (const r of runs) {
    if (!r || r.path !== WORKFLOW || r.event !== event) continue
    if (event === 'push' && r.head_branch !== 'main') continue
    if (!Number.isSafeInteger(r.id) || r.id <= 0 || seen.has(r.id)) { malformed++; continue }
    seen.add(r.id)
    const created = dateMs(r.created_at)
    if (created === null || created > now) { malformed++; continue }
    if (created >= now - hours * 3600000) selected.push(r)
  }
  const counts = {success:0, failure:0, cancelled:0, other:0}
  const success = [], cancelled = [], repeated = new Map()
  let complete = 0, invalidDurations = 0
  for (const r of selected) {
    if (event === 'pull_request') {
      const id = Number.isSafeInteger(r.pull_requests?.[0]?.number)
        ? 'PR #' + r.pull_requests[0].number : 'rama ' + (r.head_branch || 'sin identificar')
      repeated.set(id, (repeated.get(id) || 0) + 1)
    }
    if (r.status !== 'completed') continue
    complete++
    const result = Object.hasOwn(counts, r.conclusion) ? r.conclusion : 'other'
    counts[result]++
    const end = dateMs(r.updated_at), start = dateMs(r.created_at)
    if (end === null || start === null || end < start || end > now) { invalidDurations++; continue }
    if (result === 'success') success.push((end - start) / 60000)
    if (result === 'cancelled') cancelled.push((end - start) / 60000)
  }
  return {
    event, windowHours:hours, total:selected.length, complete, pending:selected.length-complete,
    counts, cancelledPct:complete ? Math.round(counts.cancelled/complete*1000)/10 : null,
    successfulMin:{samples:success.length,p50:percentile(success,50),p95:percentile(success,95)},
    cancelledMin:{samples:cancelled.length,p50:percentile(cancelled,50)},
    frequentlyRerun:event === 'pull_request'
      ? [...repeated].filter(x=>x[1]>1).sort((a,b)=>b[1]-a[1]).slice(0,10)
        .map(x=>({ref:x[0],executions:x[1]})) : [],
    malformed, invalidDurations,
    caution:'Duración ≠ runner-minutos; cancelación ≠ desperdicio completo; tiempos de merge no medidos.'
  }
}
export function parseArgs(args) {
  const cfg = {hours:72,pages:3,json:false}
  for (let i=0;i<args.length;i++) {
    const a = args[i]
    if (a === '--json') {cfg.json = true; continue}
    if (!['--hours','--pages'].includes(a) || !/^\d+$/.test(args[i+1] || '')) throw Error('Argumento inválido: ' + a)
    cfg[a.slice(2)] = Number(args[++i])
  }
  if (!Number.isSafeInteger(cfg.hours) || cfg.hours < 1 || cfg.hours > 720 ||
      !Number.isSafeInteger(cfg.pages) || cfg.pages < 1 || cfg.pages > 10) throw Error('Rango fuera de límites')
  return cfg
}
export async function listRuns({repo,event,pages,token,fetchFn=fetch}) {
  if (typeof repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(repo) ||
      !VALID_EVENTS.includes(event) || !Number.isSafeInteger(pages) || pages < 1 || pages > 10) throw Error('Consulta inválida')
  const runs = []
  for (let page=1;page<=pages;page++) {
    const q = new URLSearchParams({event,per_page:'100',page:String(page)})
    if (event === 'push') q.set('branch','main')
    const url = 'https://api.github.com/repos/' + repo + '/actions/runs?' + q.toString()
    const response = await fetchFn(url,{
      headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
        ...(token ? {Authorization:'Bearer ' + token} : {})},
      signal:AbortSignal.timeout(20000),redirect:'error'
    })
    if (!response.ok) throw Error('GitHub API HTTP ' + response.status + ', ' + event + ', página ' + page)
    const data = await response.json()
    if (!Array.isArray(data.workflow_runs)) throw Error('Respuesta inesperada de GitHub')
    runs.push(...data.workflow_runs)
    if (data.workflow_runs.length < 100) break
  }
  return runs
}
export async function main(args=process.argv.slice(2),env=process.env,fetchFn=fetch) {
  const cfg=parseArgs(args), now=Date.now(), repo=env.GITHUB_REPOSITORY || 'casasleonj/bambu'
  const token=env.GH_TOKEN || env.GITHUB_TOKEN
  const stats=await Promise.all(VALID_EVENTS.map(async event =>
    summarize(await listRuns({repo,event,pages:cfg.pages,token,fetchFn}),{event,now,hours:cfg.hours})))
  const result={repo,generatedAt:new Date(now).toISOString(),source:'GitHub Actions REST, read-only',
    pagesPerEventMax:cfg.pages,stats,
    limitations:'Paginación acotada: podría no cubrir toda la ventana; no mide runner-minutos ni tiempo de ready hasta merge.'}
  if (cfg.json) console.log(JSON.stringify(result,null,2))
  else for (const s of stats) console.log(s.event + ': ' + s.total + ' CI; ' + s.counts.success +
    ' verdes; ' + s.counts.cancelled + ' cancelados; p50/p95 éxito ' +
    s.successfulMin.p50 + '/' + s.successfulMin.p95 + ' min')
  return result
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{console.error('Baseline CI: ' + error.message);process.exitCode=1})
}
