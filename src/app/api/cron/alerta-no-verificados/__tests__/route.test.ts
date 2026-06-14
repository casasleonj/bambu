// @tests cron alerta-no-verificados — commit 3.3 plan antifraude
// El cron ahora crea Casos (no solo Historial) y reusa el partial
// unique index para dedup. Tambien auto-cierrra Casos viejos (ABIERTO
// + createdAt < 30d) para evitar acumulacion infinita.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(
  process.cwd(),
  'src/app/api/cron/alerta-no-verificados/route.ts',
)
const source = readFileSync(routePath, 'utf-8')

describe('commit 3.3: cron reescrito (no mas Historial)', () => {
  it('FIX: el cron YA NO escribe a Historial (ahora crea Casos)', () => {
    expect(source).not.toMatch(/prisma\.historial\.create/)
  })

  it('FIX: el cron crea Casos con prisma.caso.create', () => {
    expect(source).toMatch(/prisma\.caso\.create\s*\(\s*\{[\s\S]*?status:\s*['"]ABIERTO['"]/)
  })

  it('FIX: el cron usa el SYSTEM user como creadoPorId', () => {
    expect(source).toMatch(/system@bambu\.local/)
    expect(source).toMatch(/creadoPorId:\s*systemUser\.id/)
  })

  it('FIX: el cron verifica que SYSTEM user existe (fail-fast)', () => {
    expect(source).toMatch(/SYSTEM user no existe/)
  })

  it('FIX: el cron usa alertaTipo CLIENTE_NO_VERIFICADO', () => {
    expect(source).toMatch(/alertaTipo:\s*['"]CLIENTE_NO_VERIFICADO['"]/)
  })

  it('FIX: el cron solo alerta clientes activos con verificado=false', () => {
    // Query: verificado: false, createdAt < X, activo: true
    expect(source).toMatch(/verificado:\s*false/)
    expect(source).toMatch(/activo:\s*true/)
  })
})

describe('commit 3.3: dedup via casoExistente (no unique index en codigo)', () => {
  it('FIX: el cron busca Caso existente para el cliente', () => {
    expect(source).toMatch(/prisma\.caso\.findFirst\(\s*\{[\s\S]+?clienteId:[\s\S]+?alertaTipo:\s*['"]CLIENTE_NO_VERIFICADO['"][\s\S]+?\}\)/)
  })

  it('FIX: si Caso existe y status=ABIERTO → skip (dedup)', () => {
    expect(source).toMatch(/casoExistente\.status\s*===\s*['"]ABIERTO['"][\s\S]+?continue/)
  })

  it('FIX: si Caso existe y status=RESUELTO/CERRADO → reabrir como ABIERTO', () => {
    // El codigo debe reabrir y crear un evento 'reabierto'
    expect(source).toMatch(/valorPost:\s*['"]ABIERTO['"][\s\S]+?reabierto/)
  })

  it('FIX: el reabrir usa optimistic lock con updatedAt', () => {
    // updateMany con where updatedAt (patron F-N19)
    expect(source).toMatch(/updateMany\([\s\S]+?where:\s*\{[\s\S]+?id,\s*updatedAt:[\s\S]+?\}\s*,\s*data:/)
  })

  it('FIX: si updatedAt no matchea (CASO_MODIFICADO), skip con warn', () => {
    expect(source).toMatch(/updateResult\.count\s*===\s*0/)
    expect(source).toMatch(/caso modificado por otro usuario|skip reabrir/)
  })
})

describe('commit 3.3: auto-cierre de Casos viejos (30 dias)', () => {
  it('FIX: el cron busca Casos ABIERTO con createdAt < 30d', () => {
    expect(source).toMatch(/status:\s*['"]ABIERTO['"][\s\S]+?createdAt:\s*\{\s*lt:\s*fechaAutoCierre/)
  })

  it('FIX: el cron cierra los Casos viejos (status=CERRADO, cerradoEn=ahora)', () => {
    expect(source).toMatch(/status:\s*['"]CERRADO['"][\s\S]+?cerradoEn:\s*ahora/)
  })

  it('FIX: el cron usa optimistic lock para auto-cierre (no pisar cambios concurrentes)', () => {
    // updateMany con where status: 'ABIERTO' para que si el admin
    // resolvio mientras el cron corria, NO se sobreescriba
    expect(source).toMatch(/where:\s*\{[\s\S]+?id,\s*updatedAt[\s\S]+?status:\s*['"]ABIERTO['"][\s\S]+?\}\s*,\s*data:/)
  })

  it('FIX: el cron crea evento auto_cierre para audit', () => {
    expect(source).toMatch(/accion:\s*['"]auto_cierre['"]/)
    expect(source).toMatch(/Auto-cerrado por inactividad/)
  })

  it('FIX: el cron tiene un safety cap de 100 casos viejos (no procesa infinitos)', () => {
    expect(source).toMatch(/take:\s*100/)
  })
})

describe('commit 3.3: constantes', () => {
  it('FIX: AUTO_CIERRE_DIAS = 30 (configurable en codigo, no en DB)', () => {
    expect(source).toMatch(/AUTO_CIERRE_DIAS\s*=\s*30/)
  })
})

describe('commit 3.3: el cron sigue siendo seguro', () => {
  it('FIX: el cron requiere CRON_SECRET', () => {
    expect(source).toMatch(/requireCronSecret/)
  })
})
