// @tests Step 8 — Recurrentes/[id] (editar): visibilidad de dirección del
// cliente dueño de la plantilla. Antes solo se mostraba `cliente.barrio` —
// sin distinguir "sin dirección registrada" de "hay dirección pero no se
// está mostrando", ni ofrecer el link de Maps como respaldo.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const pageSource = readFileSync(
  join(process.cwd(), 'src/app/(app)/recurrentes/[id]/page.tsx'),
  'utf-8',
)
const clientSource = readFileSync(
  join(process.cwd(), 'src/app/(app)/recurrentes/[id]/editar-client/index.tsx'),
  'utf-8',
)

describe('FIX: la página consulta linkUbicacion del cliente', () => {
  it('el select del cliente incluye linkUbicacion (antes solo pedía barrio/direccion)', () => {
    const idx = pageSource.indexOf('cliente: { select:')
    const block = pageSource.slice(idx, pageSource.indexOf('}', idx) + 1)
    expect(block).toMatch(/linkUbicacion:\s*true/)
  })
})

describe('FIX: editar-client usa DireccionIndicator para el cliente de la plantilla', () => {
  it('el tipo PlantillaSerialized.cliente declara linkUbicacion', () => {
    const idx = clientSource.indexOf('cliente: {')
    const block = clientSource.slice(idx, clientSource.indexOf('}', idx))
    expect(block).toMatch(/linkUbicacion:\s*string\s*\|\s*null/)
  })

  it('importa DireccionIndicator', () => {
    expect(clientSource).toMatch(/import \{ DireccionIndicator \} from '@\/components\/direccion-indicator'/)
  })

  it('lo renderiza con direccion/barrio/linkUbicacion de plantilla.cliente', () => {
    const idx = clientSource.indexOf('<DireccionIndicator')
    expect(idx).toBeGreaterThan(-1)
    const block = clientSource.slice(idx, clientSource.indexOf('/>', idx))
    expect(block).toMatch(/direccion=\{plantilla\.cliente\.direccion\}/)
    expect(block).toMatch(/barrio=\{plantilla\.cliente\.barrio\}/)
    expect(block).toMatch(/linkUbicacion=\{plantilla\.cliente\.linkUbicacion\}/)
  })

  it('no usa la prop sinLink (no está anidado dentro de otro elemento interactivo)', () => {
    const idx = clientSource.indexOf('<DireccionIndicator')
    const block = clientSource.slice(idx, clientSource.indexOf('/>', idx))
    expect(block).not.toMatch(/sinLink/)
  })
})
