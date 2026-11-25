import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {countNewMigrationFiles} from '../release-migration-policy.mjs'

const diff=(...pairs)=>Buffer.from(pairs.flat().join('\0')+'\0')

test('diff vacío = cero migraciones nuevas, sin hacer DDL',()=>{
  assert.equal(countNewMigrationFiles(Buffer.alloc(0)),0)
})
test('solo admite migration.sql agregado bajo prisma/migrations',()=>{
  assert.equal(countNewMigrationFiles(diff(['A','prisma/migrations/20261122_new/migration.sql'])),1)
  assert.equal(countNewMigrationFiles(diff(
    ['A','prisma/migrations/20261122_a/migration.sql'],
    ['A','prisma/migrations/20261122_b/migration.sql']
  )),2)
})
test('no certifica modificación de una migración histórica',()=>{
  assert.throws(()=>countNewMigrationFiles(diff(['M','prisma/migrations/20260101_old/migration.sql'])),/histórica/)
})
test('no certifica eliminar ni renombrar una migración histórica',()=>{
  for(const status of ['D','R100','T','C75']){
    assert.throws(()=>countNewMigrationFiles(diff([status,'prisma/migrations/20260101_old/migration.sql'])),/histórica/)
  }
})
test('no acepta agregar ficheros distintos a migration.sql',()=>{
  assert.throws(()=>countNewMigrationFiles(diff(['A','prisma/migrations/2026_new/README.md'])),/inesperado/)
})
test('no acepta diff malformado, no terminado en NUL o tipo equivocado',()=>{
  assert.throws(()=>countNewMigrationFiles('A\0path\0'),/Buffer/)
  assert.throws(()=>countNewMigrationFiles(Buffer.from('A\0path')),/NUL/)
  assert.throws(()=>countNewMigrationFiles(Buffer.from('A\0')),/malformado/)
})
test('rechaza bytes inválidos de rutas sin interpretar como cambios inocuos',()=>{
  assert.throws(()=>countNewMigrationFiles(Buffer.from([65,0,255,0])))
})
