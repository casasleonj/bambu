// #896. Shadow only: no CI gate or test execution consumes this report.
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const ts = createRequire(import.meta.url)('typescript')

const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/i
const SPEC = /\.(?:spec|test)\.(?:[cm]?[jt]s|[jt]sx)$/i
const CRITICAL = new Set(['auth','admin','pedidos','cartera','cierre','nomina','embarques','repartidor','facturas','pagos','produccion','inventario','offline','dashboard','deudas','productos','configuracion','reportes','trabajadores','compras','gastos','territorio','recurrentes','casos','sugerencias','insumos'])
const ALIASES = { clientes:'clientes', negocios:'clientes', proveedores:'proveedores', pedidos:'pedidos', abonos:'cartera', cartera:'cartera', cierre:'cierre', 'cierre-dia':'cierre', facturas:'facturas', 'resumen-facturas':'facturas', pagos:'pagos', 'pagos-confirmar':'pagos', nomina:'nomina', embarques:'embarques', repartidor:'repartidor', produccion:'produccion', productos:'productos', 'stock-estimado':'inventario', insumos:'insumos', admin:'admin', auth:'auth', usuarios:'auth', users:'auth', 'cambiar-contrasena':'auth', 'mi-perfil':'auth', deudas:'deudas', trabajadores:'trabajadores', dashboard:'dashboard', gastos:'gastos', compras:'compras', configuracion:'configuracion', config:'configuracion', precios:'configuracion', reportes:'reportes', barrios:'territorio', rutas:'territorio', zonas:'territorio', geo:'territorio', recurrentes:'recurrentes', casos:'casos', sugerencias:'sugerencias', 'sugerencias-llamadas':'sugerencias' }
const RELATIONS = { clientes:['pedidos','cartera','facturas','territorio','recurrentes','sugerencias'], proveedores:['compras','gastos','insumos'] }
const SMOKE = ['e2e/auth.spec.ts','e2e/critical-flows.spec.ts','e2e/ciclo-pedido-completo.spec.ts','e2e/cierre.spec.ts','e2e/comision-repartidor-dia.spec.ts']
const IGNORED = new Set(['exploratory','qa-comprehensive','produccion'])
const sorted = xs => [...new Set(xs)].sort()
const routeDomain = name => Object.hasOwn(ALIASES, name) ? ALIASES[name] : null
function sourceDomain(file) {
  const m = /^src\/app\/(?:\(app\)|api)\/([^/]+)\//.exec(file)
  return m ? routeDomain(m[1]) : null
}
function endpointDomain(value) {
  const m = /^(?:https?:\/\/[^/]+)?\/(?:api\/)?([a-z][a-z0-9-]*)(?=\/|\?|#|$)/i.exec(value)
  return m ? routeDomain(m[1]) : null
}
function ignored(file) { return file.startsWith('e2e/') && file.split('/').slice(1,-1).some(x=>IGNORED.has(x)) }
function isE2E(file) { return file.startsWith('e2e/') && SPEC.test(file) && !ignored(file) }
function git(root,args) { return execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']}) }
export function parseDiff(raw) {
  if (!raw || !raw.endsWith('\0')) throw Error('diff vacío o truncado')
  const parts=raw.slice(0,-1).split('\0'), entries=[]
  for(let i=0;i<parts.length;) {
    const m=/^:(\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ ([A-Z][0-9]*)$/.exec(parts[i++])
    if(!m || i>=parts.length || !parts[i]) throw Error('cabecera/ruta ilegible')
    const from=parts[i++]; let file=from
    if (/^[RC]/.test(m[3])) { if(i>=parts.length || !parts[i]) throw Error('destino ilegible'); file=parts[i++] }
    if (/[\x00-\x1f\x7f\ufffd]/.test(from+file)) throw Error('ruta no representable')
    entries.push({file,from,status:m[3],before:m[1],after:m[2]})
  }
  return entries
}
function inspect(file, text) {
  const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true)
  const imports=new Set(), domains=new Set(); let dynamic=false
  const literal=n=>n && (ts.isStringLiteralLike(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null
  function add(n) { const value=literal(n); if(value===null) dynamic=true; else imports.add(value) }
  function visit(n) {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) { if(n.moduleSpecifier) add(n.moduleSpecifier) }
    else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) add(n.moduleReference.expression)
    else if (ts.isCallExpression(n) && (n.expression.kind===ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression)&&n.expression.text==='require'))) add(n.arguments[0])
    else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) add(n.argument.literal)
    if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) { const domain=endpointDomain(n.text); if(domain) domains.add(domain) }
    ts.forEachChild(n,visit)
  }
  visit(ast)
  return {imports:[...imports],domains:[...domains],dynamic,parseError:ast.parseDiagnostics.length>0}
}
export function analyze({root, files, entries, hubSpecs=[]}) {
  const reasons=new Set(), affectedDomains=new Set(), unresolved=[], graph=new Map(), reverse=new Map(), info=new Map()
  const inventory=sorted(files.filter(isE2E)), tracked=new Set(files)
  const addEdge=(from,to)=>{ graph.get(from).add(to); if(!reverse.has(to)) reverse.set(to,new Set()); reverse.get(to).add(from) }
  const configFile=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile)
  if(configFile.error) throw Error('tsconfig ilegible')
  const parsed=ts.parseJsonConfigFileContent(configFile.config,ts.sys,root)
  if(parsed.errors.some(e=>e.code!==18003)) throw Error('tsconfig inválido')
  const cache=ts.createModuleResolutionCache(root,x=>x,parsed.options)
  const relative=absolute=>path.relative(root,absolute).split(path.sep).join('/')
  for(const file of files.filter(f=>/^(src|e2e)\//.test(f)&&SOURCE.test(f)&&!ignored(f))) {
    if(!lstatSync(path.join(root,file)).isFile()) { reasons.add('NON_REGULAR_SOURCE'); continue }
    const data=inspect(file,readFileSync(path.join(root,file),'utf8')); info.set(file,data); graph.set(file,new Set())
    if(data.parseError) reasons.add('ST_SYNTAX')
    if(data.dynamic) unresolved.push({file,kind:'dynamic-import'})
  }
  for(const [file,data] of info) for(const spec of data.imports) {
    const internal=spec.startsWith('.')||spec.startsWith('@/')||spec.startsWith('/')||spec.startsWith('#')
    const resolved=ts.resolveModuleName(spec,path.join(root,file),parsed.options,ts.sys,cache).resolvedModule
    const target=resolved?relative(resolved.resolvedFileName):null
    if(target&&tracked.has(target)) {addEdge(file,target);if(!info.has(target)) unresolved.push({file,kind:'unscanned-target',target})}
    else if(internal) unresolved.push({file,kind:'unresolved-local'})
  }
  const roots=sorted(entries.map(e=>e.file)), affected=new Set(roots), queue=[...roots]
  if(!entries.length) reasons.add('EMPTY_DIFF')
  for(const e of entries) {
    if(e.status!=='M'||e.before!=='100644'||e.after!=='100644'||e.from!==e.file) reasons.add('STRUCTURAL_CHANGE')
    if(!/^src\/app\/\(app\)\/(clientes|proveedores)\//.test(e.file)||!info.has(e.file)||SPEC.test(e.file)||/\/(?:layout|loading|error|not-found|template|default)\.[^/]+$/.test(e.file)) reasons.add('OUTSIDE_INITIAL_SCOPE')
  }
  for(let i=0;i<queue.length;i++) for(const consumer of reverse.get(queue[i])??[]) if(!affected.has(consumer)){affected.add(consumer);queue.push(consumer)}
  for(const file of affected) {
    const domain=sourceDomain(file)
    if(domain) affectedDomains.add(domain)
    else if(file.startsWith('src/')&&!SPEC.test(file)) reasons.add('SHARED_OR_UNKNOWN_CONSUMER')
  }
  if(!affectedDomains.size) reasons.add('NO_MAPPED_DOMAIN')
  if([...affectedDomains].some(d=>CRITICAL.has(d))) reasons.add('CRITICAL_TRANSITIVE_CONSUMER')
  // Include direct business relations, without claiming these are exhaustive.
  const expanded=new Set(affectedDomains)
  for(const d of affectedDomains) for(const dependent of RELATIONS[d]??[]) expanded.add(dependent)
  const hypotheses=[], unclassified=[]
  for(const file of inventory) {
    const domains=new Set(info.get(file)?.domains??[])
    // A shared helper may navigate or write via HTTP. Include its known targets.
    const seen=new Set([file]), stack=[file]
    for(let i=0;i<stack.length;i++) for(const dep of graph.get(stack[i])??[]) if(!seen.has(dep)){seen.add(dep);stack.push(dep);for(const d of info.get(dep)?.domains??[]) domains.add(d)}
    if(!domains.size) unclassified.push(file)
    if(!domains.size||affected.has(file)||[...domains].some(d=>expanded.has(d))||SMOKE.includes(file)) hypotheses.push(file)
  }
  if(!inventory.length||SMOKE.some(f=>!inventory.includes(f))) reasons.add('SPEC_INVENTORY_INCOMPLETE')
  if(!hubSpecs.length||hubSpecs.some(f=>!inventory.includes(f))) reasons.add('HUB_INVENTORY_INCOMPLETE')
  if(unresolved.length) reasons.add('UNRESOLVED_GRAPH_EDGE')
  if(!hypotheses.length) reasons.add('EMPTY_SELECTION')
  const sourceTests=sorted([...affected].filter(f=>f.startsWith('src/')&&SPEC.test(f)))
  // Runtime DB / HTTP / framework / flags cannot be proven by an import graph.
  // Report hypotheses separately; they are NEVER authority to omit tests.
  const full=reasons.size>0
  return {schema:1,mode:'shadow',canSkip:false,recommendation:full?'full':'candidate-only',reasonCodes:sorted(reasons),changed:roots,affectedFiles:sorted(affected),domains:sorted(expanded),inventory:{legacySpecs:inventory,hubSpecs:sorted(hubSpecs),projects:['chromium','chromium-mobile'],kind:'static-file-inventory-not-test-discovery'},proposedLegacySpecs:full?inventory:sorted(hypotheses),hypothesisLegacySpecs:sorted(hypotheses),affectedSourceTests:{unit:sourceTests.filter(f=>!f.includes('/__tests__/integration/')),integration:sourceTests.filter(f=>f.includes('/__tests__/integration/')),kind:'static-import-consumers-only'},unclassifiedSpecs:sorted(unclassified),graph:{files:info.size,edges:[...graph.values()].reduce((n,v)=>n+v.size,0),unresolvedCount:unresolved.length,unresolved:unresolved.slice(0,100)},limitations:['No test IDs/results or coverage guarantee','Runtime HTTP/DB, generated routes, dynamic consumers and flags require explicit evidence','Full Hub, unit, integration and quality remain unchanged']}
}
export function run(root,base,output) {
  const head=git(root,['rev-parse','HEAD']).trim()
  let report
  try {
    if(!/^[0-9a-f]{40}$/.test(base??'')) throw Error('base SHA inválido')
    git(root,['merge-base','--is-ancestor',base,head])
    const entries=parseDiff(git(root,['diff','--raw','-z','--no-renames','--no-ext-diff','--no-textconv',base,head,'--']))
    const files=git(root,['ls-files','-z']).split('\0').filter(Boolean)
    const workflow=readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8')
    const section=workflow.match(/name: Run Playwright tests \(suite del Hub, V2 ON\)([\s\S]*?)(?=\n      - name:|$)/)?.[1]??''
    const hubSpecs=[...section.matchAll(/^\s+(e2e\/[^\s]+\.spec\.ts)\s*$/gm)].map(m=>m[1])
    report=analyze({root,files,entries,hubSpecs})
  } catch(e) { report={schema:1,mode:'shadow',canSkip:false,recommendation:'full',reasonCodes:['ANALYSIS_FAILED'],error:String(e.message).slice(0,400)} }
  report.base=base;report.head=head
  writeFileSync(output,JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify({mode:report.mode,head,base,recommendation:report.recommendation,reasons:report.reasonCodes,domains:report.domains,inventory:report.inventory?.legacySpecs.length,proposed:report.proposedLegacySpecs?.length,hypothesis:report.hypothesisLegacySpecs?.length}))
  if(report.reasonCodes.includes('ANALYSIS_FAILED')) process.exitCode=1
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) run(process.cwd(),process.argv[2],process.argv[3])
