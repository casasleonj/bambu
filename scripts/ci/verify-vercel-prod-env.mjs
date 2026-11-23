// #703 R0 · Preflight de destino de producción: solo lectura, sin SQL.
import {readFileSync,appendFileSync} from 'node:fs'
import {parseEnv} from 'node:util'
import {randomBytes} from 'node:crypto'
import {pathToFileURL} from 'node:url'

export const EXPECTED_SUPABASE_REF='wdttkrlbpcawulaaiapj'
export const DATABASE_KEYS=['DATABASE_URL','DIRECT_URL']

function fail(key,message){
  // Evita filtrar URLs, contraseñas y mensajes crudos del parser a GitHub logs.
  throw new Error(key+': '+message)
}

export function validateDbUrl(value,key,ref=EXPECTED_SUPABASE_REF){
  if(!DATABASE_KEYS.includes(key))throw Error('Variable DB no autorizada')
  if(typeof value!=='string' || !value.length || value.length>10000 ||
     /[\r\n\0]/.test(value))fail(key,'valor ausente o con caracteres inválidos')
  if(!/^[a-z0-9]{20}$/.test(ref))throw Error('Referencia Supabase inválida')
  let parsed
  try{parsed=new URL(value)}catch{fail(key,'URL PostgreSQL inválida')}
  if(!['postgresql:','postgres:'].includes(parsed.protocol))fail(key,'protocolo no PostgreSQL')
  if(!parsed.password)fail(key,'credencial de DB ausente')
  const h=parsed.hostname.toLowerCase()
  const pooler=h.endsWith('.pooler.supabase.com')
  const direct=h==='db.'+ref+'.supabase.co'
  if(!pooler&&!direct)fail(key,'destino fuera del proyecto autorizado')
  let user
  try{user=decodeURIComponent(parsed.username)}catch{fail(key,'usuario DB inválido')}
  if(pooler && user!=='postgres.'+ref)fail(key,'proyecto Supabase diferente')
  if(direct && user!=='postgres')fail(key,'usuario directo inesperado')
  if(parsed.pathname!=='/postgres')fail(key,'base de datos no esperada')
  if(parsed.hash)fail(key,'fragmento URL no permitido')
  return {key,kind:pooler?'pooler':'direct'}
}

export function validateEnv(content,ref=EXPECTED_SUPABASE_REF){
  if(typeof content!=='string'||!content.trim())throw Error('Archivo de Vercel vacío')
  let vars
  try{vars=parseEnv(content)}catch{throw Error('Formato .env inválido')}
  for(const key of DATABASE_KEYS)validateDbUrl(vars[key],key,ref)
  return {DATABASE_URL:vars.DATABASE_URL,DIRECT_URL:vars.DIRECT_URL}
}

export function exportEnv(vars,output,write=appendFileSync,random=()=>randomBytes(24).toString('hex')){
  if(!output)throw Error('GITHUB_ENV no disponible')
  // Validar TODO antes de escribir, incluso si lo recibió de otro módulo.
  for(const key of DATABASE_KEYS)validateDbUrl(vars?.[key],key)
  const text=DATABASE_KEYS.map(key=>{
    const marker='GH_ENV_'+random()
    if(!/^GH_ENV_[A-Za-z0-9]+$/.test(marker)||vars[key].includes(marker)){
      throw Error('Delimitador GITHUB_ENV inválido')
    }
    return key+'<<'+marker+'\n'+vars[key]+'\n'+marker+'\n'
  }).join('')
  write(output,text,{encoding:'utf8',flag:'a',mode:0o600})
}

export function main({file=process.argv[2],env=process.env}={}){
  if(!file)throw Error('Falta archivo .env de Vercel')
  const vars=validateEnv(readFileSync(file,'utf8'))
  exportEnv(vars,env.GITHUB_ENV)
  console.log('Destino Supabase de producción validado, credenciales exportadas sin mostrarlas')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{main()}catch(e){console.error('Preflight Vercel: '+e.message);process.exitCode=1}
}
