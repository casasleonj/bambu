// #703 R0 · Conciliación Prisma read-only ANTES de migrate deploy.
import {readdirSync,readFileSync,appendFileSync} from 'node:fs'
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
 const completed=new Set(),rolled=new Map(),successfulTimes=new Map()
 const timestamp=(value,name)=>{
  const ms=value instanceof Date?value.getTime():Date.parse(value)
  if(!Number.isFinite(ms))throw Error('Fecha inválida en historial: '+name)
  return ms
 }
 for(const row of history){
  const name=row?.migration_name
  if(typeof name!=='string'||!NAME.test(name))throw Error('Nombre de migración inválido')
  if(row.finished_at && row.rolled_back_at)throw Error('Estado contradictorio: '+name)
  if(!row.finished_at&&!row.rolled_back_at)throw Error('Ejecución incompleta: '+name)
  if(row.rolled_back_at){
   const at=timestamp(row.rolled_back_at,name)
   rolled.set(name,Math.max(rolled.get(name)??-Infinity,at))
   continue
  }
  if(completed.has(name))throw Error('Migración completada duplicada: '+name)
  if(!files.has(name))throw Error('Migración en DB ausente en Git: '+name)
  if(typeof row.checksum!=='string'||row.checksum!==files.get(name)){
   throw Error('Checksum modificado: '+name)
  }
  completed.add(name)
  successfulTimes.set(name,timestamp(row.finished_at,name))
 }
 for(const [name,lastRollback] of rolled){
  // Una aplicación anterior NO subsana un rollback posterior.
  if(!completed.has(name)||successfulTimes.get(name)<=lastRollback){
   throw Error('Rollback sin posterior éxito: '+name)
  }
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
 // Un push forzado o un rango inexistente no debe autorizar DDL.
 exec('git',['merge-base','--is-ancestor',before,after],{stdio:'ignore',timeout:15000})
 const added=diffAddedMigrations(exec('git',[
  'diff','--name-status','--no-renames','-z',before,after,'--','prisma/migrations/'
 ],{encoding:'buffer',maxBuffer:1048576,timeout:15000}))
 const schema=exec('git',['diff','--name-only','-z',before,after,'--','prisma/schema.prisma'],
  {encoding:'buffer',maxBuffer:1048576,timeout:15000})
 if(schema.length>0 && added.size===0)throw Error('schema.prisma cambió sin migración nueva')
 return added
}

// En un dispatch manual se valida la base, pero NUNCA se autoriza DDL.
export function allowedPendingForEvent(env,fromPush=addedInPush){
 if(!env||!['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)||
   env.GITHUB_REF!=='refs/heads/main'){
  throw Error('Preflight solo para main y eventos autorizados')
 }
 return env.GITHUB_EVENT_NAME==='workflow_dispatch'
  ? new Set() : fromPush(env.GITHUB_EVENT_BEFORE,env.GITHUB_SHA)
}

// Señal positiva explícita: sin salida, DDL nunca puede ser habilitado.
// Solo se escribe después de verificar TODAS las migraciones y checksums.
export function writeApplyDecision(pending,output,write=appendFileSync){
 if(!Array.isArray(pending)||pending.some(name=>typeof name!=='string')){
  throw Error('Resultado de preflight inválido')
 }
 if(typeof output!=='string'||!output)throw Error('GITHUB_OUTPUT ausente')
 const enabled=pending.length>0
 write(output,'apply_pending='+(enabled?'true':'false')+'\n',
  {encoding:'utf8',flag:'a',mode:0o600})
 return enabled
}

export function pendingForPhase(env,postflight=false,fromPush=addedInPush){
 if(!env||!['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)||
   env.GITHUB_REF!=='refs/heads/main')throw Error('Verificación solo para main y eventos autorizados')
 return postflight?new Set():allowedPendingForEvent(env,fromPush)
}

export async function main(env=process.env,{postflight=false}={}){
 const allowed=pendingForPhase(env,postflight)
 const files=readMigrations('prisma/migrations')
 const {PrismaClient}=await import('@prisma/client')
 const db=new PrismaClient()
 try{
  // Query CONSTANTE de solo lectura. Jamás interpolar datos en este SQL.
  const sql='SELECT migration_name,checksum,finished_at,rolled_back_at FROM public."_prisma_migrations"'
  const rows=await db.$queryRawUnsafe(sql)
  const result=verifyLedger(files,rows,allowed)
  if(!postflight)writeApplyDecision(result.pending,env.GITHUB_OUTPUT)
  console.log('Prisma ledger validado: '+result.completed+' aplicadas, '+
   result.pending.length+' nuevas pendientes; modo '+(postflight?'postflight':env.GITHUB_EVENT_NAME))
 }finally{await db.$disconnect()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main(process.env,{postflight:process.argv[2]==='--postflight'}).catch(error=>{console.error('Prisma preflight: '+error.message);process.exitCode=1})
}
