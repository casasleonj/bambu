// #1015 · Verifica que VERCEL_TOKEN accede al proyecto y team EXACTOS.
// Reemplaza `vercel whoami`: ese endpoint (usuario) devuelve "User not found"
// para tokens con alcance de team aunque sí accedan al proyecto. Solo lectura.
// Nunca imprime el token, cuerpos de respuesta ni identificadores de cuenta.
import {pathToFileURL} from 'node:url'

export const API_ORIGIN='https://api.vercel.com'
const TEAM_RE=/^team_[A-Za-z0-9]{10,64}$/
const PROJECT_RE=/^prj_[A-Za-z0-9]{10,64}$/

export async function verifyProjectAccess({token,teamId,projectId,fetchFn=fetch,timeoutMs=15000}){
  if(typeof token!=='string'||!token.trim()||/[\s\r\n\0]/.test(token)){
    throw Error('Falta VERCEL_TOKEN en GitHub Secrets o tiene formato inválido')
  }
  if(!TEAM_RE.test(teamId??''))throw Error('VERCEL_ORG_ID inválido')
  if(!PROJECT_RE.test(projectId??''))throw Error('VERCEL_PROJECT_ID inválido')
  const url=API_ORIGIN+'/v9/projects/'+encodeURIComponent(projectId)+
    '?teamId='+encodeURIComponent(teamId)
  let res
  try{
    res=await fetchFn(url,{
      method:'GET',redirect:'error',signal:AbortSignal.timeout(timeoutMs),
      headers:{Authorization:'Bearer '+token,Accept:'application/json'},
    })
  }catch{
    throw Error('No se pudo contactar la API de Vercel (red o timeout); fail closed')
  }
  if(res.status===401)throw Error('VERCEL_TOKEN inválido, vencido o revocado (HTTP 401)')
  if(res.status===403)throw Error('VERCEL_TOKEN sin acceso al team VERCEL_ORG_ID (HTTP 403)')
  if(res.status===404)throw Error('Proyecto no encontrado en el team indicado (HTTP 404)')
  if(!res.ok)throw Error('Respuesta inesperada de la API de Vercel (HTTP '+res.status+')')
  let body
  try{body=await res.json()}catch{throw Error('Respuesta de Vercel no es JSON válido')}
  if(!body||typeof body!=='object')throw Error('Respuesta de Vercel inválida')
  if(body.id!==projectId)throw Error('La API devolvió un proyecto distinto al esperado')
  if(body.accountId!==teamId)throw Error('El proyecto no pertenece al team esperado')
  return {projectId,teamId}
}

export async function main({env=process.env,fetchFn=fetch}={}){
  await verifyProjectAccess({
    token:env.VERCEL_TOKEN,teamId:env.VERCEL_ORG_ID,projectId:env.VERCEL_PROJECT_ID,fetchFn,
  })
  console.log('Acceso de VERCEL_TOKEN verificado para el proyecto y team esperados')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(e=>{console.error('::error::Preflight Vercel: '+e.message);process.exitCode=1})
}
