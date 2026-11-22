import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {percentile,summarize,parseArgs,listRuns,main} from '../baseline-ci.mjs'

const now=Date.parse('2026-11-22T20:00:00Z')
const sample={
  id:1,path:'.github/workflows/ci.yml',event:'pull_request',head_branch:'feat/a',
  status:'completed',conclusion:'success',created_at:'2026-11-22T19:00:00Z',
  updated_at:'2026-11-22T19:20:00Z',pull_requests:[{number:123}]
}
const run=(x={})=>({...sample,...x})

test('p50 y p95 nearest rank sin mutar datos',()=>{
  const a=[80,10,40,20]
  assert.equal(percentile(a,50),20)
  assert.equal(percentile(a,95),80)
  assert.deepEqual(a,[80,10,40,20])
  assert.equal(percentile([],50),null)
  assert.throws(()=>percentile([1],-1))
})
test('ignora workflows ajenos y corridas fuera de ventana',()=>{
  const s=summarize([run(),run({id:2,path:'.github/workflows/backlog.yml'}),
    run({id:3,created_at:'2026-11-01T12:00:00Z'}),
    run({id:4,event:'push'})],{event:'pull_request',now})
  assert.equal(s.total,1);assert.equal(s.counts.success,1);assert.equal(s.successfulMin.p50,20)
})
test('deduplica id y rechaza ids inválidos',()=>{
  const s=summarize([run(),run(),run({id:0})],{event:'pull_request',now})
  assert.equal(s.total,1);assert.equal(s.malformed,2)
})
test('cancelado es distinto de verde y no considera pendiente como cancelado',()=>{
  const s=summarize([run(),run({id:2,conclusion:'cancelled',updated_at:'2026-11-22T19:04:00Z'}),
    run({id:3,status:'in_progress',conclusion:null})],{event:'pull_request',now})
  assert.equal(s.complete,2);assert.equal(s.pending,1)
  assert.equal(s.cancelledPct,50);assert.equal(s.successfulMin.samples,1)
})
test('no calcula percentiles sobre tiempos inválidos',()=>{
  const s=summarize([run({updated_at:'2026-11-22T18:00:00Z'})],{event:'pull_request',now})
  assert.equal(s.invalidDurations,1);assert.equal(s.successfulMin.p95,null)
})
test('agrupa repetición por PR y fallback por rama',()=>{
  const s=summarize([run(),run({id:2}),
    run({id:3,head_branch:'feat/b',pull_requests:[]}),
    run({id:4,head_branch:'feat/b',pull_requests:[]})],{event:'pull_request',now})
  assert.deepEqual(s.frequentlyRerun,[{ref:'PR #123',executions:2},{ref:'rama feat/b',executions:2}])
})
test('push solo main; filtra rama secundaria',()=>{
  const s=summarize([run({event:'push',head_branch:'main'}),
    run({id:2,event:'push',head_branch:'feat/b'})],{event:'push',now})
  assert.equal(s.total,1)
})
test('rechaza intervalo/objetos/evento inadecuados',()=>{
  assert.throws(()=>summarize(null,{event:'push',now}))
  assert.throws(()=>summarize([],{event:'merge_group',now}))
  assert.throws(()=>summarize([],{event:'push',now,hours:9999}))
})
test('CLI limita consulta y no permite argumentos arbitrarios',()=>{
  assert.deepEqual(parseArgs(['--hours','48','--pages','2','--json']),
    {hours:48,pages:2,json:true})
  for(const argv of [['--hours','0'],['--pages','99'],['--pages','-1'],['--random']]) {
    assert.throws(()=>parseArgs(argv))
  }
})
test('GitHub REST paginado, solo lectura, endpoint fijo',async()=>{
  const seen=[]
  const fetchFn=async(url,init)=>{
    seen.push({url,init})
    return {ok:true,json:async()=>({workflow_runs:Array.from({length:seen.length===1?100:1},(_,i)=>({id:i+1}))})}
  }
  const r=await listRuns({repo:'casasleonj/bambu',event:'pull_request',pages:3,fetchFn})
  assert.equal(r.length,101);assert.equal(seen.length,2)
  assert.ok(seen.every(x=>x.url.startsWith('https://api.github.com/repos/casasleonj/bambu/actions/runs?')))
  assert.ok(seen.every(x=>x.init.redirect==='error'))
  await assert.rejects(listRuns({repo:'foo/bar?evil=1',event:'push',pages:1,fetchFn}),/Consulta inválida/)
})
test('API 403 o esquema incompleto rechaza el reporte; nunca inventa verde',async()=>{
  await assert.rejects(listRuns({repo:'foo/bar',event:'push',pages:1,
    fetchFn:async()=>({ok:false,status:403})}),/403/)
  await assert.rejects(listRuns({repo:'foo/bar',event:'push',pages:1,
    fetchFn:async()=>({ok:true,json:async()=>({foo:true})})}),/inesperada/)
})
test('main invoca ambos eventos y da un informe, sin mutaciones',async()=>{
  const requests=[]
  const fetchFn=async(url,init)=>{
    requests.push({url,init})
    return {ok:true,json:async()=>({workflow_runs:[run({id:requests.length,
      event:url.includes('event=push')?'push':'pull_request',
      head_branch:url.includes('event=push')?'main':'feat/a'})]})}
  }
  const logs=[], old=console.log
  try{
    console.log=(...args)=>logs.push(args.join(' '))
    const s=await main(['--hours','72','--pages','1'],{GITHUB_REPOSITORY:'casasleonj/bambu'},fetchFn)
    assert.equal(s.stats.length,2);assert.equal(requests.length,2)
    assert.equal(s.stats[0].counts.success,0) // llamadas sintéticas viejas: fuera de la ventana actual
    assert.equal(logs.length,2)
  } finally {console.log=old}
})
