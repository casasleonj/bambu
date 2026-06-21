// @tests recurrentes lib — timezone fix verification
// Hallazgo: previewGeneracionRecurrentes usaba fechaReferencia.toISOString(),
// que devuelve UTC. Cerca de la medianoche en Bogotá, el preview apuntaba
// al día siguiente y no mostraba plantillas pendientes.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const libPath = join(process.cwd(), 'src/lib/recurrentes.ts')
const libSource = readFileSync(libPath, 'utf-8')

describe('previewGeneracionRecurrentes usa fecha de Bogotá', () => {
  it('FIX: no usa toISOString().slice(0, 10) para la fecha de referencia', () => {
    const previewMatch = libSource.match(/export async function previewGeneracionRecurrentes[\s\S]+?^}/m)
    expect(previewMatch).not.toBeNull()
    const previewBlock = previewMatch![0]

    expect(previewBlock).not.toMatch(/fechaReferencia\.toISOString\(\)\.slice\(0,\s*10\)/)
  })

  it('FIX: usa formatDateISO(fechaReferencia) que respeta timezone America/Bogota', () => {
    const previewMatch = libSource.match(/export async function previewGeneracionRecurrentes[\s\S]+?^}/m)
    const previewBlock = previewMatch![0]

    expect(previewBlock).toMatch(/getDateRange\(\s*\n?\s*formatDateISO\(fechaReferencia\),\s*\n?\s*formatDateISO\(fechaReferencia\)\s*\)/)
  })
})
