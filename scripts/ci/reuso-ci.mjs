// #896: deduplicacion de regresion suplementaria, no certificacion de release.
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const MAX_AGE_MS = 24 * 60 * 60 * 1000
const CI = '.github/workflows/ci.yml'
const NIGHT = '.github/workflows/ci-nightly.yml'
const PREFIX = 'Regression full / '
const CONTRACT = {
  'Detect change scope (docs-only vs. executable)': ['Unit tests of the classifier', 'Classify diff (declarative vs. requires E2E)'],
  'Type check + Tests': ['Type check', 'Unit tests'],
  'Lint (non-blocking)': ['Lint'],
  'Integration tests (non-blocking)': ['Run integration tests'],
  'E2E Hub (V2 ON)': ['Run Playwright tests (suite del Hub, V2 ON)'],
  'CI gate (resumen)': ['Evaluar resultados exigidos'],
  ...Object.fromEntries(Array.from({length:8}, (_, i) => [`E2E (${i+1}/8)`, [`Run Playwright tests (shard ${i+1})`]])),
}
const passed = x => x?.status === 'completed' && x.conclusion === 'success'
const safeId = n => Number.isSafeInteger(n) && n > 0
const shaOk = s => typeof s === 'string' && /^[a-f0-9]{40}$/.test(s)
const timestamp = s => typeof s === 'string' ? Date.parse(s) : NaN

export function relevant(run, ctx) {
  if (!safeId(run?.id) || run.id === ctx.currentRun || run.head_sha !== ctx.sha || run.head_branch !== 'main' || run.repository?.full_name !== ctx.repo || run.head_repository?.full_name !== ctx.repo) return false
  return (run.path === CI && run.event === 'push') || (run.path === NIGHT && ['schedule','workflow_dispatch'].includes(run.event))
}

export function verifyFull(run, jobs, ctx, shadowPR = false) {
  if (!passed(run) || run.run_attempt !== 1 || !safeId(run.id) || run.repository?.full_name !== ctx.repo || run.head_repository?.full_name !== ctx.repo) return false
  if (shadowPR ? run.path !== CI || run.event !== 'pull_request' : !relevant(run, ctx)) return false
  if (!Array.isArray(jobs)) return false
  const prefix = run.path === NIGHT ? PREFIX : ''
  for (const [name, steps] of Object.entries(CONTRACT)) {
    const matches = jobs.filter(j => j?.name === prefix + name)
    if (matches.length !== 1 || !passed(matches[0])) return false
    const job = matches[0]
    const done = timestamp(job.completed_at)
    if (!Number.isFinite(done) || done > ctx.now || ctx.now - done >= MAX_AGE_MS || job.run_id !== run.id || job.head_sha !== run.head_sha || job.run_attempt !== 1) return false
    if (!Array.isArray(job.steps)) return false
    for (const step of steps) {
      const actual = job.steps.filter(s => s.name === step)
      if (actual.length !== 1 || !passed(actual[0])) return false
    }
  }
  return true
}

export async function decideNight(ctx, runs, loadJobs) {
  if (ctx.event !== 'schedule' || ctx.schedule === '17 7 * * 1') return {runFull:true, reason:'forced'}
  if (ctx.schedule !== '17 7 * * 0,2-6') return {runFull:true, reason:'unknown-schedule'}
  const candidates = runs.filter(r => relevant(r,ctx))
  if (candidates.some(r => !Number.isFinite(timestamp(r.created_at)) || timestamp(r.created_at) > ctx.now)) return {runFull:true,reason:'invalid-run-time'}
  const latest = candidates.sort((a,b)=>timestamp(b.created_at)-timestamp(a.created_at)||b.id-a.id)[0]
  if (!latest) return {runFull:true,reason:'no-exact-run'}
  // No preferir un verde viejo si hubo un intento posterior fallido o pendiente.
  if (!passed(latest) || latest.run_attempt !== 1) return {runFull:true,reason:'latest-not-clean',source:latest.id}
  const jobs = await loadJobs(latest.id)
  return verifyFull(latest,jobs,ctx) ? {runFull:false,reason:'fresh-exact-main-full',source:latest.id} : {runFull:true,reason:'incomplete-or-stale-evidence',source:latest.id}
}

export async function observePush(ctx, artifacts, loadRun, loadJobs) {
  const matches=[]
  for (const a of artifacts.slice(0,20)) {
    if (a.expired !== false || a.name !== `ci-candidate-${ctx.sha}` || !safeId(a.workflow_run?.id) || a.workflow_run.id === ctx.currentRun) continue
    const run=await loadRun(a.workflow_run.id)
    if (run.id !== a.workflow_run.id || run.path !== CI || run.event !== 'pull_request') continue
    if (verifyFull(run,await loadJobs(run.id),ctx,true)) matches.push(run.id)
  }
  // Artifact names are an observational hint, never proof of checkout identity.
  return {runFull:false,reason:'push-shadow-only',possibleDuplicatePRRuns:[...new Set(matches)],canSkipRelease:false}
}

async function main() {
  const e=process.env,ctx={repo:e.GITHUB_REPOSITORY,sha:e.GITHUB_SHA,event:e.GITHUB_EVENT_NAME,schedule:e.NIGHT_SCHEDULE,currentRun:Number(e.GITHUB_RUN_ID),now:Date.now()}
  if (e.GITHUB_REF !== 'refs/heads/main' || !shaOk(ctx.sha) || !safeId(ctx.currentRun) || !/^[\w.-]+\/[\w.-]+$/.test(ctx.repo??'') || !e.GITHUB_OUTPUT) throw Error('Invalid context')
  const base=`https://api.github.com/repos/${ctx.repo}`
  async function api(endpoint) {
    if(!e.GH_TOKEN) throw Error('No credential')
    const response=await fetch(base+endpoint,{headers:{Authorization:`Bearer ${e.GH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000),redirect:'error'})
    if(!response.ok) throw Error(`Actions API ${response.status}`)
    return response.json()
  }
  const jobs=async id=>{
    const p=await api(`/actions/runs/${id}/jobs?filter=latest&per_page=100`)
    if(!Array.isArray(p.jobs)||p.total_count!==p.jobs.length) throw Error('Incomplete jobs')
    return p.jobs
  }
  let result
  try {
    if(ctx.event==='push') {
      const p=await api(`/actions/artifacts?name=ci-candidate-${ctx.sha}&per_page=100`)
      if(!Array.isArray(p.artifacts)) throw Error('Missing artifacts')
      result=await observePush(ctx,p.artifacts,id=>api(`/actions/runs/${id}`),jobs)
    } else if(ctx.event==='schedule' && ctx.schedule==='17 7 * * 0,2-6') {
      const lists=await Promise.all(['ci.yml','ci-nightly.yml'].map(async file=>{
        const p=await api(`/actions/workflows/${file}/runs?branch=main&head_sha=${ctx.sha}&per_page=100`)
        if(!Array.isArray(p.workflow_runs)||p.total_count>p.workflow_runs.length) throw Error('Incomplete runs')
        return p.workflow_runs
      }))
      result=await decideNight(ctx,lists.flat(),jobs)
    } else result=await decideNight(ctx,[],jobs)
  } catch(error) { result={runFull:ctx.event!=='push',reason:'evidence-unavailable',detail:String(error.message).slice(0,200),canSkipRelease:false} }
  const report={...result,sha:ctx.sha,event:ctx.event,canSkipRelease:false}
  console.log(JSON.stringify(report))
  appendFileSync(e.GITHUB_OUTPUT,`run_full=${report.runFull}\nreason=${report.reason}\n`)
  if(e.GITHUB_STEP_SUMMARY) appendFileSync(e.GITHUB_STEP_SUMMARY,`### CI #896\n\n\`\`\`json\n${JSON.stringify(report,null,2)}\n\`\`\`\n`)
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) await main()
