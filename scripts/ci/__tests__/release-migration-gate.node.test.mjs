import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {strict as assert} from 'node:assert'
import {chooseRun,evaluateRun,waitForMigration,findEffectiveMigrationSha,main} from '../release-migration-gate.mjs'

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
test('push sin cambios Prisma exige salud de la última migración heredada',async()=>{
  let verifiedSha, logCount=0
  await main({
    GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',SCHEMA_CHANGED:'false',
    NEW_MIGRATIONS:'0',GITHUB_SHA:other,LAST_SCHEMA_SHA:sha,LAST_TRUST_SHA:sha,GITHUB_TOKEN:'synthetic-only',
  },{find:async()=>sha,verify:async ({sha:check})=>{
    verifiedSha=check
    return {ok:true,runId:7,runAttempt:1}
  },log:()=>{logCount++}})
  assert.equal(verifiedSha,sha)
  assert.equal(logCount,1)
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

test('rechaza un fallo heredado aunque el commit actual sea solo código o documentación',async()=>{
  const env={
    GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',
    SCHEMA_CHANGED:'false',NEW_MIGRATIONS:'0',
    GITHUB_SHA:other,LAST_SCHEMA_SHA:sha,LAST_TRUST_SHA:sha,GITHUB_TOKEN:'synthetic-only',
  }
  await assert.rejects(main(env,{find:async()=>sha,verify:async()=>{throw Error('migración anterior fallida')}}),
    /migración anterior fallida/)
})
test('push multicommit se certifica por SHA final del push (no por SHA intermedio)',async()=>{
  let used
  await main({
    GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',
    SCHEMA_CHANGED:'true',NEW_MIGRATIONS:'1',
    GITHUB_SHA:other,LAST_SCHEMA_SHA:sha,LAST_TRUST_SHA:sha,GITHUB_TOKEN:'synthetic-only',
  },{
    find:async()=>{throw Error('No debe buscar el historial')},
    verify:async ({sha:check})=>{used=check;return {runId:42,runAttempt:1}},
    log:()=>{},
  })
  assert.equal(used,other)
})
test('sin SHA de esquema válido nunca declara verde, incluso en docs-only',async()=>{
  for(const bad of [undefined,'','HEAD', '0'.repeat(39)]){
    await assert.rejects(main({
      GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',
      SCHEMA_CHANGED:'false',NEW_MIGRATIONS:'0',
      GITHUB_SHA:other,LAST_SCHEMA_SHA:bad,LAST_TRUST_SHA:sha,GITHUB_TOKEN:'synthetic-only',
    }), /SHA/)
  }
})
test('el workflow valida la revisión histórica por primer padre y transmite el SHA',()=>{
  const workflow=readFileSync(new URL('../../../.github/workflows/release-migration-gate.yml',import.meta.url),'utf8')
  assert.ok(workflow.includes('git log --first-parent -1 --format=%H'))
  assert.ok(workflow.includes('git merge-base --is-ancestor'))
  assert.ok(workflow.includes('last_new_count="$(node scripts/ci/release-migration-policy.mjs'))
  assert.ok(workflow.includes('LAST_SCHEMA_SHA: ${{ steps.schema-diff.outputs.last_schema_sha }}'))
  assert.ok(workflow.includes('last_schema_sha=$last_schema_sha'))
  assert.ok(workflow.includes('last_trust_sha=$last_trust_sha'))
  assert.ok(workflow.includes('LAST_TRUST_SHA: ${{ steps.schema-diff.outputs.last_trust_sha }}'))
  assert.ok(!workflow.includes('pull_request:'))
  assert.ok(!workflow.includes('if: github.event_name'))
})

test('busca el último run push main ancestral que cubre la última migración',async()=>{
 const middle='c'.repeat(40),foreign='d'.repeat(40)
 let url
 const result=await findEffectiveMigrationSha({
  candidateSha:other,schemaSha:sha,token:'synthetic-token',
  isAncestor:(a,b)=>a===b||(a===sha&&b===middle)||(a===middle&&b===other)||(a===sha&&b===other),
  fetchFn:async(u,opts)=>{
    url=u;assert.equal(opts.method,'GET')
    return {ok:true,json:async()=>({workflow_runs:[
      run({id:20,head_sha:foreign}),run({id:19,head_sha:middle}),run({id:18,head_sha:sha})
    ]})}
  }
 })
 assert.equal(result,middle)
 assert.ok(url.includes('branch=main&event=push'))
})
test('run de rama ajena, fuera de ancestralidad o manual no certifica',async()=>{
 const attempts=[run({head_sha:'c'.repeat(40)}),run({event:'workflow_dispatch'}),run({head_branch:'other'})]
 await assert.rejects(findEffectiveMigrationSha({
  candidateSha:other,schemaSha:sha,token:'synthetic-token',
  isAncestor:(a,b)=>a===b||(a===sha&&b===other),
  fetchFn:async()=>({ok:true,json:async()=>({workflow_runs:attempts})}),
 }),/No se encontró/)
})
test('historial inaccesible 403 y respuesta malformada son fallo cerrado',async()=>{
 for(const response of [{ok:false,status:403},{ok:true,json:async()=>({error:'bad'})}]){
  await assert.rejects(findEffectiveMigrationSha({
   candidateSha:other,schemaSha:sha,token:'synthetic-token',
   isAncestor:(a,b)=>a===b||(a===sha&&b===other),
   fetchFn:async()=>response,
  }))
 }
})
test('esquema que no es ancestro bloquea antes de consultar API',async()=>{
 await assert.rejects(findEffectiveMigrationSha({
  candidateSha:other,schemaSha:sha,token:'synthetic-token',
  isAncestor:(a,b)=>a===b,
  fetchFn:async()=>{throw Error('No debe consultar API')},
 }),/no es ancestro/)
})

test('los checks de PR y producción son workflows diferentes, sin collision de skipped',()=>{
 const release=readFileSync(new URL('../../../.github/workflows/release-migration-gate.yml',import.meta.url),'utf8')
 const policy=readFileSync(new URL('../../../.github/workflows/release-migration-policy-tests.yml',import.meta.url),'utf8')
 assert.ok(release.includes('name: Production migration gate'))
 assert.ok(release.includes('name: Production migration gate\n'))
 assert.ok(!release.includes('pull_request:'))
 assert.ok(!release.includes('workflow_dispatch:'))
 assert.ok(!release.includes('policy-tests:'))
 assert.ok(policy.includes('pull_request:'))
 assert.ok(policy.includes('name: Release migration policy tests (PR)'))
 assert.ok(!policy.includes('name: Production migration gate'))
})
test('si cambia solo el workflow de migraciones, no hereda el certificado anterior',async()=>{
 let searchedSha
 await main({
   GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',
   SCHEMA_CHANGED:'false',NEW_MIGRATIONS:'0',
   GITHUB_SHA:other,LAST_SCHEMA_SHA:sha,LAST_TRUST_SHA:other,
   GITHUB_TOKEN:'synthetic-only'
 },{
   find:async ({schemaSha})=>{searchedSha=schemaSha;throw Error('No hay certificación posterior al cambio del workflow')},
   verify:async()=>{throw Error('No se debe consultar un run viejo')}
 }).then(()=>{throw Error('No debió aprobar')},err=>{assert.match(err.message,/No hay certificación/)})
 assert.equal(searchedSha,other)
})
test('el SHA de confianza del pipeline no puede faltar ni ser arbitrario',async()=>{
 for(const bad of [undefined,'','main','0'.repeat(40)]){
  await assert.rejects(main({
   GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',
   SCHEMA_CHANGED:'false',NEW_MIGRATIONS:'0',
   GITHUB_SHA:other,LAST_SCHEMA_SHA:sha,LAST_TRUST_SHA:bad,
   GITHUB_TOKEN:'synthetic-only'
  },{find:async()=>sha,verify:async()=>({runId:1,runAttempt:1})}),/SHA/)
 }
})

test('modificar el orquestador obliga a ejecutarlo nuevamente en main',()=>{
 const migrate=readFileSync(new URL('../../../.github/workflows/migrate-deploy.yml',import.meta.url),'utf8')
 const policy=readFileSync(new URL('../../../.github/workflows/release-migration-policy-tests.yml',import.meta.url),'utf8')
 assert.ok(migrate.includes("- '.github/workflows/migrate-deploy.yml'"))
 assert.ok(migrate.includes("- 'prisma/migrations/**'"))
 assert.ok(migrate.includes("- 'prisma/schema.prisma'"))
 assert.ok(policy.includes("- '.github/workflows/migrate-deploy.yml'"))
})
