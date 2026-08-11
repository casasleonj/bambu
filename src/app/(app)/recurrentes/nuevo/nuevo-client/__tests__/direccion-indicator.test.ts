// @tests Step 8 — Recurrentes/nuevo: visibilidad de dirección del cliente
// seleccionado. Antes solo se mostraba `cliente.barrio` (o nada si el
// cliente no tenía barrio) — sin distinguir "sin dirección registrada" de
// "hay dirección pero no se está mostrando", ni ofrecer el link de Maps
// como respaldo cuando no hay texto de dirección.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const typesSource = readFileSync(
  join(process.cwd(), 'src/app/(app)/recurrentes/nuevo/nuevo-client/types.ts'),
  'utf-8',
)
const clientSource = readFileSync(
  join(process.cwd(), 'src/app/(app)/recurrentes/nuevo/nuevo-client/index.tsx'),
  'utf-8',
)

describe('Cliente type declara linkUbicacion (ya viene en el payload de /api/clientes)', () => {
  it('FIX: linkUbicacion?: string | null en la interface Cliente', () => {
    const idx = typesSource.indexOf('export interface Cliente')
    const block = typesSource.slice(idx, typesSource.indexOf('}', idx))
    expect(block).toMatch(/linkUbicacion\?:\s*string\s*\|\s*null/)
  })
})

describe('FIX: nuevo-client usa DireccionIndicator para el cliente seleccionado', () => {
  it('importa DireccionIndicator', () => {
    expect(clientSource).toMatch(/import \{ DireccionIndicator \} from '@\/components\/direccion-indicator'/)
  })

  it('lo renderiza con direccion/barrio/linkUbicacion del cliente seleccionado', () => {
    const idx = clientSource.indexOf('<DireccionIndicator')
    expect(idx).toBeGreaterThan(-1)
    const block = clientSource.slice(idx, clientSource.indexOf('/>', idx))
    expect(block).toMatch(/direccion=\{selectedCliente\.direccion\}/)
    expect(block).toMatch(/barrio=\{selectedCliente\.barrio\}/)
    expect(block).toMatch(/linkUbicacion=\{selectedCliente\.linkUbicacion\}/)
  })

  it('no usa la prop sinLink (no está anidado dentro de otro elemento interactivo)', () => {
    const idx = clientSource.indexOf('<DireccionIndicator')
    const block = clientSource.slice(idx, clientSource.indexOf('/>', idx))
    expect(block).not.toMatch(/sinLink/)
  })
})
