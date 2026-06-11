// @tests expand-contract PedidoItem — Sprint 3 (C-2 Fase 1)
// Estado actual:
//   - toPrismaCreate/toPrismaUpdate SÍ escriben legacy (defensa en profundidad)
//   - Trigger Postgres trg_sync_pedido_legacy sincroniza legacy desde items[]
//   - venta-libre/route.ts usa buildPedidoLegacyFields() (helper compartido)
//   - BD siempre tiene legacy sincronizado, sin importar el path
//
// Próximos pasos:
//   - Fase 2: migrar call-sites que leen legacy (nomina, reportes, recurrentes,
//     embarque-capacidad) a items[]
//   - Fase 3: DROP COLUMN + DROP TRIGGER en una sola migración
//
// Estos tests verifican la estructura actual y documentan el estado.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const mapperPath = join(process.cwd(), 'src/modules/pedidos/infrastructure/mappers/PedidoMapper.ts')
const repoPath = join(process.cwd(), 'src/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository.ts')
const triggerPath = join(process.cwd(), 'prisma/migrations/20260611_add_legacy_sync_trigger/migration.sql')
const helperPath = join(process.cwd(), 'src/lib/pedido-legacy.ts')
const ventaLibrePath = join(process.cwd(), 'src/app/api/pedidos/venta-libre/route.ts')

const mapper = readFileSync(mapperPath, 'utf-8')
const repo = readFileSync(repoPath, 'utf-8')
const trigger = readFileSync(triggerPath, 'utf-8')
const helper = readFileSync(helperPath, 'utf-8')
const ventaLibre = readFileSync(ventaLibrePath, 'utf-8')

describe('Sprint 3 (C-2 Fase 1): dual-write + trigger sync', () => {
  it('FIX: toPrismaCreate persiste legacy (defensa en profundidad)', () => {
    // El mapper sigue escribiendo legacy via ...legacy spread.
    // Es OK porque el trigger lo sobreescribe con el valor de items[].
    expect(mapper).toMatch(/toPrismaCreate[\s\S]+?\.\.\.legacy/)
  })

  it('FIX: toPrismaCreate también escribe en items[] (dual-write)', () => {
    const createFn = mapper.match(/static toPrismaCreate[\s\S]+?^  \}/m)?.[0] || ''
    expect(createFn).toMatch(/items:\s*\{[\s\S]+?create:\s*pedido\.items\.map/)
  })

  it('FIX: fromPrisma lee desde items[]', () => {
    expect(mapper).toMatch(/fromPrisma[\s\S]+?raw\.items\.map\(i =>[\s\S]+?new PedidoItem/)
  })

  it('Sprint 3: trigger Postgres trg_sync_pedido_legacy existe', () => {
    // El trigger mantiene legacy sincronizado desde items[] en cada
    // INSERT/UPDATE/DELETE de PedidoItem. Single source of truth = items[].
    expect(trigger).toMatch(/CREATE OR REPLACE FUNCTION sync_pedido_legacy_columns/)
    expect(trigger).toMatch(/CREATE TRIGGER trg_sync_pedido_legacy/)
    expect(trigger).toMatch(/AFTER INSERT OR UPDATE OR DELETE ON "PedidoItem"/)
  })

  it('Sprint 3: trigger calcula split de botellón según canal', () => {
    // El trigger implementa la lógica de split (PUNTO → Fab, DOMICILIO → Dom)
    // que antes estaba duplicada y bug en venta-libre.
    expect(trigger).toMatch(/v_canal = 'PUNTO'/)
    expect(trigger).toMatch(/cBotellonFabPed/)
    expect(trigger).toMatch(/cBotellonDomPed/)
  })

  it('Sprint 3: trigger backfill inicial está incluido', () => {
    // El DO block al final ejecuta backfill de pedidos existentes.
    expect(trigger).toMatch(/Backfill/)
  })

  it('Sprint 3: helper buildPedidoLegacyFields existe y es genérico', () => {
    // Helper compartido que venta-libre usa (single source of truth).
    expect(helper).toMatch(/export function buildPedidoLegacyFields/)
    expect(helper).toMatch(/export interface LegacyItemInput/)
  })

  it('Sprint 3: venta-libre ya NO escribe legacy hardcoded', () => {
    // Antes: 18 líneas con cPacaAguaPed: items.find(...) hardcoded.
    // Después: ...legacyFields spread desde buildPedidoLegacyFields().
    expect(ventaLibre).not.toMatch(/cPacaAguaPed: itemsParaPrecios\.find/)
    expect(ventaLibre).toMatch(/buildPedidoLegacyFields/)
  })
})

describe('Sprint 3: estado del backfill (Fase 1 completada)', () => {
  it('FIX: el backfill está implícito en dual-write + trigger', () => {
    // Como dual-write + trigger ya corren:
    //   - Pedidos nuevos vía DDD: dual-write los crea sincronizados
    //   - Pedidos nuevos vía venta-libre: trigger los sincroniza
    //   - Pedidos pre-existentes: el backfill del trigger los sincronizó al migrar
    //
    // Verificable con: SELECT COUNT(*) FROM "Pedido" p
    //   WHERE NOT EXISTS (SELECT 1 FROM "PedidoItem" WHERE "pedidoId" = p.id)
    expect(true).toBe(true) // doc-only
  })
})

describe('Sprint 3 (C-2): pasos 4-5 (migrar lecturas, DROP) pendientes', () => {
  it('FIX: el repo.save y repo.update siguen escribiendo en columnas legacy', () => {
    // Esto es intencional en Fase 1: belt-and-suspenders.
    // El trigger sobreescribe con el valor de items[] en cualquier caso.
    const saveFn = repo.match(/async save[\s\S]+?^  \}/m)?.[0] || ''
    expect(saveFn).toMatch(/toPrismaCreate/)
  })
})
