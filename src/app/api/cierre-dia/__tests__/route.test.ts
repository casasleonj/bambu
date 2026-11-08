// @tests #691 — /api/cierre-dia es de solo lectura: un día se cierra únicamente con POST /api/cierre.
// Antes existía un POST (solo ADMIN, sin uso en la interfaz) que guardaba un cierre con los números del cuerpo,
// sin base de caja vigente, huecos, embarques abiertos ni cálculo del efectivo esperado.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as ruta from '../route'

const source = readFileSync(join(process.cwd(), 'src/app/api/cierre-dia/route.ts'), 'utf-8')

describe('#691: /api/cierre-dia no puede cerrar un día', () => {
  it('solo exporta GET (cualquier otro método responde 405)', () => {
    expect(typeof ruta.GET).toBe('function')
    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect((ruta as Record<string, unknown>)[metodo], metodo).toBeUndefined()
    }
  })

  it('no escribe en CierreDia: el archivo no crea, actualiza ni borra cierres', () => {
    expect(source).not.toMatch(/cierreDia\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/)
    expect(source).not.toMatch(/\$transaction|withAdvisoryLock/)
  })

  it('el GET sigue exigiendo sesión', () => {
    expect(source).toMatch(/requireAuth\(\)/)
  })
})
