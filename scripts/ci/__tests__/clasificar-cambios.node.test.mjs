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
  assert.match(r.detalle.inciertos[0], /rename/)
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

// ── Parser de `git diff --raw -z` ──────────────────────────────────────────
test('parsea una modificación simple', () => {
  assert.deepEqual(parsearRawDiff(':100644 100644 aaaa bbbb M\0docs/x.md\0'), [
    { estado: 'M', modoAnterior: '100644', modoNuevo: '100644', ruta: 'docs/x.md' },
  ])
})

test('parsea un rename con las dos rutas y lo clasifica como E2E', () => {
  const entradas = parsearRawDiff(':100644 100644 aaaa bbbb R100\0docs/nuevo.md\0src/viejo.ts\0')
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
