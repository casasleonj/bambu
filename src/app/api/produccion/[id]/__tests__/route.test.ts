import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/produccion/[id]/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('FASE F: PUT /api/produccion/[id] solo ADMIN + auditoría', () => {
  const putStart = source.indexOf('export async function PUT')
  const putSource = source.substring(putStart)

  it('solo ADMIN puede editar producción', () => {
    expect(putSource).toMatch(/requireRole\(\s*\[\s*ROLES\.ADMIN\s*\]/)
  })

  it('no permite ASISTENTE', () => {
    expect(putSource).not.toMatch(/ROLES\.ASISTENTE/)
  })

  it('rechaza edición de producción histórica (400)', () => {
    expect(putSource).toMatch(/PRODUCCION_NO_EDITABLE_HISTORICA/)
    expect(putSource).toMatch(/Solo se pueden editar producciones del día actual/)
    expect(putSource).toMatch(/400/)
  })

  it('rechaza edición si el día ya fue cerrado (409)', () => {
    expect(putSource).toMatch(/PRODUCCION_EN_CIERRE_CERRADO/)
    expect(putSource).toMatch(/No se puede editar: el día ya fue cerrado/)
    expect(putSource).toMatch(/409/)
  })

  it('requiere obs si hay diferencia de stock', () => {
    expect(putSource).toMatch(/FALTA_OBS_CON_DIFERENCIA/)
    expect(putSource).toMatch(/Si hay diferencia de stock debés explicar la causa en observaciones/)
  })

  it('genera audit log UPDATE con before/after/diffSummary', () => {
    expect(putSource).toMatch(/logAudit\(/)
    expect(putSource).toMatch(/accion:\s*['"]UPDATE['"]/)
    expect(putSource).toMatch(/before/)
    expect(putSource).toMatch(/after/)
    expect(putSource).toMatch(/changedFields/)
    expect(putSource).toMatch(/diffSummary/)
    expect(putSource).toMatch(/\.catch\(\(\)\s*=>\s*\{\}\)/)
  })

  it('usa advisory lock para serializar vs POST concurrentes', () => {
    expect(putSource).toMatch(/pg_advisory_xact_lock/)
  })
})
