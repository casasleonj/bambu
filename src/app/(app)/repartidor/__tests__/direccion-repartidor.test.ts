// @tests Regresión: /repartidor nunca mostraba texto de dirección al
// conductor — el select de negocio solo pedía lat/lng (nunca direccion,
// barrio o linkUbicacion), y repartidor-client no renderizaba ningún
// texto de dirección (solo el teléfono + un botón de ruta completa basado
// en coords).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const pageSource = readFileSync(
  join(process.cwd(), 'src/app/(app)/repartidor/page.tsx'),
  'utf-8',
)
const clientSource = readFileSync(
  join(process.cwd(), 'src/app/(app)/repartidor/repartidor-client.tsx'),
  'utf-8',
)

describe('FIX: /repartidor expone dirección de texto + linkUbicacion de respaldo', () => {
  it('el select de negocio ahora incluye direccion/barrio/linkUbicacion, no solo lat/lng', () => {
    const selectBlock = pageSource.match(/select:\s*\{\s*id:\s*true,\s*nombre:\s*true,\s*lat:\s*true,\s*lng:\s*true[^}]*\}/)?.[0] || ''
    expect(selectBlock).toMatch(/direccion:\s*true/)
    expect(selectBlock).toMatch(/barrio:\s*true/)
    expect(selectBlock).toMatch(/linkUbicacion:\s*true/)
  })

  it('usa pickDireccionTexto (regla única) alineado con pickCoords', () => {
    expect(pageSource).toMatch(/pickDireccionTexto\(/)
    expect(pageSource).toMatch(/from '@\/lib\/geo\/pedido-direccion'/)
  })

  it('expone direccionTexto/barrioTexto/linkUbicacionEfectivo por pedido', () => {
    expect(pageSource).toMatch(/direccionTexto:\s*direccionEfectiva\.direccion/)
    expect(pageSource).toMatch(/barrioTexto:\s*direccionEfectiva\.barrio/)
    expect(pageSource).toMatch(/linkUbicacionEfectivo/)
  })

  it('repartidor-client renderiza la dirección o usa DireccionIndicator como respaldo (no solo el teléfono)', () => {
    expect(clientSource).toMatch(/pedido\.direccionTexto/)
    expect(clientSource).toMatch(/pedido\.linkUbicacionEfectivo/)
    expect(clientSource).toMatch(/<DireccionIndicator/)
  })
})
