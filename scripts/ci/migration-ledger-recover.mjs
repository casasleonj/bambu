// #1017 · Recuperación auditable del ledger Prisma: registra UNA migración cuyo
// SQL ya está aplicado en producción pero que no figura en _prisma_migrations.
// Nunca ejecuta DDL: solo consultas de catálogo de lectura y `migrate resolve`.
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {readMigrations,verifyLedger} from './migration-ledger-preflight.mjs'

const NAME=/^[A-Za-z0-9_.-]+$/
const IDENT=/^[A-Za-z_][A-Za-z0-9_]{0,62}$/
export const MAX_OBJECTS=50

// Consultas CONSTANTES de catálogo; los datos viajan solo como parámetros.
const PROBES={
 tabla:{arity:1,sql:'SELECT 1 FROM information_schema.tables WHERE table_schema=\'public\' AND table_name=$1'},
 columna:{arity:2,sql:'SELECT 1 FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1 AND column_name=$2'},
 funcion:{arity:1,sql:'SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=\'public\' AND p.proname=$1'},
 trigger:{arity:2,sql:'SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=\'public\' AND c.relname=$1 AND t.tgname=$2 AND NOT t.tgisinternal'},
 indice:{arity:1,sql:'SELECT 1 FROM pg_indexes WHERE schemaname=\'public\' AND indexname=$1'},
}

// Gramática: tabla:Nombre | columna:tabla.col | funcion:nombre | trigger:tabla.nombre | indice:nombre
export function parseObjects(raw){
 if(typeof raw!=='string'||!raw.trim())throw Error('Debe declarar al menos un objeto esperado')
 const items=raw.split(/[\n,]/).map(x=>x.trim()).filter(Boolean)
 if(!items.length)throw Error('Debe declarar al menos un objeto esperado')
 if(items.length>MAX_OBJECTS)throw Error('Demasiados objetos declarados')
 const seen=new Set()
 return items.map(item=>{
  const [kind,rest,...extra]=item.split(':')
  const probe=PROBES[kind]
  if(!probe||rest===undefined||extra.length)throw Error('Objeto con gramática inválida: '+item.slice(0,80))
  const parts=rest.split('.')
  if(parts.length!==probe.arity||!parts.every(p=>IDENT.test(p))){
   throw Error('Objeto con gramática inválida: '+item.slice(0,80))
  }
  if(seen.has(item))throw Error('Objeto duplicado: '+item)
  seen.add(item)
  return {kind,params:parts,label:item}
 })
}

// Reutiliza verifyLedger: toda otra migración sin registrar, checksum alterado,
// fila incompleta o revertida bloquea. La migración objetivo es la única tolerada.
export function assertRecoverable(name,files,history){
 if(typeof name!=='string'||!NAME.test(name))throw Error('Nombre de migración inválido')
 if(!(files instanceof Map)||!files.has(name))throw Error('Migración ausente en Git: '+name)
 if(!Array.isArray(history))throw Error('Historial no válido')
 if(history.some(row=>row?.migration_name===name)){
  throw Error('La migración ya tiene filas en el historial; requiere revisión manual: '+name)
 }
 const result=verifyLedger(files,history,new Set([name]))
 if(result.pending.length!==1||result.pending[0]!==name){
  throw Error('Resultado de conciliación inesperado')
 }
 return name
}

export async function probeObjects(objects,query){
 const missing=[]
 for(const obj of objects){
  const rows=await query(PROBES[obj.kind].sql,...obj.params)
  if(!Array.isArray(rows)||rows.length===0)missing.push(obj.label)
 }
 if(missing.length)throw Error('Objetos esperados ausentes en producción: '+missing.join(', '))
 return objects.length
}

export function registerApplied(name,exec=execFileSync){
 if(!NAME.test(name))throw Error('Nombre de migración inválido')
 // Sin shell y sin volcar la salida: puede contener la URL de la base.
 exec('npx',['prisma','migrate','resolve','--applied',name],{stdio:'pipe',timeout:120000})
}

export function assertEvent(env){
 if(!env||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REF!=='refs/heads/main'){
  throw Error('Recuperación solo por dispatch manual en main')
 }
}

export async function main(env=process.env,deps={}){
 assertEvent(env)
 const files=(deps.readMigrations??readMigrations)('prisma/migrations')
 const name=env.MIGRATION_NAME
 const objects=parseObjects(env.EXPECTED_OBJECTS)
 const register=env.REGISTER==='true'
 let db
 let query=deps.query
 if(!query){
  const {PrismaClient}=await import('@prisma/client')
  db=new PrismaClient()
  query=(sql,...params)=>db.$queryRawUnsafe(sql,...params)
 }
 try{
  const history=await query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM public."_prisma_migrations"')
  assertRecoverable(name,files,history)
  const probed=await probeObjects(objects,query)
  console.log('Recuperación '+name+': ledger coherente y '+probed+' objetos verificados')
  if(!register){
   console.log('Modo verificación: no se registró nada (REGISTER distinto de true)')
   return false
  }
  ;(deps.registerApplied??registerApplied)(name)
  console.log('Migración registrada con prisma migrate resolve --applied; sin DDL')
  return true
 }finally{if(db)await db.$disconnect()}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(error=>{console.error('Recuperación de ledger: '+error.message);process.exitCode=1})
}
