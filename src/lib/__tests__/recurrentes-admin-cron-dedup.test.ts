// @tests recurrentes lib — F-N17 fix verification (dedup admin-vs-cron sin offlineId)
// Hallazgo: el dedup por recurrenteBatchId (F-N14) solo funciona si
// los requests tienen el mismo offlineId. Si admin y cron corren con
// diferentes (o sin) offlineIds, el dedup no se activa. Después de
// un P2034 retry, la segunda tx no verificaba si la plantilla ya
// había sido generada, y creaba OTRO pedido.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const libPath = join(process.cwd(), 'src/lib/recurrentes.ts')
const source = readFileSync(libPath, 'utf-8')

describe('F-N17: dedup admin-vs-cron con check de ultimaGeneracion DENTRO del Serializable', () => {
  // Extraer el bloque del callback del Serializable (entre executeSerializableWithRetry y el cierre)
  const serializableStart = source.indexOf('executeSerializableWithRetry<')
  const serializableBlock = source.substring(serializableStart)

  it('FIX: el callback del Serializable verifica ultimaGeneracion >= proxGeneracion', () => {
    // Debe estar DENTRO del callback del executeSerializableWithRetry
    expect(serializableBlock).toMatch(/pt\.ultimaGeneracion\s*&&[\s\S]+?pt\.ultimaGeneracion\.getTime\(\)\s*>=\s*pt\.proxGeneracion\.getTime\(\)/)
  })

  it('FIX: si la condición se cumple, retorna { skipped: true }', () => {
    // El check debe retornar skipped
    expect(serializableBlock).toMatch(/pt\.ultimaGeneracion\.getTime\(\)\s*>=\s*pt\.proxGeneracion\.getTime\(\)[\s\S]{0,100}return\s*\{\s*skipped:\s*true\s*\}/)
  })

  it('FIX: el check está DENTRO de la tx (no en una validación pre-tx)', () => {
    // El check debe estar DESPUÉS del findUnique de plantilla (dentro de la tx)
    const findIdx = serializableBlock.indexOf('tx.plantillaRecurrente.findUnique')
    const checkIdx = serializableBlock.indexOf('pt.ultimaGeneracion && pt.proxGeneracion')
    expect(checkIdx).toBeGreaterThan(findIdx)
  })

  it('FIX: hay un comentario F-N17 explicando el fix', () => {
    expect(source).toMatch(/FIX F-N17/)
  })
})

describe('F-N17: el flow normal sigue funcionando (no rompe generación)', () => {
  const serializableStart = source.indexOf('executeSerializableWithRetry<')
  const serializableBlock = source.substring(serializableStart)

  it('FIX: cuando ultimaGeneracion es null (primera generación), el check no se activa', () => {
    // El check usa `if (pt.ultimaGeneracion && ...)` → si es null, no entra
    expect(serializableBlock).toMatch(/if\s*\(pt\.ultimaGeneracion\s*&&\s*pt\.proxGeneracion\)/)
  })

  it('FIX: cuando ultimaGeneracion < proxGeneracion (fecha anterior), no se skipea', () => {
    // El check retorna skipped SOLO si ultimaGeneracion >= proxGeneracion
    // Si ultimaGeneracion < proxGeneracion, no entra al return
    const checkBlock = serializableBlock.match(/if\s*\(pt\.ultimaGeneracion\s*&&\s*pt\.proxGeneracion\)\s*\{[\s\S]+?return\s*\{\s*skipped:\s*true\s*\}\s*\}/)
    expect(checkBlock).not.toBeNull()
    // El check usa >=
    expect(checkBlock![0]).toMatch(/>=\s*pt\.proxGeneracion\.getTime\(\)/)
  })
})

describe('F-N17: el dedup por offlineId (F-N14) sigue funcionando', () => {
  it('FIX: el dedup por recurrenteBatchId sigue al inicio de la función', () => {
    expect(source).toMatch(/if\s*\(options\?\.recurrenteBatchId\)/)
    expect(source).toMatch(/recurrenteBatchId:\s*options\.recurrenteBatchId/)
  })

  it('FIX: el orden de operaciones es: dedup offlineId → sort → loop', () => {
    // Buscar el orden relativo
    const dedupOfflineIdIdx = source.indexOf('if (options?.recurrenteBatchId)')
    const sortIdx = source.indexOf('localeCompare(b.recurrenteId)')
    const loopIdx = source.indexOf('for (const decision of decisionesOrdenadas)')

    expect(dedupOfflineIdIdx).toBeGreaterThan(-1)
    expect(sortIdx).toBeGreaterThan(dedupOfflineIdIdx)
    expect(loopIdx).toBeGreaterThan(sortIdx)
  })
})

describe('F-N17: el dedup intra-loop (dentro del Serializable) detecta generación ya hecha', () => {
  const serializableStart = source.indexOf('executeSerializableWithRetry<')
  const serializableBlock = source.substring(serializableStart)

  it('FIX: el check aparece UNA SOLA VEZ (no duplicado)', () => {
    const matches = serializableBlock.match(/pt\.ultimaGeneracion\s*&&\s*pt\.proxGeneracion/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBe(1)
  })

  it('FIX: el check NO interfiere con la lógica de SALTAR decision', () => {
    // El check de ultimaGeneracion está ANTES de la decisión SALTAR
    // Si la plantilla ya fue generada, no llegamos al SALTAR
    // (de hecho, la decisión SALTAR también updatea ultimaGeneracion,
    //  pero solo si la plantilla está activa)
    const checkIdx = serializableBlock.indexOf('pt.ultimaGeneracion && pt.proxGeneracion')
    const saltarIdx = serializableBlock.indexOf("decision.decision === 'SALTAR'")
    expect(checkIdx).toBeGreaterThan(-1)
    expect(saltarIdx).toBeGreaterThan(checkIdx)
  })
})
