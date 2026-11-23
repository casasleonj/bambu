// #703 R0 · Conciliación Prisma read-only ANTES de migrate deploy.
import {readdirSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {countNewMigrationFiles} from './release-migration-policy.mjs'

const SHA=/^(?!0{40}$)[a-f0-9]{40}$/
const NAME=/^[A-Za-z0-9_.-]+$/

export function readMigrations(root){
 const files=new Map()
 for(const item of readdirSync(root,{withFileTypes:true})){
  if(item.name==='migration_lock.toml'&&item.isFile())continue
  if(!item.isDirectory()||!NAME.test(item.name))throw Error('Archivo inesperado en migraciones')
  const contents=readdirSync(join(root,item.name))
  if(contents.length!==1||contents[0]!=='migration.sql')throw Error('Migración sin SQL único: '+item.name)
  const sql=readFileSync(join(root,item.name,'migration.sql'))
  files.set(item.name,createHash('sha256').update(sql).digest('hex'))
 }
 if(!files.size)throw Error('No se encontraron migraciones en Git')
 return files
}

export function diffAddedMigrations(raw){
 countNewMigrationFiles(raw) // Rechaza borrar o alterar archivos históricos.
 if(!raw.length)return new Set()
 const entries=new TextDecoder('utf-8',{fatal:true}).decode(raw).slice(0,-1).split('\0')
 return new Set(entries.filter((_,i)=>i%2===1).map(x=>x.split('/')[2]))
}

export function verifyLedger(files,history,allowedPending=new Set()){
 if(!(files instanceof Map)||!(allowedPending instanceof Set)||!Array.isArray(history)||!files.size){
  throw Error('Entradas de conciliación no válidas')
 }
 const completed=new Set(),rolled=new Set()
 for(const row of history){
  const name=row?.migration_name
  if(typeof name!=='string'||!NAME.test(name))throw Error('Nombre de migración inválido')
  if(row.finished_at && row.rolled_back_at)throw Error('Estado contradictorio: '+name)
  if(!row.finished_at&&!row.rolled_back_at)throw Error('Ejecución incompleta: '+name)
  if(row.rolled_back_at){rolled.add(name);continue}
  if(completed.has(name))throw Error('Migración completada duplicada: '+name)
  if(!files.has(name))throw Error('Migración en DB ausente en Git: '+name)
  if(typeof row.checksum!=='string'||row.checksum!==files.get(name)){
   throw Error('Checksum modificado: '+name)
  }
  completed.add(name)
 }
 for(const name of rolled){
  if(!completed.has(name))throw Error('Rollback sin posterior éxito: '+name)
 }
 const pending=[]
 for(const name of files.keys()){
  if(completed.has(name))continue
  if(!allowedPending.has(name))throw Error('Migración histórica no registrada: '+name)
  pending.push(name)
 }
 for(const name of allowedPending){
  if(!files.has(name))throw Error('Migración nueva fuera de Git: '+name)
 }
 return {completed:completed.size,pending}
}

export function addedInPush(before,after,exec=execFileSync){
 if(!SHA.test(before||'')||!SHA.test(after||''))throw Error('SHA de push inválido')
 return diffAddedMigrations(exec('git',[
  'diff','--name-status','--no-renames','-z',before,after,'--','prisma/migrations/'
 ],{encoding:'buffer',maxBuffer:1048576,timeout:15000}))
}

export async function main(env=process.env){
 if(env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_REF!=='refs/heads/main'){
  throw Error('Preflight exclusivo de push main; dispatch no certificado')
 }
 const allowed=addedInPush(env.GITHUB_EVENT_BEFORE,env.GITHUB_SHA)
 const files=readMigrations('prisma/migrations')
 const {PrismaClient}=await import('@prisma/client')
 const db=new PrismaClient()
 try{
  // Query CONSTANTE de solo lectura. Jamás interpolar datos en este SQL.
  const sql='SELECT migration_name,checksum,finished_at,rolled_back_at FROM public."_prisma_migrations"'
  const rows=await db.$queryRawUnsafe(sql)
  const result=verifyLedger(files,rows,allowed)
  console.log('Prisma ledger validado: '+result.completed+' aplicadas, '+
   result.pending.length+' nuevas pendientes')
 }finally{await db.$disconnect()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(error=>{console.error('Prisma preflight: '+error.message);process.exitCode=1})
}
