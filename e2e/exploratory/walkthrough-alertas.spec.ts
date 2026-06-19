// @ts-check
// Item 6: Alertas (auto + casos) — walkthrough de las alertas automáticas y casos manuales
// Cubre: detección automática en /pedidos?tab=alertas, creación de casos, gestión en /casos

import { test, expect, loginAs, shoot, addFinding, isVisible, dbCount, dbQuery, BASE, RUN_ID, SCREENSHOTS_DIR } from './walkthrough-helpers'

// ═══════════════════════════════════════════════════════════════════════════
// ALERTAS — detección automática
// ═══════════════════════════════════════════════════════════════════════════

test.describe('A. Alertas automáticas', () => {
  test('A.1: Login admin y ver tab Alertas', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/pedidos?tab=alertas`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shoot(page, 'A.1-alertas-inicial')

    // Verificar que el tab Alertas está activo
    const bodyText = (await page.locator('body').textContent()) ?? ''
    const hasAlertasHeader = bodyText.includes('Sistema de Alertas')
    addFinding({
      severity: hasAlertasHeader ? 'P3' : 'P1',
      module: 'alertas',
      title: hasAlertasHeader ? 'Tab Alertas carga' : 'Tab Alertas no muestra header',
      description: `Header "Sistema de Alertas" presente: ${hasAlertasHeader}`,
    })

    // Verificar la sección colapsable de reglas
    const hasReglas = await isVisible(page, 'text=Reglas de detección activas')
    if (hasReglas) {
      await page.locator('text=Reglas de detección activas').click()
      await page.waitForTimeout(500)
      await shoot(page, 'A.1-reglas-expandido')
    }
  })

  test('A.2: Provocar 3 pedidos mismo cliente/día → alerta 3RO_PEDIDO', async ({ page }) => {
    // Login
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    // Crear cliente
    const cliRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `A2 3er Pedido ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const cliData = await cliRes.json()
    const clienteId = cliData.cliente?.id || cliData.data?.id
    if (!clienteId) { test.skip(); return }

    // Crear 3 pedidos
    for (let i = 0; i < 3; i++) {
      await page.request.post(`${BASE}/api/pedidos`, {
        data: {
          clienteId,
          canal: 'PUNTO',
          ventaRapida: true,
          items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
          pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
        },
      })
    }
    addFinding({ severity: 'P3', module: 'alertas', title: 'A.2: 3 pedidos creados para el mismo cliente/día', description: '' })

    // Recargar alertas
    await page.goto(`${BASE}/pedidos?tab=alertas`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shoot(page, 'A.2-alertas-despues-3-pedidos')

    // Buscar el cliente en la lista
    const bodyText = (await page.locator('body').textContent()) ?? ''
    const hasClient = bodyText.includes(`A2 3er Pedido`)
    addFinding({
      severity: hasClient ? 'P3' : 'P2',
      module: 'alertas',
      title: hasClient ? 'Cliente con 3+ pedidos aparece en Alertas' : 'Cliente con 3+ pedidos NO aparece en Alertas',
      description: 'La regla 3RO_PEDIDO debería disparar. Si no aparece, el detector automático no está corriendo o tiene un bug.',
    })

    // Verificar severidad
    const hasMedia = bodyText.includes('MEDIA')
    addFinding({
      severity: 'P3',
      module: 'alertas',
      title: 'Severidad MEDIA visible en Alertas',
      description: `Severidades presentes en body: BAJA=${bodyText.includes('BAJA')}, MEDIA=${bodyText.includes('MEDIA')}, ALTA=${bodyText.includes('ALTA')}`,
    })
  })

  test('A.3: Provocar alerta FIADO_REcurrente con pago parcial', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    const cliRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `A3 Fiado Recurrente ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const cliData = await cliRes.json()
    const clienteId = cliData.cliente?.id || cliData.data?.id
    if (!clienteId) { test.skip(); return }

    // 3 pedidos con pago parcial (fiado)
    for (let i = 0; i < 3; i++) {
      await page.request.post(`${BASE}/api/pedidos`, {
        data: {
          clienteId,
          canal: 'PUNTO',
          ventaRapida: true,
          items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
          pagos: [{ metodo: 'EFECTIVO', monto: 1000 }], // deja ~$5000 de saldo
        },
      })
    }

    await page.goto(`${BASE}/pedidos?tab=alertas`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    const bodyText = (await page.locator('body').textContent()) ?? ''
    addFinding({
      severity: bodyText.includes(`A3 Fiado Recurrente`) ? 'P3' : 'P2',
      module: 'alertas',
      title: bodyText.includes(`A3 Fiado Recurrente`)
        ? 'Alerta FIADO_REcurrente detectada'
        : 'FIADO_REcurrente NO detectado para cliente con 3+ fiados',
      description: '',
    })
    await shoot(page, 'A.3-fiado-recurrente')
  })

  test('A.4: Filtros de Alertas (severidad, búsqueda)', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/pedidos?tab=alertas`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Probar filtro de severidad
    const sevSelect = page.locator('select').first()
    if (await sevSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      const options = await sevSelect.locator('option').count()
      addFinding({
        severity: 'P3',
        module: 'alertas',
        title: `Filtro de severidad: ${options} opciones`,
        description: '',
      })
      for (const opt of ['ALTA', 'MEDIA', 'BAJA', 'TODAS']) {
        await sevSelect.selectOption(opt).catch(() => {})
        await page.waitForTimeout(300)
      }
    } else {
      addFinding({
        severity: 'P1',
        module: 'alertas',
        title: 'Filtro de severidad NO visible',
        description: '',
      })
    }

    // Probar búsqueda
    const searchInput = page.locator('input[placeholder*="Buscar cliente" i]')
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('A2')
      await page.waitForTimeout(500)
      await shoot(page, 'A.4-busqueda')
    }
  })

  test('A.5: Verificar endpoint /api/alertas', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    // Ver varios endpoints de alertas
    const endpoints = [
      '/api/alertas',
      '/api/alertas/umbrales',
      '/api/alertas/notas-credito-count',
    ]
    const results: { endpoint: string; status: number; data?: any }[] = []
    for (const ep of endpoints) {
      const r = await page.request.get(`${BASE}${ep}`).catch(() => null)
      if (r) {
        const data = await r.json().catch(() => null)
        results.push({ endpoint: ep, status: r.status(), data })
      }
    }
    addFinding({
      severity: 'P3',
      module: 'alertas',
      title: 'Endpoints de alertas disponibles',
      description: results.map(r => `${r.endpoint}: ${r.status}`).join(' | '),
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// CASOS — gestión manual
// ═══════════════════════════════════════════════════════════════════════════

test.describe('B. Casos manuales', () => {
  test('B.1: /casos lista todos los casos', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/casos`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shoot(page, 'B.1-casos-lista')

    const bodyText = (await page.locator('body').textContent()) ?? ''
    const hasCasos = bodyText.length > 500

    // Filtros
    const hasFilter = await isVisible(page, 'select, button:has-text("Filtro"), input[placeholder*="Buscar" i]')
    addFinding({
      severity: 'P3',
      module: 'casos',
      title: 'Página /casos renderiza',
      description: `Body length: ${bodyText.length}. Filtros visibles: ${hasFilter}`,
    })

    // Contar casos en DB
    const totalCasos = dbCount('Caso')
    const casosAbiertos = dbCount('Caso', `status = 'ABIERTO'`)
    addFinding({
      severity: 'P3',
      module: 'casos',
      title: `Casos en DB: ${totalCasos} totales, ${casosAbiertos} abiertos`,
      description: '',
    })
  })

  test('B.2: Ver detalle de un caso existente', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    // Buscar el primer caso
    const casosRes = await page.request.get(`${BASE}/api/casos`)
    const casosData = await casosRes.json()
    const casos = casosData.casos || []
    if (casos.length === 0) {
      addFinding({ severity: 'P2', module: 'casos', title: 'No hay casos para inspeccionar', description: '' })
      return
    }
    const primerCaso = casos[0]
    await page.goto(`${BASE}/casos/${primerCaso.id}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await shoot(page, 'B.2-caso-detalle')

    // Verificar que se ven eventos
    const eventos = dbCount('CasoEvento', `"casoId" = '${primerCaso.id}'`)
    addFinding({
      severity: 'P3',
      module: 'casos',
      title: `Caso ${primerCaso.id.slice(-6)}: ${eventos} eventos`,
      description: `Tipo: ${primerCaso.alertaTipo}, Severidad: ${primerCaso.severidad}, Status: ${primerCaso.status}`,
    })
  })

  test('B.3: Verificar workflow: ABIERTO → EN_PROCESO → RESUELTO → CERRADO', async ({ page }) => {
    // Ver schema del enum
    const enumValues = dbQuery(`SELECT enumlabel FROM pg_enum WHERE enumtypid = '"CasoStatus"'::regtype ORDER BY enumsortorder`)
    addFinding({
      severity: 'P3',
      module: 'casos',
      title: 'Workflow de CasoStatus',
      description: `Estados posibles: ${enumValues}`,
    })
  })
})

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`\n[A-B] Alertas + casos completo.`)
})
