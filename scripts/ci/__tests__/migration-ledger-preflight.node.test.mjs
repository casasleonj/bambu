import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {createHash} from 'node:crypto'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {readMigrations,diffAddedMigrations,verifyLedger,addedInPush} from '../migration-ledger-preflight.mjs'
const h=s=>createHash('sha256').update(s).digest('hex')
const files=new Map([['20260101_a',h('SELECT 1;')],['20260201_b',h('SELECT 2;')]])
const done=(name='20260101_a',extra={})=>({migration_name:name,checksum:files.get(name),
 finished_at:new Date(),rolled_back_at:null,...extra})
const diff=(...pairs)=>Buffer.from(pairs.flat().join('\0')+'\0')
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
test('rollback seguido de éxito pasa',()=>{
 assert.equal(verifyLedger(files,[done('20260101_a',{finished_at:null,rolled_back_at:new Date()}),
 done(),done('20260201_b')]).completed,2)
})
test('rollback sin re-aplicación exitosa bloqueado',()=>{
 assert.throws(()=>verifyLedger(files,[done('20260101_a',{finished_at:null,rolled_back_at:new Date()}),
 done('20260201_b')]),/Rollback/)
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
