// @tests Regresión: /embarques mostraba siempre el barrio del CLIENTE,
// ignorando pedido.negocioId — Negocio nunca se consultaba en esta página.
// Un pedido destinado a un negocio con dirección propia distinta a la del
// cliente dueño mostraba la dirección incorrecta al armar/cerrar la ruta.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const pageSource = readFileSync(
  join(process.cwd(), 'src/app/(app)/embarques/[id]/page.tsx'),
  'utf-8',
)
const clientSource = readFileSync(
  join(process.cwd(), 'src/app/(app)/embarques/[id]/embarque-client.tsx'),
  'utf-8',
)

describe('FIX: /embarques resuelve dirección negocio-gana-else-cliente', () => {
  it('la página consulta Negocio para los negocioId presentes en los pedidos', () => {
    expect(pageSource).toMatch(/prisma\.negocio\.findMany/)
  })

  it('usa pickDireccionTexto (regla única) en vez de lógica propia', () => {
    expect(pageSource).toMatch(/pickDireccionTexto\(/)
    expect(pageSource).toMatch(/from '@\/lib\/geo\/pedido-direccion'/)
  })

  it('el select de cliente incluye direccion (antes solo pedía barrio)', () => {
    const selectBlock = pageSource.match(/cliente:\s*\{\s*select:\s*\{[^}]*\}/)?.[0] || ''
    expect(selectBlock).toMatch(/direccion:\s*true/)
  })

  it('el select de pedidos incluye negocioId', () => {
    expect(pageSource).toMatch(/negocioId:\s*true/)
  })

  it('embarque-client ya NO usa pedido.cliente?.barrio como único fallback de dirección', () => {
    // Antes: {pedido.cliente?.barrio || pedido.cliente?.telefono || ''}
    expect(clientSource).not.toMatch(/pedido\.cliente\?\.barrio\s*\|\|\s*pedido\.cliente\?\.telefono/)
  })

  it('embarque-client usa direccionTexto/barrioTexto resueltos', () => {
    expect(clientSource).toMatch(/pedido\.direccionTexto/)
    expect(clientSource).toMatch(/pedido\.barrioTexto/)
  })
})
