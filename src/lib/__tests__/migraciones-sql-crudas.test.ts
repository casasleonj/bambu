// @tests #714 — la lista única de migraciones SQL crudas (CI y desarrollo local) no se desalinea.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(__dirname, '..', '..', '..')
const MIGRACIONES = join(RAIZ, 'prisma', 'migrations')

// Migraciones con objetos que `db push` no crea y que HOY no se aplican en CI ni en local.
// Registradas en #715; al aplicarlas, pasan a scripts/migraciones-sql-crudas.txt.
const EXCLUIDAS_715 = [
  '20260530_add_pg_trgm_search',
  '20260610_add_check_constraints',
  '20260611_add_embarque_legacy_sync_trigger',
  '20260611_add_legacy_sync_trigger',
  '20260612_add_geo_coords',
  '20260614_add_demanda_scoring',
  '20260618_add_import_staging',
  '20261101_pedido_saldo_favor_movimiento',
  '20261108_entrega_exigible',
]

const lista = readFileSync(join(RAIZ, 'scripts', 'migraciones-sql-crudas.txt'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))

const RAW = /CHECK|CREATE SEQUENCE|CREATE TRIGGER|CREATE EXTENSION|CREATE (UNIQUE )?INDEX .* WHERE/

describe('migraciones SQL crudas (#714)', () => {
  it('cada entrada existe y no hay duplicados', () => {
    expect(new Set(lista).size).toBe(lista.length)
    for (const n of lista) expect(existsSync(join(MIGRACIONES, n, 'migration.sql')), n).toBe(true)
  })

  it('toda migración con objetos crudos está en la lista o excluida con #715', () => {
    const pendientes = readdirSync(MIGRACIONES)
      .filter((n) => existsSync(join(MIGRACIONES, n, 'migration.sql')))
      .filter((n) => RAW.test(readFileSync(join(MIGRACIONES, n, 'migration.sql'), 'utf8')))
      .filter((n) => !lista.includes(n) && !EXCLUIDAS_715.includes(n))
    expect(pendientes).toEqual([])
  })

  it('una excluida no está también en la lista', () => {
    expect(EXCLUIDAS_715.filter((n) => lista.includes(n))).toEqual([])
  })

  it('ci.yml usa el script y no copia psql de migraciones', () => {
    const ci = readFileSync(join(RAIZ, '.github', 'workflows', 'ci.yml'), 'utf8')
    expect(ci).toContain('bash scripts/aplicar-migraciones-sql-crudas.sh')
    expect(ci).not.toMatch(/psql .*prisma\/migrations\//)
  })
})
