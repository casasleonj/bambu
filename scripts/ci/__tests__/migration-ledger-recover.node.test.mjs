import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {parseObjects,assertRecoverable,probeObjects,registerApplied,assertEvent,main} from '../migration-ledger-recover.mjs'

const h=s=>createHash('sha256').update(s).digest('hex')
const A='20260101_a',B='20260201_b'
const files=new Map([[A,h('SELECT 1;')],[B,h('SELECT 2;')]])
const done=(name=A,extra={})=>({migration_name:name,checksum:files.get(name),
 finished_at:new Date(),rolled_back_at:null,...extra})
const env={GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',
 MIGRATION_NAME:B,EXPECTED_OBJECTS:'tabla:Pago',REGISTER:'true'}
const root=new URL('../../../',import.meta.url)
const read=p=>readFileSync(new URL(p,root),'utf8')

test('gramática de objetos: acepta los cinco tipos',()=>{
 const objs=parseObjects('tabla:PagoComisionEvidencia, columna:Pago.datos\nfuncion:impedir_x,trigger:Pago.trg_x,indice:idx_pago')
 assert.deepEqual(objs.map(o=>o.kind),['tabla','columna','funcion','trigger','indice'])
 assert.deepEqual(objs[1].params,['Pago','datos'])
})
test('gramática de objetos: rechaza vacío, inyección, aridad, duplicados y exceso',()=>{
 for(const bad of ['',' , ','tabla:','tabla:x;DROP TABLE y','tabla:a.b','columna:solo','otro:x',
  'tabla:x:y','tabla:"x"','tabla:x,tabla:x','tabla:1abc'])assert.throws(()=>parseObjects(bad),/Objeto|objeto/,bad)
 assert.throws(()=>parseObjects(undefined),/al menos/)
 assert.throws(()=>parseObjects(Array.from({length:51},(_,i)=>'tabla:t'+i).join(',')),/Demasiados/)
})
test('migración faltante con todo lo demás íntegro es recuperable',()=>{
 assert.equal(assertRecoverable(B,files,[done()]),B)
})
test('rechaza nombre inválido, ausente de Git y ya registrada',()=>{
 assert.throws(()=>assertRecoverable('../x',files,[done()]),/inválido/)
 assert.throws(()=>assertRecoverable('20990101_z',files,[done()]),/ausente en Git/)
 assert.throws(()=>assertRecoverable(B,files,[done(),done(B)]),/ya tiene filas/)
})
test('rechaza fila fallida o revertida de la misma migración (revisión manual)',()=>{
 assert.throws(()=>assertRecoverable(B,files,[done(),{migration_name:B,checksum:files.get(B),finished_at:null,rolled_back_at:new Date()}]),/ya tiene filas/)
 assert.throws(()=>assertRecoverable(B,files,[done(),{migration_name:B,checksum:files.get(B),finished_at:null,rolled_back_at:null}]),/ya tiene filas/)
})
test('otra migración sin registrar o checksum alterado bloquea',()=>{
 assert.throws(()=>assertRecoverable(B,files,[]),/histórica no registrada: 20260101_a/)
 assert.throws(()=>assertRecoverable(B,files,[done(A,{checksum:'0'.repeat(64)})]),/Checksum/)
 assert.throws(()=>assertRecoverable(B,files,[done('20250101_fantasma',{checksum:'x'})]),/ausente en Git/)
})
test('probeObjects: pasa si todos existen y reporta los ausentes sin ejecutar nada más',async()=>{
 const calls=[]
 const objs=parseObjects('tabla:Pago,trigger:Pago.trg')
 assert.equal(await probeObjects(objs,async(sql,...p)=>{calls.push([sql,p]);return [{ok:1}]}),2)
 assert.deepEqual(calls[1][1],['Pago','trg'])
 assert.ok(calls.every(([sql])=>/^SELECT 1 FROM/.test(sql)&&!/;/.test(sql)))
 await assert.rejects(probeObjects(objs,async(sql,...p)=>p[1]?[]:[{ok:1}]),/ausentes.*trigger:Pago\.trg/)
})
test('registerApplied usa npx sin shell y valida el nombre',()=>{
 let seen
 registerApplied(B,(cmd,args,opts)=>{seen={cmd,args,opts}})
 assert.deepEqual(seen.args,['prisma','migrate','resolve','--applied',B])
 assert.equal(seen.opts.shell,undefined)
 assert.throws(()=>registerApplied('x; rm -rf /',()=>{}),/inválido/)
})
test('solo dispatch en main',()=>{
 assertEvent(env)
 for(const patch of [{GITHUB_EVENT_NAME:'push'},{GITHUB_REF:'refs/heads/otra'}])assert.throws(()=>assertEvent({...env,...patch}),/dispatch/)
 assert.throws(()=>assertEvent(null),/dispatch/)
})
test('main: REGISTER=true registra tras verificar; otro valor solo verifica',async()=>{
 const query=async sql=>/_prisma_migrations/.test(sql)?[done()]:[{ok:1}]
 let registered=[]
 const deps={readMigrations:()=>files,query,registerApplied:n=>registered.push(n)}
 assert.equal(await main(env,deps),true)
 assert.deepEqual(registered,[B])
 registered=[]
 assert.equal(await main({...env,REGISTER:'false'},deps),false)
 assert.deepEqual(registered,[])
})
test('main: objeto ausente o ledger inconsistente no registra nada',async()=>{
 let registered=0
 const deps=q=>({readMigrations:()=>files,query:q,registerApplied:()=>{registered++}})
 await assert.rejects(main(env,deps(async sql=>/_prisma_migrations/.test(sql)?[done()]:[])),/ausentes/)
 await assert.rejects(main(env,deps(async()=>[])),/histórica/)
 await assert.rejects(main({...env,EXPECTED_OBJECTS:''},deps(async()=>[done()])),/al menos/)
 assert.equal(registered,0)
})
test('workflow: solo dispatch en main, entorno production, concurrencia compartida, entradas por env',()=>{
 const wf=read('.github/workflows/migrate-recover.yml')
 assert.match(wf,/^on:\n  workflow_dispatch:/m)
 assert.ok(!/\n  push:|pull_request/.test(wf))
 assert.match(wf,/if: github.ref == 'refs\/heads\/main'/)
 assert.match(wf,/environment: production/)
 assert.match(wf,/group: prisma-migrate-production/)
 assert.match(wf,/cancel-in-progress: false/)
 assert.match(wf,/MIGRATION_NAME: \$\{\{ inputs.migracion \}\}/)
 assert.ok(!/run:[^\n]*\$\{\{ inputs\./.test(wf),'los inputs no se interpolan en run')
 assert.ok(!/migrate (deploy|dev|reset)|db push|psql/.test(wf),'sin DDL')
 assert.match(wf,/--postflight/)
})
test('perímetro de confianza incluye el workflow y el script de recuperación',()=>{
 const gate=read('.github/workflows/release-migration-gate.yml')
 const deploy=read('.github/workflows/migrate-deploy.yml')
 const policy=read('.github/workflows/release-migration-policy-tests.yml')
 for(const f of ['scripts/ci/migration-ledger-recover.mjs','.github/workflows/migrate-recover.yml']){
  assert.ok(gate.includes(f),'gate '+f)
  assert.ok(deploy.includes("- '"+f+"'"),'deploy '+f)
 }
 assert.ok(policy.includes("- '.github/workflows/migrate-recover.yml'"))
 assert.ok(policy.includes('scripts/ci/__tests__/migration-ledger-recover.node.test.mjs'))
})
