// #896: report completed trusted nightly attempts; never use PR artifacts or logs.
import { createHash } from 'node:crypto'
import { readFileSync, appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { verifyFull } from './reuso-ci.mjs'

const NIGHT='.github/workflows/ci-nightly.yml'
const BOT='github-actions[bot]'
const MARK='bambu-ci-nightly:v1'
const validId=x=>Number.isSafeInteger(x)&&x>0
const validSha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x)
const clean=x=>String(x??'unknown').replace(/[^a-zA-Z0-9 /()_.:#-]/g,'_').slice(0,180)
const success=x=>x?.status==='completed'&&x.conclusion==='success'
const date=x=>typeof x==='string'?Date.parse(x):NaN
const isBot=x=>x?.user?.login===BOT&&x.user.type==='Bot'

export function trusted(run,repo) {
  return !!run && validId(run.id)&&validId(run.run_attempt)&&validSha(run.head_sha)&&run.path===NIGHT&&
    run.repository?.full_name===repo&&run.head_repository?.full_name===repo&&run.head_branch==='main'&&
    ['schedule','workflow_dispatch'].includes(run.event)&&run.status==='completed'&&typeof run.conclusion==='string'
}
export function sameAttempt(a,b) {
  return ['id','run_attempt','head_sha','path','event','head_branch','status','conclusion'].every(k=>a[k]===b[k])
}
export function runnerSeconds(jobs) {
  if(!Array.isArray(jobs)||!jobs.length) throw Error('Missing jobs')
  let total=0
  for(const job of jobs) {
    if(job.conclusion==='skipped') continue
    const start=date(job.started_at), end=date(job.completed_at)
    if(job.status!=='completed'||!Number.isFinite(start)||!Number.isFinite(end)||end<start) throw Error('Incomplete job times')
    total+=(end-start)/1000
  }
  return total
}
export function measureReuse(run,jobs,decision,source,sourceJobs,repo) {
  if(!trusted(run,repo)||!success(run)) throw Error('Not a successful trusted nightly')
  const actual=runnerSeconds(jobs)
  if(!decision||decision.run!==run.id||decision.attempt!==run.run_attempt||decision.sha!==run.head_sha||
    decision.event!==run.event||decision.canSkipRelease!==false||!Number.isFinite(decision.decisionAt)||
    decision.decisionAt<date(run.created_at)||decision.decisionAt>date(run.updated_at)) throw Error('Missing or mismatched decision')
  const summary=jobs.filter(j=>j.name==='Nightly result (not a release gate)')
  const plan=jobs.filter(j=>j.name==='Nightly decision (read-only)')
  if(summary.length!==1||!success(summary[0])||plan.length!==1||!success(plan[0])) throw Error('Missing successful plan/summary')
  if(decision.runFull===true) {
    if(!verifyFull(run,jobs,{repo,sha:run.head_sha,currentRun:0,now:date(run.updated_at)})) throw Error('Full evidence incomplete or ambiguous')
    return {kind:'full',run:run.id,actualRunnerSeconds:actual,avoidedRunnerSeconds:0}
  }
  const skipped=jobs.filter(j=>j.name==='Regression full')
  if(run.event!=='schedule'||decision.runFull!==false||decision.reason!=='fresh-exact-main-full'||
    !validId(decision.source)||source?.id!==decision.source||skipped.length!==1||skipped[0].conclusion!=='skipped'||
    jobs.some(j=>j.name.startsWith('Regression full / '))) throw Error('Invalid reuse evidence')
  if(!verifyFull(source,sourceJobs,{repo,sha:run.head_sha,currentRun:run.id,now:decision.decisionAt})) throw Error('Original full suite cannot be verified')
  const reference=runnerSeconds(sourceJobs)
  return {kind:'reused',run:run.id,source:source.id,referenceRunnerSeconds:reference,actualRunnerSeconds:actual,
    avoidedRunnerSeconds:reference-actual,limitation:'Historical full-run comparison, excludes independent reporting job; not billing or counterfactual certainty'}
}
export function incident(run,jobs,repo) {
  if(!trusted(run,repo)||success(run)) throw Error('Not a failed trusted nightly')
  const failures=jobs.filter(j=>j.status==='completed'&&!['success','skipped'].includes(j.conclusion)).map(j=>{
    const steps=(j.steps??[]).filter(s=>s.status==='completed'&&!['success','skipped'].includes(s.conclusion))
      .map(s=>clean(s.name)+':'+clean(s.conclusion)).sort()
    return clean(j.name)+':'+clean(j.conclusion)+(steps.length?' ['+steps.join(', ')+']':'')
  }).sort()
  // Do not group only by SHA or include logs, secrets, or arbitrary issue input.
  const signature=createHash('sha256').update(JSON.stringify([clean(run.conclusion),failures])).digest('hex')
  const marker='<!-- '+MARK+':'+signature+' -->'
  const occurrence='<!-- '+MARK+':run:'+run.id+':'+run.run_attempt+' -->'
  const url='https://github.com/'+repo+'/actions/runs/'+run.id+'/attempts/'+run.run_attempt
  const detail=occurrence+'\n'+
    'Regresión nocturna: **'+clean(run.conclusion)+'**. [Ejecución '+run.id+' / intento '+run.run_attempt+']('+url+').\n\n'+
    'Commit: '+run.head_sha+'\n\n'+(failures.length?failures.map(f=>'- '+f).join('\n'):'No hay detalle de trabajos fallidos; revisar cancelación, inicio o infraestructura.')+
    '\n\nRegistro automático de señal, no diagnóstico de causa. Verificar firmas, baseline y QA antes de cerrar. Ref #896.'
  return {title:'[CI nocturno] Incidencia '+signature.slice(0,12),marker,occurrence,body:marker+'\n'+detail,detail}
}
export async function recordIncident(run,jobs,repo,api) {
  const item=incident(run,jobs,repo)
  // Authoritative pagination. Also search recently closed issues to make replay idempotent.
  const open=await api.pages('/issues?state=open&per_page=100')
  const since=new Date(date(run.created_at)-86400000).toISOString()
  const recent=await api.pages('/issues?state=closed&since='+encodeURIComponent(since)+'&per_page=100')
  const matching=[...open,...recent].filter(i=>!i.pull_request&&isBot(i)&&i.body?.includes(item.marker))
  for(const i of matching) {
    if(i.body.includes(item.occurrence)) return {action:'already-recorded',issue:i.number}
    const comments=await api.pages('/issues/'+i.number+'/comments?per_page=100')
    if(comments.some(c=>isBot(c)&&c.body?.includes(item.occurrence))) return {action:'already-recorded',issue:i.number}
  }
  const active=matching.filter(i=>i.state==='open')
  if(active.length>1) throw Error('Multiple open incidents with same signature')
  if(active.length===1){
    await api.post('/issues/'+active[0].number+'/comments',{body:item.detail})
    return {action:'commented',issue:active[0].number}
  }
  const created=await api.post('/issues',{title:item.title,body:item.body})
  if(!validId(created.number)) throw Error('Issue creation response incomplete')
  return {action:'created',issue:created.number}
}
function client(repo,token) {
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo??'')||!token) throw Error('Invalid API context')
  async function request(endpoint,body) {
    const res=await fetch('https://api.github.com/repos/'+repo+endpoint,{
      method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)})
    if(!res.ok) throw Error('GitHub API '+res.status)
    return res.json()
  }
  return {get:request,post:request,pages:async endpoint=>{
    const all=[];for(let page=1;page<=50;page++){
      const list=await request(endpoint+'&page='+page)
      if(!Array.isArray(list)) throw Error('Incomplete list')
      all.push(...list);if(list.length<100) return all
    }throw Error('Pagination limit; refusing incomplete write')
  }}
}
async function getJobs(api,run) {
  const all=[];let total
  for(let page=1;page<=10;page++){
    const p=await api.get('/actions/runs/'+run.id+'/attempts/'+run.run_attempt+'/jobs?per_page=100&page='+page)
    if(!Array.isArray(p.jobs)||!Number.isSafeInteger(p.total_count)||p.total_count<0||(total!==undefined&&total!==p.total_count)) throw Error('Incomplete job list')
    total=p.total_count
    all.push(...p.jobs)
    if(all.some(j=>j.run_id!==run.id||j.run_attempt!==run.run_attempt||j.head_sha!==run.head_sha)) throw Error('Job identity mismatch')
    if(all.length===total) {if(new Set(all.map(j=>j.id)).size!==all.length) throw Error('Duplicate job IDs');return all}
    if(!p.jobs.length||all.length>total) break
  }
  throw Error('Incomplete jobs')
}
async function main() {
  const e=process.env, repo=e.GITHUB_REPOSITORY
  if(e.GITHUB_REF!=='refs/heads/main') throw Error('Only reporter event on main')
  const api=client(repo,e.GH_TOKEN),mode=process.argv[2]
  let run
  if(e.GITHUB_EVENT_NAME==='workflow_run'){
    const payload=JSON.parse(readFileSync(e.GITHUB_EVENT_PATH,'utf8'))
    const claim=payload.workflow_run
    if(payload.action!=='completed'||!trusted(claim,repo)) throw Error('Untrusted workflow event')
    run=await api.get('/actions/runs/'+claim.id+'/attempts/'+claim.run_attempt)
    if(!trusted(run,repo)||!sameAttempt(claim,run)) throw Error('Workflow identity mismatch')
  }else if(e.GITHUB_EVENT_NAME==='workflow_dispatch'&&mode==='incident'){
    if(!/^[1-9][0-9]*$/.test(e.REPORT_RUN_ID??'')||!/^[1-9][0-9]*$/.test(e.REPORT_RUN_ATTEMPT??'')) throw Error('Invalid replay IDs')
    const id=Number(e.REPORT_RUN_ID),attempt=Number(e.REPORT_RUN_ATTEMPT)
    if(!validId(id)||!validId(attempt)) throw Error('Invalid replay IDs')
    run=await api.get('/actions/runs/'+id+'/attempts/'+attempt)
    if(!trusted(run,repo)||run.id!==id||run.run_attempt!==attempt) throw Error('Invalid replay source')
  }else throw Error('Untrusted reporter trigger')
  let result
  if(mode==='incident'){
    if(success(run)) throw Error('Successful run is not an incident')
    // If the API cannot provide jobs, still record an infrastructure incident,
    // explicitly distinguishing evidence unavailable from an empty successful list.
    let jobs;try{jobs=await getJobs(api,run)}catch{jobs=[{name:'Job evidence unavailable',status:'completed',conclusion:'failure'}]}
    result=await recordIncident(run,jobs,repo,api)
  }else if(mode==='measure'){
    const jobs=await getJobs(api,run)
    const decision=JSON.parse(readFileSync(e.NIGHT_DECISION_FILE,'utf8'))
    let source,sourceJobs
    if(decision.runFull===false&&validId(decision.source)){
      source=await api.get('/actions/runs/'+decision.source+'/attempts/1')
      sourceJobs=await getJobs(api,source)
    }
    result=measureReuse(run,jobs,decision,source,sourceJobs,repo)
  }else throw Error('Unknown mode')
  console.log(JSON.stringify(result))
  if(e.GITHUB_STEP_SUMMARY) appendFileSync(e.GITHUB_STEP_SUMMARY,'### CI nocturno #896\n\n'+Object.entries(result).map(([k,v])=>'- '+k+': '+v).join('\n')+'\n')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await main()
