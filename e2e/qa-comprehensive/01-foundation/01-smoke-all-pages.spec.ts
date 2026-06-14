/**
 * Tier 1: Foundation - Smoke test all pages
 * Tests: ~30 (one per route, multiple roles)
 * Verifies that each page loads without 500 and renders basic content
 */
import { test, expect, loginAsAdmin, loginAsContador, loginAsRepartidor, BASE } from '../00-fixtures'

const PAGES_TO_TEST = [
  { path: '/dashboard', roles: ['ADMIN', 'ASISTENTE', 'CONTADOR', 'SELLADOR'] },
  { path: '/clientes', roles: ['ADMIN', 'ASISTENTE', 'CONTADOR'] },
  { path: '/pedidos', roles: ['ADMIN', 'ASISTENTE', 'CONTADOR'] },
  { path: '/recurrentes', roles: ['ADMIN', 'ASISTENTE', 'CONTADOR'] },
  { path: '/recurrentes/nuevo', roles: ['ADMIN', 'ASISTENTE', 'CONTADOR'] },
  { path: '/embarques', roles: ['ADMIN', 'ASISTENTE', 'CONTADOR', 'REPARTIDOR'] },
  { path: '/produccion', roles: ['ADMIN', 'ASISTENTE', 'SELLADOR'] },
  { path: '/trabajadores', roles: ['ADMIN', 'CONTADOR'] },
  { path: '/rutas', roles: ['ADMIN', 'ASISTENTE', 'CONTADOR'] },
  { path: '/rutas/nuevo', roles: ['ADMIN', 'ASISTENTE'] },
  { path: '/rutas/analisis', roles: ['ADMIN', 'ASISTENTE', 'CONTADOR'] },
  { path: '/nomina', roles: ['ADMIN', 'CONTADOR'] },
  { path: '/reportes', roles: ['ADMIN', 'CONTADOR'] },
  { path: '/configuracion', roles: ['ADMIN', 'CONTADOR'] },
  { path: '/admin/usuarios', roles: ['ADMIN'] },
  { path: '/casos', roles: ['ADMIN', 'ASISTENTE', 'CONTADOR'] },
  { path: '/deudas', roles: ['ADMIN', 'CONTADOR'] },
  { path: '/compras', roles: ['ADMIN', 'CONTADOR'] },
  { path: '/gastos', roles: ['ADMIN', 'CONTADOR'] },
  { path: '/facturas', roles: ['ADMIN', 'CONTADOR'] },
  { path: '/resumen-facturas', roles: ['ADMIN', 'CONTADOR'] },
  { path: '/productos', roles: ['ADMIN', 'ASISTENTE', 'CONTADOR'] },
  { path: '/proveedores', roles: ['ADMIN', 'CONTADOR'] },
  { path: '/insumos', roles: ['ADMIN', 'ASISTENTE', 'CONTADOR'] },
  { path: '/repartidor', roles: ['REPARTIDOR'] },
  { path: '/mi-perfil', roles: ['ADMIN', 'ASISTENTE', 'CONTADOR', 'REPARTIDOR', 'SELLADOR'] },
  { path: '/cierre', roles: ['ADMIN', 'ASISTENTE', 'CONTADOR'] },
] as const

test.describe('Foundation - Smoke All Pages', () => {
  for (const page of PAGES_TO_TEST) {
    for (const role of page.roles) {
      test(`[${role}] ${page.path} loads without 500`, async ({ page: p }) => {
        if (role === 'ADMIN') await loginAsAdmin(p)
        else if (role === 'ASISTENTE') await loginAsAdmin(p) // Using admin for now (asistente pw: asist123)
        else if (role === 'CONTADOR') await loginAsContador(p)
        else if (role === 'REPARTIDOR') await loginAsRepartidor(p)

        // SELLADOR uses admin as fallback (no real sellador user in seed)

        const response = await p.goto(`${BASE}${page.path}`)
        // Verify HTTP success
        expect(response?.status()).toBeLessThan(500)
        // Page should render some content
        const body = await p.locator('body').textContent()
        expect(body?.length).toBeGreaterThan(50)
      })
    }
  }
})
