import { test, expect, Page } from '@playwright/test'

const BASE = 'http://localhost:3000'

const PROTECTED_PAGES = [
  '/dashboard', '/pedidos', '/clientes', '/embarques', '/produccion',
  '/cierre', '/facturas', '/gastos', '/nomina', '/trabajadores',
  '/proveedores', '/compras', '/insumos', '/reportes', '/precios',
]

const ADMIN_PAGES = ['/trabajadores', '/cierre', '/reportes', '/precios']

async function login(page: Page, user: string, pass: string) {
  await page.goto(`${BASE}/login`)
  await page.fill('input[type="text"]', user)
  await page.fill('input[type="password"]', pass)
  await page.click('button:has-text("Ingresar")')
  await page.waitForURL(/.*dashboard/, { timeout: 15000 })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Roles y Permisos', () => {

  // ═══════════════════════════════════════════
  // 1. AUTH: No autenticado → redirect a login
  // ═══════════════════════════════════════════
  test.describe('Sin autenticación', () => {
    for (const page of PROTECTED_PAGES) {
      test(`Redirige ${page} a /login`, async ({ page: browserPage }) => {
        await browserPage.goto(`${BASE}${page}`)
        await expect(browserPage).toHaveURL(/.*\/login/, { timeout: 10000 })
      })
    }

    test('API POST sin auth → 401', async ({ request }) => {
      const res = await request.post(`${BASE}/api/clientes`, {
        data: { nombre: 'Test', telefono: '3001234567' },
      })
      expect(res.status()).toBe(401)
    })
  })

  // ═══════════════════════════════════════════
  // 2. ADMIN: acceso total
  // ═══════════════════════════════════════════
  test.describe('ADMIN — acceso total', () => {
    test.beforeEach(async ({ page }) => {
      await login(page, 'admin', 'admin123')
    })

    test('Accede a todas las páginas protegidas', async ({ page }) => {
      for (const p of PROTECTED_PAGES) {
        await page.goto(`${BASE}${p}`)
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(500)
        const url = page.url()
        expect(url).toContain(p.split('/')[1])
      }
    })

    test('Crea cliente (API)', async ({ page }) => {
      const res = await page.request.post(`${BASE}/api/clientes`, {
        data: { nombre: 'Cliente Admin Test', telefono: '3009998877' },
      })
      expect(res.ok()).toBe(true)
      const body = await res.json()
      expect(body.success).toBe(true)
    })

    test('Crea embarque (API — requiere ADMIN o REPARTIDOR)', async ({ page }) => {
      const trabRes = await page.request.get(`${BASE}/api/trabajadores`)
      const trabBody = await trabRes.json()
      const trabajadorId = trabBody.trabajadores?.[0]?.id

      if (!trabajadorId) {
        test.skip()
        return
      }

      const res = await page.request.post(`${BASE}/api/embarques`, {
        data: { trabajadorId },
      })
      expect(res.ok()).toBe(true)
    })

    test('Cierra día (API — requiere ADMIN)', async ({ page }) => {
      const res = await page.request.post(`${BASE}/api/cierre`, {
        data: {
          numPedidos: 0, totalVentas: 0, cobrado: 0, fiado: 0,
          efectivo: 0, transferencia: 0, nequi: 0, daviplata: 0, bono: 0,
          baseDia: 100000, comisiones: 0, salarios: 0, gastos: 0,
          stockIniAgua: 0, prodAgua: 0, stockFinAgua: 0,
          stockIniHielo: 0, prodHielo: 0, stockFinHielo: 0,
          netoCaja: 100000,
        },
      })
      expect(res.ok()).toBe(true)
    })

    test('Crea abono (API — requiere ADMIN o CONTADOR)', async ({ page }) => {
      const factRes = await page.request.get(`${BASE}/api/facturas`)
      const factBody = await factRes.json()
      const facturaConSaldo = factBody.facturas?.find((f: any) => Number(f.saldo) > 0)

      if (!facturaConSaldo) {
        test.skip()
        return
      }

      const res = await page.request.post(`${BASE}/api/abonos`, {
        data: {
          facturaId: facturaConSaldo.id,
          clienteId: facturaConSaldo.clienteId,
          monto: Math.min(1000, Number(facturaConSaldo.saldo)),
          metodoPago: 'EFECTIVO',
        },
      })
      expect(res.ok()).toBe(true)
    })
  })

  // ═══════════════════════════════════════════
  // 3. ASISTENTE: acceso limitado
  // ═══════════════════════════════════════════
  test.describe('ASISTENTE — acceso limitado', () => {
    test.beforeEach(async ({ page }) => {
      await login(page, 'asistente1', 'asist123')
    })

    test('Accede a dashboard y pedidos', async ({ page }) => {
      await page.goto(`${BASE}/dashboard`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)
      expect(page.url()).toContain('/dashboard')

      await page.goto(`${BASE}/pedidos`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)
      expect(page.url()).toContain('/pedidos')

      await page.goto(`${BASE}/clientes`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)
      expect(page.url()).toContain('/clientes')
    })

    test('Redirige páginas ADMIN a /dashboard', async ({ page }) => {
      for (const p of ADMIN_PAGES) {
        await page.goto(`${BASE}${p}`)
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(500)
        const url = page.url()
        expect(url).toContain('/dashboard')
      }
    })

    test('Crea cliente (API — permitido)', async ({ page }) => {
      const res = await page.request.post(`${BASE}/api/clientes`, {
        data: { nombre: 'Cliente Asistente Test', telefono: '3009998866' },
      })
      expect(res.ok()).toBe(true)
    })

    test('NO puede crear embarque (API — requiere ADMIN/REPARTIDOR)', async ({ page }) => {
      const trabRes = await page.request.get(`${BASE}/api/trabajadores`)
      const trabBody = await trabRes.json()
      const trabajadorId = trabBody.trabajadores?.[0]?.id

      if (!trabajadorId) {
        test.skip()
        return
      }

      const res = await page.request.post(`${BASE}/api/embarques`, {
        data: { trabajadorId },
      })
      expect(res.status()).toBe(403)
    })

    test('NO puede cerrar día (API — requiere ADMIN)', async ({ page }) => {
      const res = await page.request.post(`${BASE}/api/cierre`, {
        data: {
          numPedidos: 0, totalVentas: 0, cobrado: 0, fiado: 0,
          efectivo: 0, transferencia: 0, nequi: 0, daviplata: 0, bono: 0,
          baseDia: 100000, comisiones: 0, salarios: 0, gastos: 0,
          stockIniAgua: 0, prodAgua: 0, stockFinAgua: 0,
          stockIniHielo: 0, prodHielo: 0, stockFinHielo: 0,
          netoCaja: 100000,
        },
      })
      expect(res.status()).toBe(403)
    })

    test('NO puede crear abono (API — requiere ADMIN/CONTADOR)', async ({ page }) => {
      const factRes = await page.request.get(`${BASE}/api/facturas`)
      const factBody = await factRes.json()
      const factura = factBody.facturas?.[0]

      if (!factura) {
        test.skip()
        return
      }

      const res = await page.request.post(`${BASE}/api/abonos`, {
        data: {
          facturaId: factura.id,
          clienteId: factura.clienteId,
          monto: 1000,
          metodoPago: 'EFECTIVO',
        },
      })
      expect(res.status()).toBe(403)
    })

    test('NO puede crear nómina (API — requiere ADMIN/CONTADOR)', async ({ page }) => {
      const trabRes = await page.request.get(`${BASE}/api/trabajadores`)
      const trabBody = await trabRes.json()
      const trabajadorId = trabBody.trabajadores?.[0]?.id

      if (!trabajadorId) {
        test.skip()
        return
      }

      const res = await page.request.post(`${BASE}/api/nomina`, {
        data: {
          trabajadorId,
          fechaInicio: new Date().toISOString(),
          fechaFin: new Date().toISOString(),
          tipoCalculo: 'MANUAL',
          comEntregasAgua: 0,
          comEntregasHielo: 0,
          totalComisiones: 0,
          salario: 0,
          total: 0,
        },
      })
      expect(res.status()).toBe(403)
    })
  })

  // ═══════════════════════════════════════════
  // 4. CONTADOR: acceso a admin pages + abonos + nómina
  // ═══════════════════════════════════════════
  test.describe('CONTADOR — acceso financiero', () => {
    test.beforeEach(async ({ page }) => {
      await login(page, 'contador', 'cont123')
    })

    test('Accede a páginas ADMIN', async ({ page }) => {
      for (const p of ADMIN_PAGES) {
        await page.goto(`${BASE}${p}`)
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(500)
        const url = page.url()
        expect(url).not.toMatch(/\/dashboard$/)
      }
    })

    test('Crea abono (API)', async ({ page }) => {
      const factRes = await page.request.get(`${BASE}/api/facturas`)
      const factBody = await factRes.json()
      const facturaConSaldo = factBody.facturas?.find((f: any) => Number(f.saldo) > 0)

      if (!facturaConSaldo) {
        test.skip()
        return
      }

      const res = await page.request.post(`${BASE}/api/abonos`, {
        data: {
          facturaId: facturaConSaldo.id,
          clienteId: facturaConSaldo.clienteId,
          monto: Math.min(5000, Number(facturaConSaldo.saldo)),
          metodoPago: 'TRANSFERENCIA',
        },
      })
      expect(res.ok()).toBe(true)
    })

    test('Crea nómina (API)', async ({ page }) => {
      const trabRes = await page.request.get(`${BASE}/api/trabajadores`)
      const trabBody = await trabRes.json()
      const trabajadorId = trabBody.trabajadores?.[0]?.id

      if (!trabajadorId) {
        test.skip()
        return
      }

      const hoy = new Date()
      const hace7 = new Date(hoy)
      hace7.setDate(hace7.getDate() - 7)

      const res = await page.request.post(`${BASE}/api/nomina`, {
        data: {
          trabajadorId,
          fechaInicio: hace7.toISOString(),
          fechaFin: hoy.toISOString(),
          tipoCalculo: 'MANUAL',
          comEntregasAgua: 10000,
          comEntregasHielo: 5000,
          totalComisiones: 15000,
          salario: 0,
          total: 15000,
        },
      })
      expect(res.ok()).toBe(true)
    })

    test('NO puede crear embarque (API — requiere ADMIN/REPARTIDOR)', async ({ page }) => {
      const trabRes = await page.request.get(`${BASE}/api/trabajadores`)
      const trabBody = await trabRes.json()
      const trabajadorId = trabBody.trabajadores?.[0]?.id

      if (!trabajadorId) {
        test.skip()
        return
      }

      const res = await page.request.post(`${BASE}/api/embarques`, {
        data: { trabajadorId },
      })
      expect(res.status()).toBe(403)
    })
  })

  // ═══════════════════════════════════════════
  // 5. CONCURRENCIA: múltiples usuarios simultáneos
  // ═══════════════════════════════════════════
  test.describe('Concurrencia y race conditions', () => {
    test('Dos asistentes crean cliente simultáneamente', async ({ browser }) => {
      const context1 = await browser.newContext()
      const context2 = await browser.newContext()
      const page1 = await context1.newPage()
      const page2 = await context2.newPage()

      await login(page1, 'asistente1', 'asist123')
      await login(page2, 'asistente2', 'asist123')

      const [res1, res2] = await Promise.all([
        page1.request.post(`${BASE}/api/clientes`, {
          data: { nombre: 'Cliente Concurrente 1', telefono: '3001111111' },
        }),
        page2.request.post(`${BASE}/api/clientes`, {
          data: { nombre: 'Cliente Concurrente 2', telefono: '3002222222' },
        }),
      ])

      expect(res1.ok()).toBe(true)
      expect(res2.ok()).toBe(true)

      await context1.close()
      await context2.close()
    })

    test('Admin y contador operan simultáneamente', async ({ browser }) => {
      const context1 = await browser.newContext()
      const context2 = await browser.newContext()
      const page1 = await context1.newPage()
      const page2 = await context2.newPage()

      await login(page1, 'admin', 'admin123')
      await login(page2, 'contador', 'cont123')

      const [resCliente, resFacturas] = await Promise.all([
        page1.request.post(`${BASE}/api/clientes`, {
          data: { nombre: 'Cliente Concurrente Admin', telefono: '3003333333' },
        }),
        page2.request.get(`${BASE}/api/facturas`),
      ])

      expect(resCliente.ok()).toBe(true)
      expect(resFacturas.ok()).toBe(true)

      await context1.close()
      await context2.close()
    })
  })

  // ═══════════════════════════════════════════
  // 6. Flujo completo por rol
  // ═══════════════════════════════════════════
  test.describe('Flujo completo: ASISTENTE', () => {
    test('Crear cliente → pedido → verificar', async ({ page }) => {
      await login(page, 'asistente1', 'asist123')

      // 1. Create client via API
      const clientRes = await page.request.post(`${BASE}/api/clientes`, {
        data: { nombre: 'Cliente Flujo Asistente', telefono: '3005555555', direccion: 'Calle 10 #20-30' },
      })
      expect(clientRes.ok()).toBe(true)

      // 2. Get client ID
      const clientsRes = await page.request.get(`${BASE}/api/clientes`)
      const clientsBody = await clientsRes.json()
      const cliente = clientsBody.clientes?.find((c: any) => c.nombre === 'Cliente Flujo Asistente')

      if (!cliente) {
        test.skip()
        return
      }

      // 3. Create pedido
      const pedidoRes = await page.request.post(`${BASE}/api/pedidos`, {
        data: {
          clienteId: cliente.id,
          productos: { pacaAgua: 2, pacaHielo: 1 },
          pagos: [{ metodo: 'EFECTIVO', monto: 8500 }],
          canal: 'PUNTO',
          ventaRapida: true,
        },
      })

      expect(pedidoRes.ok()).toBe(true)
    })
  })

  test.describe('Flujo completo: CONTADOR', () => {
    test('Ver facturas → hacer abono → verificar saldo', async ({ page }) => {
      await login(page, 'contador', 'cont123')

      // 1. Get factura with saldo
      const factRes = await page.request.get(`${BASE}/api/facturas`)
      const factBody = await factRes.json()
      const facturaConSaldo = factBody.facturas?.find((f: any) => Number(f.saldo) > 0)

      if (!facturaConSaldo) {
        test.skip()
        return
      }

      const saldoOriginal = Number(facturaConSaldo.saldo)
      const montoAbono = Math.min(5000, saldoOriginal)

      // 2. Make abono
      const abonoRes = await page.request.post(`${BASE}/api/abonos`, {
        data: {
          facturaId: facturaConSaldo.id,
          clienteId: facturaConSaldo.clienteId,
          monto: montoAbono,
          metodoPago: 'NEQUI',
        },
      })
      expect(abonoRes.ok()).toBe(true)

      // 3. Verify updated saldo
      const factRes2 = await page.request.get(`${BASE}/api/facturas`)
      const factBody2 = await factRes2.json()
      const facturaActualizada = factBody2.facturas?.find((f: any) => f.id === facturaConSaldo.id)

      if (facturaActualizada) {
        const nuevoSaldo = Number(facturaActualizada.saldo)
        expect(nuevoSaldo).toBeCloseTo(saldoOriginal - montoAbono, 1)
      }
    })
  })
})
