import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {verifyProjectAccess,main} from '../verify-vercel-project-access.mjs'

const teamId='team_Ml9rVX2uWgNn2OJ8cZe9pTWD',projectId='prj_NzjF7gJ1CFYYHOhfAhE5mK7CxpPr'
const token='tok_SECRET_VALUE_123'
const reply=(status,body)=>async()=>({status,ok:status>=200&&status<300,json:async()=>{
  if(body===undefined)throw Error('x');return body}})
const run=(fetchFn,over={})=>verifyProjectAccess({token,teamId,projectId,fetchFn,...over})

test('acepta proyecto y team coincidentes y consulta el endpoint de proyecto, no el de usuario',async()=>{
  let seen
  await run(async(u,o)=>{seen={u,o};return reply(200,{id:projectId,accountId:teamId})()})
  assert.match(seen.u,/^https:\/\/api\.vercel\.com\/v9\/projects\/prj_[^?]+\?teamId=team_/)
  assert.doesNotMatch(seen.u,/\/user/)
  assert.equal(seen.o.redirect,'error')
  assert.equal(seen.o.headers.Authorization,'Bearer '+token)
})
test('401, 403 y 404 fallan con mensajes distintos y sin filtrar el token',async()=>{
  for(const [s,re] of [[401,/inválido, vencido/],[403,/sin acceso al team/],[404,/no encontrado/]]){
    await assert.rejects(run(reply(s,{error:{message:token}})),e=>{
      assert.match(e.message,re);assert.ok(!e.message.includes(token));return true})
  }
})
test('5xx, red caída y timeout fallan cerrado',async()=>{
  await assert.rejects(run(reply(500,{})),/HTTP 500/)
  await assert.rejects(run(async()=>{throw Error('ECONNRESET '+token)}),e=>{
    assert.match(e.message,/fail closed/);assert.ok(!e.message.includes(token));return true})
})
test('rechaza proyecto o team distinto aunque la API responda 200',async()=>{
  await assert.rejects(run(reply(200,{id:'prj_OtroProyecto1234567',accountId:teamId})),/proyecto distinto/)
  await assert.rejects(run(reply(200,{id:projectId,accountId:'team_OtroTeam12345678'})),/no pertenece al team/)
  await assert.rejects(run(reply(200,{id:projectId})),/no pertenece al team/)
  await assert.rejects(run(reply(200,null)),/inválida/)
  await assert.rejects(run(reply(200,undefined)),/no es JSON/)
})
test('valida entradas: token ausente/espacios e IDs malformados o con inyección',async()=>{
  const never=async()=>{throw Error('no debe llamarse')}
  for(const t of [undefined,'','  ','a b','a\nb'])await assert.rejects(run(never,{token:t}),/VERCEL_TOKEN/)
  for(const t of [undefined,'team_x','prj_'+'a'.repeat(12),teamId+'&x=1'])
    await assert.rejects(run(never,{teamId:t}),/VERCEL_ORG_ID/)
  for(const p of [undefined,'prj_x',teamId,projectId+'/../x'])
    await assert.rejects(run(never,{projectId:p}),/VERCEL_PROJECT_ID/)
})
test('main no imprime el token ni los IDs',async()=>{
  const logs=[],orig=console.log;console.log=(...a)=>logs.push(a.join(' '))
  try{
    await main({env:{VERCEL_TOKEN:token,VERCEL_ORG_ID:teamId,VERCEL_PROJECT_ID:projectId},
      fetchFn:reply(200,{id:projectId,accountId:teamId})})
  }finally{console.log=orig}
  const out=logs.join('\n')
  for(const s of [token,teamId,projectId])assert.ok(!out.includes(s))
})
