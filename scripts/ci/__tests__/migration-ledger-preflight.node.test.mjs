import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {createHash} from 'node:crypto'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {readMigrations,diffAddedMigrations,verifyLedger,addedInPush,allowedPendingForEvent,writeApplyDecision} from '../migration-ledger-preflight.mjs'
const h=s=>createHash('sha256').update(s).digest('hex')
const files=new Map([['20260101_a',h('SELECT 1;')],['20260201_b',h('SELECT 2;')]])
const done=(name='20260101_a',extra={})=>({migration_name:name,checksum:files.get(name),
 finished_at:new Date(),rolled_back_at:null,...extra})
const diff=(...pairs)=>Buffer.from(pairs.flat().join('\0')+'\0')
const older=new Date('2026-01-01T00:00:00Z'),newer=new Date('2026-01-02T00:00:00Z')
test('historial íntegro',()=>{assert.deepEqual(verifyLedger(files,[done(),done('20260201_b')]),{completed:2,pending:[]})})
test('pendiente permitido solo si fue agregado en este push',()=>{
 assert.deepEqual(verifyLedger(files,[done()],new Set(['20260201_b'])),{completed:1,pending:['20260201_b']})
 assert.throws(()=>verifyLedger(files,[done()]),/histórica/)
})
test('alteración de checksum no certifica',()=>{
 assert.throws(()=>verifyLedger(files,[done('20260101_a',{checksum:'0'.repeat(64)}),done('20260201_b')]),/Checksum/)
})
test('migración aplicada fuera del árbol local rechazada',()=>{
 assert.throws(()=>verifyLedger(files,[done('no_existe',{checksum:h('X')})]),/ausente/)
})
test('migración incompleta sin rollback bloqueada',()=>{
 assert.throws(()=>verifyLedger(files,[done('20260101_a',{finished_at:null})]),/incompleta/)
})
test('rollback histórico anterior a la aplicación exitosa pasa aunque las filas estén invertidas',()=>{
 const ledger=[
  done('20260101_a',{finished_at:newer}),
  done('20260201_b'),
  done('20260101_a',{finished_at:null,rolled_back_at:older}),
 ]
 assert.equal(verifyLedger(files,ledger).completed,2)
})
test('rollback sin re-aplicación exitosa bloqueado',()=>{
 assert.throws(()=>verifyLedger(files,[done('20260101_a',{finished_at:null,rolled_back_at:new Date()}),
 done('20260201_b')]),/Rollback/)
})
test('aplicación anterior seguida de rollback posterior se bloquea',()=>{
 const ledger=[
  done('20260101_a',{finished_at:older}),
  done('20260201_b'),
  done('20260101_a',{finished_at:null,rolled_back_at:newer}),
 ]
 assert.throws(()=>verifyLedger(files,ledger),/Rollback sin posterior éxito/)
})
test('rollback con la misma marca de tiempo de aplicación no se certifica',()=>{
 const ledger=[
  done('20260101_a',{finished_at:newer}),
  done('20260101_a',{finished_at:null,rolled_back_at:newer}),
  done('20260201_b'),
 ]
 assert.throws(()=>verifyLedger(files,ledger),/Rollback sin posterior éxito/)
})
test('fecha faltante o ilegible no certifica un éxito ni un rollback',()=>{
 assert.throws(()=>verifyLedger(files,[done('20260101_a',{finished_at:'no-fecha'}),
  done('20260201_b')]),/Fecha inválida/)
 assert.throws(()=>verifyLedger(files,[done('20260101_a',{finished_at:null,rolled_back_at:'no-fecha'}),
  done('20260101_a'),done('20260201_b')]),/Fecha inválida/)
})
test('duplicación y estado contradictorio bloqueados',()=>{
 assert.throws(()=>verifyLedger(files,[done(),done()]),/duplicada/)
 assert.throws(()=>verifyLedger(files,[done('20260101_a',{rolled_back_at:new Date()})]),/contradictorio/)
})
test('interpreta diff NUL y bloquea cualquier edición histórica',()=>{
 assert.deepEqual([...diffAddedMigrations(diff(['A','prisma/migrations/20260301_c/migration.sql']))],['20260301_c'])
 for(const status of ['M','D','R100'])assert.throws(()=>
  diffAddedMigrations(diff([status,'prisma/migrations/20260101_a/migration.sql'])))
})
test('SHA inválido no invoca Git',()=>{
 assert.throws(()=>addedInPush('HEAD','f'.repeat(40),()=>{throw Error('No llamar')}),/SHA/)
})
test('nuevas ausentes de Git no certifican',()=>{
 assert.throws(()=>verifyLedger(files,[done(),done('20260201_b')],new Set(['missing'])),/fuera de Git/)
})
test('usa bytes reales de migration.sql para checksum',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bambu-ledger-'))
 try{mkdirSync(join(dir,'20260101_a'));writeFileSync(join(dir,'20260101_a','migration.sql'),'SELECT 1;')
  writeFileSync(join(dir,'migration_lock.toml'),'provider="postgresql"')
  assert.equal(readMigrations(dir).get('20260101_a'),h('SELECT 1;'))
 }finally{rmSync(dir,{recursive:true,force:true})}
})

test('workflow_dispatch solo verifica main sin ejecutar cálculo de cambios',()=>{
 let invoked=0
 const result=allowedPendingForEvent({GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main'},
  ()=>{invoked++;throw Error('NO consultar diferencias')})
 assert.equal(result.size,0)
 assert.equal(invoked,0)
})
test('push main identifica cambios pero eventos ajenos o refs distintos se rechazan',()=>{
 let called=0
 const allowed=allowedPendingForEvent({GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',
  GITHUB_EVENT_BEFORE:'a'.repeat(40),GITHUB_SHA:'b'.repeat(40)},(before,after)=>{
  called++;assert.equal(before,'a'.repeat(40));assert.equal(after,'b'.repeat(40))
  return new Set(['20260101_a'])
 })
 assert.equal(allowed.has('20260101_a'),true)
 assert.equal(called,1)
 for(const e of [
  {GITHUB_EVENT_NAME:'pull_request',GITHUB_REF:'refs/heads/main'},
  {GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/feature'},
 ]){
  assert.throws(()=>allowedPendingForEvent(e),/autorizados/)
 }
})
test('sin pendientes emite apply_pending=false; sin output no autoriza DDL',()=>{
 let wrote=[]
 assert.equal(writeApplyDecision([],'/tmp/synthetic',(f,s)=>wrote.push({f,s})),false)
 assert.equal(wrote.length,1)
 assert.equal(wrote[0].s,'apply_pending=false\\n')
 assert.throws(()=>writeApplyDecision([],null,()=>{throw Error('NO escribir')}),/GITHUB_OUTPUT/)
})
test('migración nueva validada emite apply_pending=true SOLO al confirmar resultados',()=>{
 let wrote=[]
 assert.equal(writeApplyDecision(['20260101_a'],'/tmp/synthetic',(f,s)=>wrote.push(s)),true)
 assert.equal(wrote.length,1)
 assert.equal(wrote[0],'apply_pending=true\\n')
 let called=0
 assert.throws(()=>writeApplyDecision([null],'/tmp/synthetic',()=>{called++}),/inválido/)
 assert.equal(called,0)
})
test('workflow de producción requiere señal positiva del preflight para DDL',()=>{
 const flow=readFileSync('.github/workflows/migrate-deploy.yml','utf8')
 assert.match(flow,/id: preflight/)
 assert.match(flow,/if: github.event_name == 'push' && steps.preflight.outputs.apply_pending == 'true'/)
})
