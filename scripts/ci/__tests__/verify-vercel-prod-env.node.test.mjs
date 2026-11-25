import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {validateEnv,validateDbUrl,exportEnv,EXPECTED_SUPABASE_REF} from '../verify-vercel-prod-env.mjs'

const ref=EXPECTED_SUPABASE_REF,host='aws-0-us-east-1.pooler.supabase.com'
const url=(opts={})=>'postgresql://postgres.'+(opts.ref||ref)+
  ':pass%23word%40plus%26equals%3D@'+(opts.host||host)+'/postgres'+(opts.suffix||'?sslmode=require')
const doc=(a=url(),b=url())=>'DATABASE_URL="'+a+'"\nDIRECT_URL="'+b+'"\n'

test('preserva símbolos codificados, # y = de valores dotenv entre comillas',()=>{
 const x=validateEnv(doc())
 assert.equal(x.DATABASE_URL,url());assert.equal(x.DIRECT_URL,url())
})
test('rechaza pooler de otro proyecto aunque sea Supabase',()=>{
 assert.throws(()=>validateEnv(doc(url({ref:'aaaaaaaaaaaaaaaaaaaa'}))),/proyecto Supabase diferente/)
})
test('rechaza DNS engañoso, dominio externo y contraseñas vacías',()=>{
 for(const x of [url({host:host+'.evil.example'}),url({host:'evil.example'}),
  'postgresql://postgres.'+ref+'@'+host+'/postgres'])assert.throws(()=>validateEnv(doc(x)))
})
test('rechaza protocolo ajeno, fragmento, DB incorrecta y URL malformada',()=>{
 for(const x of [url().replace('postgresql:','https:'),url({suffix:'#fragment'}),
   url().replace('/postgres','/db2'),'not-a-url'])assert.throws(()=>validateEnv(doc(x)))
})
test('acepta conexión directa del proyecto autorizado',()=>{
 const x='postgresql://postgres:pass%23safe@db.'+ref+'.supabase.co/postgres'
 assert.equal(validateDbUrl(x,'DIRECT_URL').kind,'direct')
})
test('falla si falta una variable o el archivo de Vercel está vacío',()=>{
 assert.throws(()=>validateEnv('DATABASE_URL="'+url()+'"'),/DIRECT_URL/)
 assert.throws(()=>validateEnv(''),/vacío/)
})
test('exporta ambas URLs en una sola escritura con delimitadores de GitHub',()=>{
 let writes=[]
 exportEnv(validateEnv(doc()),'/tmp/synthetic',(file,content)=>writes.push({file,content}),()=>'SYNTHETIC')
 assert.equal(writes.length,1)
 assert.equal(writes[0].file,'/tmp/synthetic')
 assert.ok(writes[0].content.includes('DATABASE_URL<<GH_ENV_SYNTHETIC'))
 assert.ok(writes[0].content.includes('DIRECT_URL<<GH_ENV_SYNTHETIC'))
 assert.equal((writes[0].content.match(/GH_ENV_SYNTHETIC/g)||[]).length,4)
})
test('si segunda URL es maliciosa, no exporta nada parcial',()=>{
 let writes=0
 assert.throws(()=>exportEnv({DATABASE_URL:url(),DIRECT_URL:'https://evil.example'},
   '/tmp/synthetic',()=>{writes++}),/DIRECT_URL/)
 assert.equal(writes,0)
})
test('ningún mensaje de error contiene la contraseña',()=>{
 const secret='SUPER_SECRET_NEVER_LOG_456'
 try{validateEnv(doc('postgresql://postgres.'+ref+':'+secret+'@evil.example/postgres'))}
 catch(e){assert.ok(!e.message.includes(secret));return}
 assert.fail('Debe rechazar URL fuera del proyecto')
})
