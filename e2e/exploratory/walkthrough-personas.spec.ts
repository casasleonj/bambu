// @ts-check
// Item 7: Walkthrough por persona — cada rol hace su jornada típica
// Ejecutar en paralelo con --workers=4

import { test, expect, loginAs, shoot, addFinding, isVisible, dbCount, dbQuery, BASE, RUN_ID, SCREENSHOTS_DIR } from './walkthrough-helpers'

// ═══════════════════════════════════════════════════════════════════════════
// PERSONA: ADMIN — supervisa todo
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Persona ADMIN', () => {
  test('P-ADMIN.1: Login → dashboard → ver stats de hoy', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.waitForTimeout(3000)
    await shoot(page, 'P-ADMIN-dashboard')

    const bodyText = (await page.locator('body').textContent()) ?? ''
    const stats = {
      pedidos: bodyText.match(/(\d+)\s*pendientes/i)?.[1],
      ventas: bodyText.match(/\$\s*([\d.,]+)/)?.[1],
      fiados: bodyText.includes('Fiado') || bodyText.includes('fiado'),
      alertas: bodyText.includes('Alerta') || bodyText.includes('alerta'),
    }
    addFinding({
      severity: 'P3',
      module: 'dashboard',
      title: 'ADMIN ve stats de hoy en dashboard',
      description: `Pedidos pendientes: ${stats.pedidos}, Ventas: $${stats.ventas}, Fiados: ${stats.fiados}, Alertas: ${stats.alertas}`,
    })
  })

  test('P-ADMIN.2: Navega a módulos principales desde sidebar', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    // Visitar las 8 rutas principales que un admin toca en su día
    const modulos = [
      { path: '/pedidos', name: 'Pedidos' },
      { path: '/clientes', name: 'Clientes' },
      { path: '/embarques', name: 'Embarques' },
      { path: '/produccion', name: 'Producción' },
      { path: '/casos', name: 'Casos' },
      { path: '/nomina', name: 'Nómina' },
      { path: '/reportes', name: 'Reportes' },
      { path: '/admin/usuarios', name: 'Usuarios' },
    ]
    for (const m of modulos) {
      await page.goto(`${BASE}${m.path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
      const status = page.url().includes(m.path) ? 'OK' : 'REDIRECTED'
      addFinding({
        severity: 'P3',
        module: 'admin-persona',
        title: `ADMIN → ${m.name}: ${status}`,
        description: `URL final: ${page.url()}`,
      })
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PERSONA: ASISTENTE — operativa diaria
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Persona ASISTENTE', () => {
  test('P-ASIST.1: Crear pedido de venta rápida', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'asistente')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'asist123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    // Crear cliente
    const cliRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `P-ASIST Cliente ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const cliData = await cliRes.json()
    const clienteId = cliData.cliente?.id || cliData.data?.id

    if (!clienteId) { test.skip(); return }

    // Crear pedido vía API como lo haría el asistente
    const pedRes = await page.request.post(`${BASE}/api/pedidos`, {
      data: {
        clienteId,
        canal: 'PUNTO',
        ventaRapida: true,
        items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 5600 }],
      },
    })
    addFinding({
      severity: pedRes.ok() ? 'P3' : 'P1',
      module: 'asistente-persona',
      title: `ASISTENTE crea pedido: status ${pedRes.status()}`,
      description: '',
    })

    // Verificar en /pedidos
    await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await shoot(page, 'P-ASIST-pedidos')
  })

  test('P-ASIST.2: Verificar permisos: NO accede a /admin/usuarios', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'asistente')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'asist123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    const responses: { url: string; status: number }[] = []
    page.on('response', resp => {
      const url = resp.url()
      if (url.includes('/admin/usuarios') || url.includes('/dashboard')) {
        responses.push({ url: url.replace(BASE, ''), status: resp.status() })
      }
    })

    await page.goto(`${BASE}/admin/usuarios`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const adminResp = responses.find(r => r.url === '/admin/usuarios')
    addFinding({
      severity: adminResp?.status === 307 ? 'P3' : 'P1',
      module: 'asistente-persona',
      title: `ASISTENTE intenta /admin/usuarios: ${adminResp?.status}`,
      description: `Final URL: ${page.url()}. 307 = redirect correcto (RBAC funciona).`,
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PERSONA: CONTADOR — reportes y cierres
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Persona CONTADOR', () => {
  test('P-CONT.1: Login → /reportes → navegar reportes', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'contador')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'cont123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/reportes/, { timeout: 20000 })
    await page.waitForTimeout(2000)
    await shoot(page, 'P-CONT-reportes')

    const bodyText = (await page.locator('body').textContent()) ?? ''
    addFinding({
      severity: bodyText.length > 500 ? 'P3' : 'P1',
      module: 'contador-persona',
      title: 'CONTADOR ve /reportes',
      description: `Body: ${bodyText.length} chars`,
    })

    // Ver reportes adicionales
    const subReportes = ['/cierre', '/deudas', '/nomina']
    for (const r of subReportes) {
      await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
      const status = page.url().includes(r) ? 'OK' : 'REDIRECTED'
      addFinding({
        severity: 'P3',
        module: 'contador-persona',
        title: `CONTADOR → ${r}: ${status}`,
        description: '',
      })
    }
  })

  test('P-CONT.2: CONTADOR NO accede a /produccion (debe redirigir)', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'contador')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'cont123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/reportes/, { timeout: 20000 })

    const responses: { url: string; status: number }[] = []
    page.on('response', resp => {
      const url = resp.url()
      if (url.includes('/produccion')) {
        responses.push({ url: url.replace(BASE, ''), status: resp.status() })
      }
    })
    await page.goto(`${BASE}/produccion`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const prodResp = responses.find(r => r.url === '/produccion')
    addFinding({
      severity: prodResp?.status === 307 ? 'P3' : 'P1',
      module: 'contador-persona',
      title: `CONTADOR → /produccion: ${prodResp?.status} (esperado 307)`,
      description: `Final URL: ${page.url()}`,
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PERSONA: REPARTIDOR — vista simplificada
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Persona REPARTIDOR', () => {
  test('P-REP.1: Login → /repartidor → ver embarques', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'repartidor')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'rep123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/repartidor/, { timeout: 20000 })
    await page.waitForTimeout(2000)
    await shoot(page, 'P-REP-vista')

    const bodyText = (await page.locator('body').textContent()) ?? ''
    addFinding({
      severity: bodyText.length > 200 ? 'P3' : 'P1',
      module: 'repartidor-persona',
      title: 'REPARTIDOR ve /repartidor',
      description: `Body: ${bodyText.length} chars. URL: ${page.url()}`,
    })
  })

  test('P-REP.2: REPARTIDOR NO ve /dashboard (debe redirigir)', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'repartidor')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'rep123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/repartidor/, { timeout: 20000 })

    const responses: { url: string; status: number }[] = []
    page.on('response', resp => {
      const url = resp.url()
      if (url.includes('/dashboard') || url.includes('/clientes') || url.includes('/pedidos')) {
        responses.push({ url: url.replace(BASE, ''), status: resp.status() })
      }
    })

    for (const path of ['/dashboard', '/clientes', '/pedidos']) {
      const localResps: { url: string; status: number }[] = []
      page.removeAllListeners('response')
      page.on('response', resp => {
        const url = resp.url()
        if (url.includes(path)) localResps.push({ url: url.replace(BASE, ''), status: resp.status() })
      })
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
      const resp = localResps.find(r => r.url === path)
      addFinding({
        severity: resp?.status === 307 ? 'P3' : 'P1',
        module: 'repartidor-persona',
        title: `REPARTIDOR → ${path}: ${resp?.status} (esperado 307)`,
        description: `Final URL: ${page.url()}`,
      })
    }
  })

  test('P-REP.3: Ver /mi-perfil', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'repartidor')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'rep123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/repartidor/, { timeout: 20000 })

    await page.goto(`${BASE}/mi-perfil`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await shoot(page, 'P-REP-mi-perfil')

    const bodyText = (await page.locator('body').textContent()) ?? ''
    addFinding({
      severity: bodyText.length > 100 ? 'P3' : 'P1',
      module: 'repartidor-persona',
      title: 'REPARTIDOR ve /mi-perfil',
      description: `Body: ${bodyText.length} chars`,
    })
  })
})

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`\n[Personas] Walkthrough por rol completo.`)
})
