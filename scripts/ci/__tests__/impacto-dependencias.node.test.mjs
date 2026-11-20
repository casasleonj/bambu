import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { analyze, parseDiff } from '../impacto-dependencias.mjs'
const CLIENT='src/app/(app)/clientes/widget.tsx', PROVIDER='src/app/(app)/proveedores/panel.tsx'
const smoke=['auth','critical-flows','ciclo-pedido-completo','cierre','comision-repartidor-dia'].map(s=>`e2e/${s}.spec.ts`)
const hub='e2e/pedidos-hub.spec.ts'
const mod=file=>({file,from:file,status:'M',before:'100644',after:'100644'})
function fixture(t, extra={}) {
  const root=mkdtempSync(path.join(tmpdir(),'impact-'))
  t.after(()=>rmSync(root,{recursive:true,force:true}))
  const sources={ 'tsconfig.json':JSON.stringify({compilerOptions:{module:'esnext',moduleResolution:'bundler',paths:{'@/*':['./src/*']}}}), [CLIENT]:'export const Widget = 1', [PROVIDER]:'export const Panel = 2', ...Object.fromEntries(smoke.map(f=>[f,'const route = "/login"'])), [hub]:'const url="/pedidos"', 'e2e/clientes.spec.ts':'const url = "/api/clientes?x=1"', 'e2e/compras.spec.ts':'const url = "/compras"', 'e2e/unmapped.spec.ts':'const literal = 1', 'e2e/produccion/manual.spec.ts':'throw 1', ...extra }
  for(const [f,c] of Object.entries(sources)) {mkdirSync(path.dirname(path.join(root,f)),{recursive:true});writeFileSync(path.join(root,f),c)}
  const files=Object.keys(sources)
  return {root,files,hubSpecs:[hub],entries:[mod(CLIENT)]}
}
test('direct impact + cross-domain + mandatory unknown tests',t=>{
  const r=analyze(fixture(t));assert.equal(r.canSkip,false);assert.equal(r.mode,'shadow');assert.equal(r.recommendation,'full'); assert.ok(r.reasonCodes.includes('CRITICAL_BUSINESS_DEPENDENCY'));
  for(const f of [...smoke,'e2e/clientes.spec.ts','e2e/unmapped.spec.ts',hub])assert.ok(r.proposedLegacySpecs.includes(f),f)
  assert.ok(!r.hypothesisLegacySpecs.includes('e2e/compras.spec.ts'));assert.ok(!r.inventory.legacySpecs.includes('e2e/produccion/manual.spec.ts'))
  assert.ok(r.domains.includes('pedidos'));assert.deepEqual(r.inventory.hubSpecs,[hub]);assert.ok(r.hypothesisLegacySpecs.length<=r.proposedLegacySpecs.length)
})
test('transitive alias + barrel reexport + cycle reaches financial consumer and full',t=>{
 const r=analyze(fixture(t,{'src/app/(app)/clientes/barrel.ts':'export {Widget} from "./widget"; export * from "./cycle"','src/app/(app)/clientes/cycle.ts':'export * from "./barrel"','src/app/(app)/pedidos/page.tsx':'import {Widget} from "@/app/(app)/clientes/barrel"'}))
 assert.ok(r.affectedFiles.includes('src/app/(app)/pedidos/page.tsx'));assert.ok(r.reasonCodes.includes('CRITICAL_TRANSITIVE_CONSUMER'));assert.equal(r.recommendation,'full');assert.deepEqual(r.proposedLegacySpecs,r.inventory.legacySpecs)
})
test('HTTP inferred through imported fixture and literal template',t=>{
 const r=analyze(fixture(t,{'e2e/helper.ts':'export const endpoint=(id)=>`/api/negocios/${id}`','e2e/extra.spec.ts':'import {endpoint} from "./helper"; const path="/compras"'}))
 assert.ok(r.proposedLegacySpecs.includes('e2e/extra.spec.ts'))
})
test('template suffix and source-test consumers are observed',t=>{
 const r=analyze(fixture(t,{'e2e/suffix.spec.ts':'const x=`${base}/clientes?foo=1`','src/app/(app)/clientes/widget.test.ts':'import {Widget} from "./widget"','src/lib/__tests__/integration/clientes.test.ts':'import {Widget} from "@/app/(app)/clientes/widget"'}));assert.ok(r.hypothesisLegacySpecs.includes('e2e/suffix.spec.ts'));assert.ok(r.affectedSourceTests.unit.includes('src/app/(app)/clientes/widget.test.ts'));assert.ok(r.affectedSourceTests.integration.includes('src/lib/__tests__/integration/clientes.test.ts'))
})
test('unknown internal imports fail closed, while hypothesis remains visible',t=>{
 const r=analyze(fixture(t,{'src/app/(app)/clientes/broken.ts':'import x from "@/lib/missing"; export {x}'}));assert.ok(r.reasonCodes.includes('UNRESOLVED_GRAPH_EDGE'));assert.equal(r.canSkip,false);assert.equal(r.graph.unresolvedCount,1)
})
test('dynamic import or require cannot justify omission',t=>{
 const r=analyze(fixture(t,{'src/app/(app)/clientes/dynamic.ts':'export const f=(name)=>import(name); const x=require(name)'}));assert.equal(r.recommendation,'full');assert.ok(r.graph.unresolved.some(x=>x.kind==='dynamic-import'))
})
test('nonliteral dependencies and added/moved/mode-changed paths fail closed',t=>{
 const f=fixture(t);for(const e of [{...mod(CLIENT),status:'A',before:'000000'},{...mod(CLIENT),status:'R100',from:'old.ts'},{...mod(CLIENT),after:'100755'},mod('prisma/schema.prisma'),mod('src/app/(app)/clientes/layout.tsx'),mod('src/lib/auth.ts')]) {
   const r=analyze({...f,entries:[e]});assert.equal(r.recommendation,'full');assert.equal(r.canSkip,false)
 }
})
test('multiple eligible changes union domains',t=>{
 const f=fixture(t);const r=analyze({...f,entries:[mod(CLIENT),mod(PROVIDER)]});assert.ok(r.domains.includes('compras'));assert.ok(r.domains.includes('pedidos'));assert.ok(r.proposedLegacySpecs.includes('e2e/compras.spec.ts'))
})
test('inventory drift or empty diff means full',t=>{
 const f=fixture(t);assert.ok(analyze({...f,hubSpecs:[]}).reasonCodes.includes('HUB_INVENTORY_INCOMPLETE'));assert.ok(analyze({...f,files:f.files.filter(x=>x!==smoke[0])}).reasonCodes.includes('SPEC_INVENTORY_INCOMPLETE'));assert.ok(analyze({...f,entries:[]}).reasonCodes.includes('EMPTY_DIFF'))
})
test('raw parsing: modifications, rename, spaces and malformed input',()=>{
 const m=':100644 100644 a b M\0';assert.deepEqual(parseDiff(m+'src/a con espacio.ts\0'),[mod('src/a con espacio.ts')]);assert.equal(parseDiff(':100644 100644 a b R100\0old\0new\0')[0].from,'old');for(const raw of ['',m,m+'x',m+'x\0garbage\0',m+'x\n.ts\0',':100644 100644 a b R100\0old\0']) assert.throws(()=>parseDiff(raw))
})
test('actual git diff CLI report binds exact base/head and fails closed on invalid base',t=>{
 const f=fixture(t);const git=(...args)=>execFileSync('git',args,{cwd:f.root,encoding:'utf8'}).trim();git('init','-q');git('config','user.email','test@example.invalid');git('config','user.name','test');mkdirSync(path.join(f.root,'.github/workflows'),{recursive:true});writeFileSync(path.join(f.root,'.github/workflows/ci.yml'),`      - name: Run Playwright tests (suite del Hub, V2 ON)\n        run: >\n          ${hub}\n      - name: End\n`);git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');writeFileSync(path.join(f.root,CLIENT),'export const Widget=2');git('add','.');git('commit','-qm','change');const head=git('rev-parse','HEAD');const output=path.join(f.root,'impact.json');const cli=fileURLToPath(new URL('../impacto-dependencias.mjs',import.meta.url));const run=b=>spawnSync(process.execPath,[cli,b,output],{cwd:f.root,encoding:'utf8'});const resp=run(base);assert.equal(resp.status,0,resp.stderr);let r=JSON.parse(readFileSync(output));assert.equal(r.base,base);assert.equal(r.head,head);assert.equal(r.canSkip,false);assert.deepEqual(r.changed,[CLIENT]);assert.equal(run('wrong').status,1);r=JSON.parse(readFileSync(output));assert.equal(r.recommendation,'full');assert.ok(r.reasonCodes.includes('ANALYSIS_FAILED'))
})
