// @tests #778 — Pruebas del clasificador del gate de CI, sin dependencias.
//
// Corre con `node --test` en el job `detect-changes`, que decide si se ejecutan
// los 8 shards. No puede usar vitest: instalar node_modules para decidir si se
// corre el E2E costaría más que el propio E2E. La misma batería existe en
// `scripts/__tests__/clasificar-cambios.test.ts` para la suite normal.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clasificar,
  parsearRawDiff,
  escribirSalida,
  imprimir,
  paraLog,
  esRutaDeDocs,
  esRutaDeSkill,
  esRutaEjecutable,
  MODO_SYMLINK,
} from '../clasificar-cambios.mjs'

const f = (ruta, estado = 'M', extra = {}) => ({
  estado,
  modoAnterior: '100644',
  modoNuevo: '100644',
  ruta,
  ...extra,
})
const ren = (desde, hasta) => ({
  estado: 'R100',
  modoAnterior: '100644',
  modoNuevo: '100644',
  rutaAnterior: desde,
  ruta: hasta,
})

// ── Se omite el E2E del ERP ────────────────────────────────────────────────
test('un SKILL.md único es declarativo', () => {
  const r = clasificar([f('.agents/skills/hallazgo/SKILL.md')])
  assert.equal(r.e2e_required, false)
  assert.equal(r.skill_declarativa, true)
})

test('una referencia Markdown de una skill es declarativa', () => {
  assert.equal(clasificar([f('.agents/skills/jl/references/api.md')]).e2e_required, false)
})

test('ambas copias de la skill juntas son declarativas', () => {
  const r = clasificar([f('.agents/skills/jl/SKILL.md'), f('.claude/skills/jl/SKILL.md')])
  assert.equal(r.e2e_required, false)
  assert.equal(r.detalle.skills.length, 2)
})

test('AGENTS.md es documentación del producto', () => {
  const r = clasificar([f('AGENTS.md')])
  assert.equal(r.e2e_required, false)
  assert.equal(r.skill_declarativa, false)
})

test('docs/** es documentación del producto', () => {
  assert.equal(clasificar([f('docs/adr/ADR-X.md'), f('docs/pedidos/PLAN.md')]).e2e_required, false)
})

test('nombres con espacios y tildes no rompen la clasificación', () => {
  assert.equal(clasificar([f('docs/pedidos/revisión  de maquetas.md')]).e2e_required, false)
})

test('rename dentro de docs/ sigue siendo documentación', () => {
  assert.equal(clasificar([ren('docs/viejo.md', 'docs/nuevo.md')]).e2e_required, false)
})

// ── Corre el E2E completo ──────────────────────────────────────────────────
test('skill mezclada con src/** corre E2E (§3)', () => {
  const r = clasificar([f('.agents/skills/jl/SKILL.md'), f('src/lib/caja.ts')])
  assert.equal(r.e2e_required, true)
  assert.equal(r.skill_declarativa, false)
})

test('un .sh dentro de la skill corre E2E (§2)', () => {
  const r = clasificar([f('.agents/skills/jl/scripts/instalar.sh')])
  assert.equal(r.e2e_required, true)
  assert.ok(r.detalle.ejecutables.includes('.agents/skills/jl/scripts/instalar.sh'))
})

test('un hook ejecutable corre E2E (§2)', () => {
  assert.equal(clasificar([f('.claude/skills/qa/hooks/pre-merge.py')]).e2e_required, true)
})

test('package.json corre E2E (§2)', () => {
  assert.equal(clasificar([f('package.json')]).e2e_required, true)
})

test('un symlink corre E2E (§4)', () => {
  const r = clasificar([{ estado: 'A', modoAnterior: '000000', modoNuevo: MODO_SYMLINK, ruta: 'docs/atajo.md' }])
  assert.equal(r.e2e_required, true)
  assert.match(r.detalle.inciertos[0], /symlink/)
})

test('un cambio de modo corre E2E (§4)', () => {
  const r = clasificar([{ estado: 'M', modoAnterior: '100644', modoNuevo: '100755', ruta: 'docs/x.md' }])
  assert.equal(r.e2e_required, true)
  assert.match(r.detalle.inciertos[0], /modo/)
})

test('rename de código a docs/ corre E2E — el agujero del allowlist viejo', () => {
  const r = clasificar([ren('src/lib/motor.ts', 'docs/motor.md')])
  assert.equal(r.e2e_required, true)
  // El origen es ejecutable, así que ni siquiera llega a la rama de rename:
  // lo clasifica como ejecutable, que es la razón más fuerte para correr E2E.
  assert.match(r.detalle.ejecutables[0], /src\/lib\/motor\.ts/)
})

test('rename de docs/ a src/** corre E2E', () => {
  assert.equal(clasificar([ren('docs/x.md', 'src/x.ts')]).e2e_required, true)
})

test('diff vacío corre E2E (§4)', () => {
  const r = clasificar([])
  assert.equal(r.e2e_required, true)
  assert.match(r.motivo, /Diff vacío/)
})

test('diff ilegible corre E2E (§4)', () => {
  assert.equal(clasificar(undefined).e2e_required, true)
  assert.equal(clasificar('basura').e2e_required, true)
})

test('un cambio en el workflow de CI corre E2E', () => {
  assert.equal(clasificar([f('.github/workflows/ci.yml')]).e2e_required, true)
})

test('un cambio en el propio clasificador corre E2E', () => {
  assert.equal(clasificar([f('scripts/ci/clasificar-cambios.mjs')]).e2e_required, true)
})

test('código de producto corre E2E', () => {
  const r = clasificar([f('prisma/schema.prisma')])
  assert.equal(r.e2e_required, true)
  assert.match(r.motivo, /declarativos/)
})

test('un .md desconocido en la raíz NO entra por extensión', () => {
  assert.equal(clasificar([f('README.md')]).e2e_required, true)
})

test('una entrada sin ruta corre E2E', () => {
  assert.equal(clasificar([{ estado: 'M', modoAnterior: '100644', modoNuevo: '100644', ruta: '' }]).e2e_required, true)
})

// Regresión encontrada contra git real: la creación reporta 000000→100644 y se
// clasificaba como «modo cambiado», forzando E2E en un PR solo de documentos.
test('un archivo NUEVO no es un cambio de modo (§4)', () => {
  const r = clasificar([{ estado: 'A', modoAnterior: '000000', modoNuevo: '100644', ruta: 'docs/nuevo.md' }])
  assert.equal(r.e2e_required, false)
  assert.equal(r.detalle.inciertos.length, 0)
})

test('un archivo nuevo dentro de una skill es declarativo', () => {
  const r = clasificar([
    { estado: 'A', modoAnterior: '000000', modoNuevo: '100644', ruta: '.agents/skills/x/references/n.md' },
  ])
  assert.equal(r.e2e_required, false)
  assert.equal(r.skill_declarativa, true)
})

test('un borrado de docs/ es declarativo', () => {
  const r = clasificar([{ estado: 'D', modoAnterior: '100644', modoNuevo: '000000', ruta: 'docs/viejo.md' }])
  assert.equal(r.e2e_required, false)
})

// ── Hallazgos de la auditoría independiente (Claude sonnet-5-5) ────────────
// El parser invertía origen y destino. Estos casos no distinguían el orden
// porque ambos extremos caían en clases distintas, y el bug pasaba inadvertido.
test('rename docs/guia.md -> docs/guia.sh corre E2E (destino ejecutable)', () => {
  const r = clasificar([ren('docs/guia.md', 'docs/guia.sh')])
  assert.equal(r.e2e_required, true)
  assert.match(r.detalle.ejecutables[0], /docs\/guia\.sh/)
})

test('rename docs/x.md -> docs/package.json corre E2E', () => {
  assert.equal(clasificar([ren('docs/x.md', 'docs/package.json')]).e2e_required, true)
})

test('rename docs/x.md -> docs/y.ts corre E2E', () => {
  assert.equal(clasificar([ren('docs/x.md', 'docs/y.ts')]).e2e_required, true)
})

test('un rename de docs/ a docs/ sigue omitiendo el E2E', () => {
  assert.equal(clasificar([ren('docs/viejo.md', 'docs/nuevo.md')]).e2e_required, false)
})

test('parsearRawDiff usa el orden real de git: origen primero', () => {
  const [e] = parsearRawDiff(':100644 100644 aaaa bbbb R100\0docs/guia.md\0docs/guia.sh\0')
  assert.equal(e.rutaAnterior, 'docs/guia.md')
  assert.equal(e.ruta, 'docs/guia.sh')
})

test('un submódulo (gitlink 160000) corre E2E', () => {
  const r = clasificar([{ estado: 'M', modoAnterior: '160000', modoNuevo: '160000', ruta: 'docs/vendor' }])
  assert.equal(r.e2e_required, true)
  assert.match(r.detalle.inciertos[0], /submódulo/)
})

test('un archivo nuevo con bit ejecutable corre E2E por su modo', () => {
  const r = clasificar([{ estado: 'A', modoAnterior: '000000', modoNuevo: '100755', ruta: 'docs/deploy' }])
  assert.equal(r.e2e_required, true)
})

test('las extensiones se comparan sin distinguir mayúsculas', () => {
  assert.equal(clasificar([f('docs/x.SH')]).e2e_required, true)
  assert.equal(clasificar([f('docs/DEPLOY.PY')]).e2e_required, true)
})

// ── Publicación del resultado en GitHub Actions ────────────────────────────
// Este comportamiento decide si los jobs E2E reciben la condición que los
// justifica. Sin prueba, el `exit 1` era una afirmación del commit.
test('escribirSalida escribe los dos outputs cuando hay GITHUB_OUTPUT', () => {
  const escritos = []
  const r = escribirSalida(
    { e2e_required: true, skill_declarativa: false },
    { env: { GITHUB_OUTPUT: '/tmp/out' }, escribir: (destino, texto) => escritos.push([destino, texto]) },
  )
  assert.equal(r.ok, true)
  assert.equal(escritos.length, 2)
  assert.match(escritos[0][1], /^e2e_required=true$/m)
  assert.match(escritos[1][1], /^skill_declarativa=false$/m)
  assert.equal(escritos[0][0], '/tmp/out')
})

test('escribirSalida falla si la escritura revienta — no omite el E2E en silencio', () => {
  const r = escribirSalida(
    { e2e_required: false, skill_declarativa: true },
    {
      env: { GITHUB_OUTPUT: '/tmp/out' },
      escribir: () => {
        throw new Error('EACCES')
      },
    },
  )
  assert.equal(r.ok, false)
  assert.match(r.motivo, /GITHUB_OUTPUT/)
})

test('escribirSalida falla dentro de Actions si falta GITHUB_OUTPUT', () => {
  const r = escribirSalida(
    { e2e_required: false, skill_declarativa: true },
    { env: { GITHUB_ACTIONS: 'true' }, escribir: () => {} },
  )
  assert.equal(r.ok, false)
  assert.match(r.motivo, /GITHUB_OUTPUT/)
})

test('escribirSalida no es un error fuera de Actions (uso local)', () => {
  const r = escribirSalida({ e2e_required: true, skill_declarativa: false }, { env: {}, escribir: () => {} })
  assert.equal(r.ok, true)
})

// ── Casos que faltaban en el job barato (el que decide) ────────────────────
// La auditoría detectó divergencia con la suite de vitest: si un predicado
// degenera, el job barato no lo ve y omitiría el E2E sin que nada lo frene.
test('esRutaDeDocs no acepta cualquier archivo terminado en AGENTS.md', () => {
  assert.equal(esRutaDeDocs('src/AGENTS.md'), false)
  assert.equal(esRutaDeDocs('AGENTS.md'), true)
})

test('esRutaDeSkill exige un nombre de skill, no el prefijo a secas', () => {
  assert.equal(esRutaDeSkill('.agents/skills/'), false)
  assert.equal(esRutaDeSkill('.agents/skills/hallazgo/SKILL.md'), true)
})

test('esRutaEjecutable reconoce lockfiles, workflows y páginas del ERP', () => {
  assert.equal(esRutaEjecutable('pnpm-lock.yaml'), true)
  assert.equal(esRutaEjecutable('.github/workflows/x.yml'), true)
  assert.equal(esRutaEjecutable('src/app/page.tsx'), true)
})

test('un rename de docs/ a docs/ con destino ejecutable corre E2E', () => {
  assert.equal(clasificar([ren('docs/x.md', 'docs/y.ts')]).e2e_required, true)
})

test('lee varias entradas seguidas mezclando declarativo y ejecutable', () => {
  const raw =
    ':100644 100644 aaaa bbbb M\0docs/a.md\0' +
    ':100644 100644 cccc dddd R100\0src/b.ts\0docs/b.md\0'
  const r = parsearRawDiff(raw)
  assert.equal(r.length, 2)
  assert.equal(r[1].rutaAnterior, 'src/b.ts')
  assert.equal(clasificar(r).e2e_required, true)
})

// ── Inyección de comandos de workflow por nombre de archivo ────────────────
// Verificado con git real: un archivo llamado `docs/a\n::error::Injected` hacía
// que el log imprimiera una línea que GitHub Actions interpreta como comando.
test('paraLog neutraliza saltos de línea que inyectarían comandos de workflow', () => {
  const ruta = 'docs/a\n::error::Injected message'
  const limpio = paraLog(ruta)
  assert.equal(limpio.includes('\n'), false)
  assert.match(limpio, /\\n/)
})

test('paraLog escapa retorno de carro, tabulador y caracteres de control', () => {
  assert.equal(paraLog('a\rb'), 'a\\rb')
  assert.equal(paraLog('a\tb'), 'a\\tb')
  assert.equal(paraLog('a\u001bb'), 'a\\x1bb')
})

test('paraLog no altera una ruta normal', () => {
  assert.equal(paraLog('docs/guia.md'), 'docs/guia.md')
})

test('imprimir no emite ninguna línea que empiece por ::', () => {
  const original = console.log
  const lineas = []
  console.log = (...a) => lineas.push(a.join(' '))
  try {
    imprimir(clasificar([f('docs/a\n::error::Injected message')]))
  } finally {
    console.log = original
  }
  assert.equal(lineas.some((l) => l.startsWith('::')), false)
})

// ── Parser de `git diff --raw -z` ──────────────────────────────────────────
test('parsea una modificación simple', () => {
  assert.deepEqual(parsearRawDiff(':100644 100644 aaaa bbbb M\0docs/x.md\0'), [
    { estado: 'M', modoAnterior: '100644', modoNuevo: '100644', ruta: 'docs/x.md' },
  ])
})

test('parsea un rename con las dos rutas, en el orden real de git', () => {
  // git emite ORIGEN primero y DESTINO después (verificado con `od -c` sobre
  // la salida real): `R100\0src/viejo.ts\0docs/nuevo.md\0`.
  const entradas = parsearRawDiff(':100644 100644 aaaa bbbb R100\0src/viejo.ts\0docs/nuevo.md\0')
  assert.deepEqual(entradas, [
    { estado: 'R100', modoAnterior: '100644', modoNuevo: '100644', ruta: 'docs/nuevo.md', rutaAnterior: 'src/viejo.ts' },
  ])
  assert.equal(clasificar(entradas).e2e_required, true)
})

test('parsea un symlink por su modo', () => {
  assert.equal(parsearRawDiff(':000000 120000 aaaa bbbb A\0docs/atajo\0')[0].modoNuevo, MODO_SYMLINK)
})

test('devuelve vacío para entradas nulas', () => {
  assert.deepEqual(parsearRawDiff(''), [])
  assert.deepEqual(parsearRawDiff(undefined), [])
})

test('una cabecera malformada fuerza E2E, no se descarta', () => {
  // Fail-closed: perder una entrada significaría omitir la suite sin decirlo.
  const r = parsearRawDiff(':basura\0docs/x.md\0')
  assert.equal(r.length, 1)
  assert.equal(r[0].invalida, true)
  assert.match(r[0].ruta, /docs\/x\.md/)
  assert.equal(clasificar(r).e2e_required, true)
})

test('un residuo sin cabecera también fuerza E2E', () => {
  const r = parsearRawDiff(':100644 100644 a b M\0docs/x.md\0basura\0')
  assert.equal(r.length, 2)
  assert.equal(clasificar(r).e2e_required, true)
})

test('lee varias entradas seguidas', () => {
  const raw =
    ':100644 100644 aaaa bbbb M\0docs/a.md\0' +
    ':100644 100644 cccc dddd R100\0src/b.ts\0docs/b.md\0'
  const r = parsearRawDiff(raw)
  assert.equal(r.length, 2)
  assert.equal(clasificar(r).e2e_required, true)
})
