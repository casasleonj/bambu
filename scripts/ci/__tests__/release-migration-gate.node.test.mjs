import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {strict as assert} from 'node:assert'
import {chooseRun,evaluateRun,waitForMigration,main} from '../release-migration-gate.mjs'

const sha='a'.repeat(40), other='b'.repeat(40)
const run=(x={})=>({
  id:10,head_sha:sha,event:'push',head_branch:'main',run_attempt:1,
  created_at:'2026-11-22T19:00:00Z',status:'completed',conclusion:'success',...x,
})
function scenario(batches,{step=5000}={}) {
  let i=0,clock=0,urls=[],calls=[]
  const fetchFn=async(url,request)=>{
    urls.push(url); calls.push(request)
    const runs=batches[Math.min(i++,batches.length-1)]
    return {ok:true,json:async()=>({workflow_runs:runs})}
  }
  return {fetchFn,sleep:async ms=>{clock+=Math.min(ms,step)},now:()=>clock,
    get calls(){return calls},get urls(){return urls}}
}
const opts=(f,extra={})=>({sha,token:'synthetic-token-not-real',...f,interval:1000,
  appearanceTimeout:2500,totalTimeout:4000,...extra})

test('selecciona el intento mas reciente del SHA exacto en push main',()=>{
  const arr=[run({id:3,head_sha:other}),run({id:2,conclusion:'failure'}),
    run({id:4,run_attempt:1,conclusion:'failure'}),run({id:4,run_attempt:2})]
  assert.equal(chooseRun(arr,sha)?.run_attempt,2)
})
test('descarta runs de otra rama, evento, SHA, id o sin timestamp',()=>{
  const arr=[run({event:'workflow_dispatch'}),run({head_branch:'dev'}),
    run({id:NaN}),run({created_at:'invalid'}),run({head_sha:other})]
  assert.equal(chooseRun(arr,sha),null)
})
test('estados sin conclusion valida nunca dan verde',()=>{
  assert.equal(evaluateRun(null),'pending')
  assert.equal(evaluateRun(run({status:'in_progress',conclusion:'success'})),'pending')
  assert.equal(evaluateRun(run({conclusion:'cancelled'})),'failure')
  assert.equal(evaluateRun(run({conclusion:'skipped'})),'failure')
  assert.equal(evaluateRun(run()),'success')
})
test('run mismo SHA verde: aprueba en lectura y solo desde endpoint fijo',async()=>{
  const s=scenario([[run()]])
  const res=await waitForMigration(opts(s))
  assert.deepEqual(res,{ok:true,runId:10,runAttempt:1})
  assert.equal(s.urls.length,1)
  assert.ok(s.urls[0].includes('head_sha='+sha+'&event=push'))
  assert.equal(s.calls[0].method,'GET')
  assert.equal(s.calls[0].redirect,'error')
})
test('migracion fallida o cancelada bloquea',async()=>{
  for(const conclusion of ['failure','cancelled','timed_out','skipped','neutral']){
    await assert.rejects(waitForMigration(opts(scenario([[run({conclusion})]]))),new RegExp(conclusion))
  }
})
test('no confunde exito de otro SHA con el candidato',async()=>{
  await assert.rejects(waitForMigration(opts(scenario([[run({head_sha:other})]]))),
    /No apareció/)
})
test('no confunde workflow_dispatch manual con push',async()=>{
  await assert.rejects(waitForMigration(opts(scenario([[run({event:'workflow_dispatch'})]]))),
    /No apareció/)
})
test('espera por corrida y autoriza solo al finalizar',async()=>{
  const s=scenario([[],[run({status:'queued',conclusion:null})],
    [run({status:'in_progress',conclusion:null})],[run()]])
  const r=await waitForMigration(opts(s))
  assert.equal(r.ok,true);assert.equal(s.calls.length,4)
})
test('si no aparece el workflow, falla tras plazo acotado',async()=>{
  const s=scenario([[]])
  await assert.rejects(waitForMigration(opts(s)),/No apareció/)
  assert.ok(s.calls.length<=5)
})
test('no acepta corrida atascada mas alla del timeout',async()=>{
  const s=scenario([[run({status:'in_progress',conclusion:null})]])
  await assert.rejects(waitForMigration(opts(s)),/Tiempo agotado/)
})
test('API 403 y respuesta malformada son fallos, nunca verde',async()=>{
  await assert.rejects(waitForMigration(opts({fetchFn:async()=>({ok:false,status:403})})),/403/)
  await assert.rejects(waitForMigration(opts({fetchFn:async()=>({ok:true,json:async()=>({})})})),/Respuesta/)
})
test('rechaza hashes incompletos y ausencia de token',async()=>{
  await assert.rejects(waitForMigration({sha:'HEAD',token:'x'}),/SHA/)
  await assert.rejects(waitForMigration({sha}),/token/)
})
test('solo permite emitir gate en push main',async()=>{
  await assert.rejects(main({GITHUB_EVENT_NAME:'pull_request',GITHUB_REF:'refs/heads/main',
    NEEDS_MIGRATION:'false'}),/push/)
  await assert.rejects(main({GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/dev',
    NEEDS_MIGRATION:'false'}),/main/)
  await assert.rejects(main({GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',
    SCHEMA_CHANGED:'unknown',NEW_MIGRATIONS:'0'}),/Clasificación/)
})
test('sin cambios Prisma en main aprueba sin red ni secretos',async()=>{
  const previous=console.log;let count=0
  try{console.log=()=>count++;await main({
    GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',SCHEMA_CHANGED:'false',
    NEW_MIGRATIONS:'0',
  })}finally{console.log=previous}
  assert.equal(count,1)
})

test('schema Prisma modificado sin migración nueva bloquea el falso verde',async()=>{
  await assert.rejects(main({
    GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',
    SCHEMA_CHANGED:'true',NEW_MIGRATIONS:'0',
    GITHUB_SHA:sha,GITHUB_TOKEN:'synthetic-only',
  }), /sin migración nueva/)
})
test('clasificación ausente o desconocida bloquea',async()=>{
  for(const value of [undefined,'','unknown']) {
    await assert.rejects(main({
      GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',
      SCHEMA_CHANGED:'false',NEW_MIGRATIONS:value,
    }), /Conteo de migraciones/)
  }
  await assert.rejects(main({
    GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',
    SCHEMA_CHANGED:'unknown',NEW_MIGRATIONS:'1',
  }), /Clasificación/)
})
test('el workflow cuenta migraciones nuevas y NO trata el manifiesto de tests como DDL de producción',()=>{
  const workflow=readFileSync(new URL('../../../.github/workflows/release-migration-gate.yml',import.meta.url),'utf8')
  assert.ok(workflow.includes('git diff --name-status --no-renames -z'))
  assert.ok(workflow.includes('new_migrations=$new_count'))
  assert.ok(workflow.includes('SCHEMA_CHANGED: ${{ steps.schema-diff.outputs.schema_changed }}'))
  assert.ok(workflow.includes('NEW_MIGRATIONS: ${{ steps.schema-diff.outputs.new_migrations }}'))
  assert.ok(!workflow.includes('RAW_SQL_CHANGED:'))
  assert.ok(!workflow.includes('raw_sql_changed='))
})
