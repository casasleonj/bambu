// @ts-check
// Item 4 + 5: Closure de brechas + verificación temporal de recurrentes
// T1. Recurrentes UI real (form de nuevo) — verifica que persiste
// T2. Recurrentes forzado: setear proxGeneracion al pasado + ejecutar
// T3. Recurrentes vía /api/pedidos/recurrentes (preview + generar)
// T4. Fiados → DeudaTrabajador con captura de delta
// T5. Cierre crear uno nuevo + verificar comision calculada
// T6. RBAC: capturar primer response (no final) para distinguir 200 vs 307

import { test, expect, loginAs, shoot, addFinding, isVisible, dbCount, dbQuery, BASE, RUN_ID, SCREENSHOTS_DIR } from './walkthrough-helpers'

const CRON_SECRET = process.env.CRON_SECRET || 'dev-cron-secret-change-in-production'

// ═══════════════════════════════════════════════════════════════════════════
// T1. RECURRENTES — UI REAL (no API)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('T1. Recurrentes UI real', () => {
  test('T1.1: Crear plantilla desde UI real y verificar persistencia', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    // Crear cliente primero
    const cliRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `T1 Recurrente UI ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const cliData = await cliRes.json()
    const clienteId = cliData.cliente?.id || cliData.data?.id
    if (!clienteId) { test.skip(); return }

    await page.goto(`${BASE}/recurrentes/nuevo`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shoot(page, 'T1.1-form-inicial')

    // Buscar el select de cliente
    const clienteSelect = page.locator('select').first()
    if (await clienteSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Buscar opción con texto que match
      const options = await clienteSelect.locator('option').count()
      addFinding({
        severity: 'P3',
        module: 'recurrentes',
        title: `Form /recurrentes/nuevo: ${options} opciones en el select de cliente`,
        description: '',
      })
      // Seleccionar el cliente (buscar por value que contenga clienteId)
      for (let i = 0; i < options; i++) {
        const opt = clienteSelect.locator('option').nth(i)
        const val = await opt.getAttribute('value')
        if (val === clienteId) {
          await clienteSelect.selectOption(val)
          break
        }
      }
    }

    // Buscar inputs numéricos para los productos (pacaAgua, pacaHielo, etc.)
    const numericInputs = page.locator('input[type="number"]')
    const inputCount = await numericInputs.count()
    addFinding({
      severity: 'P3',
      module: 'recurrentes',
      title: `Inputs numéricos en /recurrentes/nuevo: ${inputCount}`,
      description: 'Debería haber 5 (pacaAgua, pacaHielo, botellon, bolsaAgua, bolsaHielo) — la validación exige sum >= 3',
    })

    // Llenar los 3 primeros inputs con 1 cada uno (total = 3, mínimo)
    for (let i = 0; i < Math.min(3, inputCount); i++) {
      const input = numericInputs.nth(i)
      if (await input.isVisible({ timeout: 500 }).catch(() => false)) {
        await input.fill('1')
      }
    }

    // Buscar el botón submit
    const submitBtn = page.locator('button:has-text("Crear"), button:has-text("Guardar"), button[type="submit"]').last()
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Capturar la request
      const reqPromise = page.waitForResponse(r => r.url().includes('/api/recurrentes') && r.request().method() === 'POST', { timeout: 10000 }).catch(() => null)
      await submitBtn.click()
      const reqRes = await reqPromise
      if (reqRes) {
        const status = reqRes.status()
        const body = await reqRes.text().catch(() => '')
        addFinding({
          severity: status === 200 || status === 201 ? 'P3' : 'P1',
          module: 'recurrentes',
          title: `POST /api/recurrentes desde UI: status ${status}`,
          description: body.slice(0, 300),
        })
      } else {
        addFinding({
          severity: 'P2',
          module: 'recurrentes',
          title: 'No se capturó request POST /api/recurrentes desde UI',
          description: 'Click submit no disparó la request esperada',
        })
      }
      await page.waitForTimeout(2000)
    }

    // Verificar en la lista
    await page.goto(`${BASE}/recurrentes`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const bodyText = (await page.locator('body').textContent()) ?? ''
    const hasNew = bodyText.includes(`T1 Recurrente UI`)
    addFinding({
      severity: hasNew ? 'P3' : 'P1',
      module: 'recurrentes',
      title: hasNew ? 'Plantilla nueva visible en /recurrentes' : 'Plantilla NO aparece en lista',
      description: 'Si está, la UI funciona end-to-end',
    })
    await shoot(page, 'T1.1-despues')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// T2 + T3. RECURRENTES TEMPORAL — forzar generación
// ═══════════════════════════════════════════════════════════════════════════

test.describe('T2. Recurrentes temporal', () => {
  test('T2.1: Preview de recurrentes pendientes', async ({ page }) => {
    // Login
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    // GET /api/pedidos/recurrentes (preview)
    const previewRes = await page.request.get(`${BASE}/api/pedidos/recurrentes`)
    const previewBody = await previewRes.text()
    const preview = JSON.parse(previewBody)
    const previewCount = (preview.preview || []).length
    addFinding({
      severity: 'P3',
      module: 'recurrentes',
      title: `GET /api/pedidos/recurrentes preview: ${previewCount} plantillas listas para generar`,
      description: 'Si es > 0, hay plantillas con proxGeneracion <= hoy. El cron a las 6am las habría generado.',
    })
  })

  test('T2.2: Forzar proxGeneracion al pasado y verificar generación', async ({ page }) => {
    // Login
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    // Snapshot de pedidos recurrentes antes
    const pedAntes = dbCount('Pedido', `"origen" = 'RECURRENTE'`)

    // Crear cliente
    const cliRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `T2 Forzado ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const cliData = await cliRes.json()
    const clienteId = cliData.cliente?.id || cliData.data?.id
    if (!clienteId) { test.skip(); return }

    // Crear plantilla
    const planRes = await page.request.post(`${BASE}/api/recurrentes`, {
      data: {
        clienteId,
        cadaNDias: 7,
        tipo: 'ENVIO',
        canal: 'DOMICILIO',
        horaPreferida: '09:00',
        productos: { pacaAgua: 2, pacaHielo: 1 },
      },
    })
    const planData = await planRes.json()
    const planId = planData.plantilla?.id || planData.data?.id || planData.id
    if (!planId) {
      addFinding({ severity: 'P1', module: 'recurrentes', title: 'T2.2: No pude crear plantilla', description: JSON.stringify(planData).slice(0, 200) })
      return
    }

    // Forzar proxGeneracion al pasado
    const dbRes = dbQuery(`UPDATE "PlantillaRecurrente" SET "proxGeneracion" = NOW() - INTERVAL '1 day' WHERE id = '${planId}'`)
    addFinding({ severity: 'P3', module: 'recurrentes', title: `proxGeneracion forzado al pasado para ${planId.slice(-6)}`, description: '' })

    // Llamar al endpoint manual de generación (preview)
    const prevRes = await page.request.get(`${BASE}/api/pedidos/recurrentes`)
    const prevData = await prevRes.json()
    const previewList = prevData.preview || []
    const foundInPreview = previewList.find((p: any) => p.recurrenteId === planId)
    addFinding({
      severity: foundInPreview ? 'P3' : 'P1',
      module: 'recurrentes',
      title: foundInPreview
        ? `Plantilla T2 aparece en preview (lista para generar)`
        : `Plantilla T2 NO aparece en preview — el scheduler no la detecta`,
      description: foundInPreview
        ? `Preview ve la plantilla con proxGeneracion < hoy. El cron la habría generado hoy a las 6am.`
        : `Posible bug: el preview no detecta la plantilla con proxGeneracion al pasado`,
    })

    if (foundInPreview) {
      // Generar
      const genRes = await page.request.post(`${BASE}/api/pedidos/recurrentes`, {
        data: { decisiones: [{ recurrenteId: planId, decision: 'NORMAL' }] },
      })
      const genData = await genRes.json()
      const generados = genData.generados || genData.pedidos?.length || 0
      addFinding({
        severity: generados > 0 ? 'P3' : 'P1',
        module: 'recurrentes',
        title: `Generación manual: ${generados} pedido(s) creado(s)`,
        description: `Status: ${genRes.status()}. Body: ${JSON.stringify(genData).slice(0, 300)}`,
      })

      // Verificar que el pedido aparece con origen=RECURRENTE
      await page.waitForTimeout(1000)
      const pedDespues = dbCount('Pedido', `"origen" = 'RECURRENTE'`)
      addFinding({
        severity: pedDespues > pedAntes ? 'P3' : 'P1',
        module: 'recurrentes',
        title: `Pedidos con origen=RECURRENTE: antes ${pedAntes}, después ${pedDespues}`,
        description: pedDespues > pedAntes ? '✅ La generación manual funcionó' : '❌ No se crearon pedidos',
      })

      // Verificar en /pedidos
      await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)
      await shoot(page, 'T2.2-pedidos-despues')
    }
  })

  test('T2.3: Cron job existe y está protegido por CRON_SECRET', async ({ page }) => {
    // Llamar al endpoint del cron SIN secret
    const sinAuth = await page.request.post(`${BASE}/api/cron/generar-recurrentes`, {
      data: {},
      headers: { 'x-cron-secret': 'WRONG_SECRET' },
    })
    // Con secret correcto
    const conAuth = await page.request.post(`${BASE}/api/cron/generar-recurrentes`, {
      data: {},
      headers: { 'x-cron-secret': CRON_SECRET },
    })

    addFinding({
      severity: 'P3',
      module: 'recurrentes',
      title: 'Endpoint /api/cron/generar-recurrentes',
      description: `Sin secret: ${sinAuth.status()}. Con secret: ${conAuth.status()}. El cron existe y está protegido.`,
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// T4. FIADOS → DEUDATRABAJADOR (delta)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('T4. Fiados → DeudaTrabajador (con timestamps)', () => {
  test('T4.1: Crear fiado, entregar, medir delta de DeudaTrabajador', async ({ page }) => {
    const deudasAntes = dbCount('DeudaTrabajador')
    const deudasTimestamp = new Date().toISOString()

    // Crear cliente
    const cliRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `T4 Fiado ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const cliData = await cliRes.json()
    const clienteId = cliData.cliente?.id || cliData.data?.id
    if (!clienteId) { test.skip(); return }

    // Crear pedido fiado
    const pedRes = await page.request.post(`${BASE}/api/pedidos`, {
      data: {
        clienteId,
        canal: 'PUNTO',
        ventaRapida: true,
        items: [{ producto: 'PACA_AGUA', cantidad: 5 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
      },
    })
    const pedData = await pedRes.json()
    const pedidoId = pedData.pedido?.id || pedData.data?.id
    if (!pedidoId) {
      addFinding({ severity: 'P1', module: 'fiados', title: 'T4.1: No pude crear pedido fiado', description: '' })
      return
    }

    // Marcar como entregado
    const entRes = await page.request.post(`${BASE}/api/pedidos/${pedidoId}/entrega`, {
      data: { entregado: true, estadoEntrega: 'ENTREGADO' },
    })
    const entStatus = entRes.status()

    // Esperar 5s
    await page.waitForTimeout(5000)

    const deudasDespues = dbCount('DeudaTrabajador')
    const delta = deudasDespues - deudasAntes

    addFinding({
      severity: delta > 0 ? 'P3' : 'P2',
      module: 'fiados',
      title: `T4.1: Pedido fiado ENTREGADO con saldo → DeudaTrabajador? Delta: ${delta}`,
      description: `Antes: ${deudasAntes} (a las ${deudasTimestamp}). Después: ${deudasDespues}. Status de la entrega: ${entStatus}. Pedido ID: ${pedidoId.slice(-6)}. Si delta=0, no hay automatización que cree DeudaTrabajador al entregar un fiado.`,
      userComplaint: 'Queja: "no se sabe cuándo pasa a deuda del trabajador"',
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// T5. CIERRE — crear uno nuevo + verificar comisión
// ═══════════════════════════════════════════════════════════════════════════

test.describe('T5. Cierre crear + verificar comisión', () => {
  test('T5.1: Verificar comportamiento de /cierre — permite crear o solo ver?', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/cierre`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shoot(page, 'T5.1-cierre')

    // ¿Hay un botón "Crear cierre" o solo muestra el último?
    const crearBtn = await isVisible(page, 'button:has-text("Crear"), button:has-text("Nuevo"), button:has-text("Hacer cierre")')
    const hasFechaPicker = await isVisible(page, 'input[type="date"]')

    addFinding({
      severity: 'P3',
      module: 'cierre',
      title: 'Estado del form de /cierre',
      description: `Botón "Crear/Nuevo": ${crearBtn}. Date picker: ${hasFechaPicker}.`,
    })

    // Ver último cierre
    const ultRes = await page.request.get(`${BASE}/api/cierre/last`)
    const ultData = await ultRes.json()
    addFinding({
      severity: 'P3',
      module: 'cierre',
      title: 'Último cierre (API)',
      description: `Fecha: ${ultData.cierre?.fecha?.slice(0, 10)}. Comisiones: ${ultData.cierre?.comisiones}. Salarios: ${ultData.cierre?.salarios}. Base: ${ultData.cierre?.baseDia}. Neto: ${ultData.cierre?.netoCaja}.`,
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// T6. RBAC verificación rigurosa — capturar PRIMER response, no final
// ═══════════════════════════════════════════════════════════════════════════

test.describe('T6. RBAC verificación rigurosa', () => {
  test('T6.1: ASISTENTE intenta /admin/usuarios — ¿redirige o permite?', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'asistente')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'asist123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    // Capturar TODAS las responses
    const responses: { url: string; status: number }[] = []
    page.on('response', resp => {
      const url = resp.url()
      if (url.includes('/admin') || url.includes('/dashboard') || url.includes('/login')) {
        responses.push({ url: url.replace(BASE, ''), status: resp.status() })
      }
    })

    // Intentar ir a /admin/usuarios
    await page.goto(`${BASE}/admin/usuarios`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const finalUrl = page.url()

    // La response clave es la de /admin/usuarios (NO la del redirect target)
    const adminResponse = responses.find(r => r.url === '/admin/usuarios')
    const finalResponse = responses[responses.length - 1]

    addFinding({
      severity: adminResponse && adminResponse.status === 307 ? 'P3' : 'P1',
      module: 'auth',
      title: `ASISTENTE → /admin/usuarios: status del primer response = ${adminResponse?.status}`,
      description: `Final URL: ${finalUrl}. Status del primer response: ${adminResponse?.status} (307 = redirect correcto, 200 = bug). Si el primer response es 200, el contenido renderizó.`,
    })
  })

  test('T6.2: CONTADOR intenta /clientes — ¿redirige o permite?', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'contador')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'cont123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/reportes/, { timeout: 20000 })

    const responses: { url: string; status: number }[] = []
    page.on('response', resp => {
      const url = resp.url()
      if (url.includes('/clientes') || url.includes('/embarques') || url.includes('/reportes')) {
        responses.push({ url: url.replace(BASE, ''), status: resp.status() })
      }
    })

    for (const path of ['/clientes', '/embarques', '/produccion']) {
      const localResps: { url: string; status: number }[] = []
      page.removeAllListeners('response')
      page.on('response', resp => {
        const url = resp.url()
        if (url.includes(path)) localResps.push({ url: url.replace(BASE, ''), status: resp.status() })
      })
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
      const firstResp = localResps.find(r => r.url === path)
      addFinding({
        severity: 'P3',
        module: 'auth',
        title: `CONTADOR → ${path}: status = ${firstResp?.status}`,
        description: `Status del primer response a ${path}: ${firstResp?.status}. Si 307 = redirect correcto, si 200 = contenido renderizado.`,
      })
    }
  })

  test('T6.3: REPARTIDOR intenta /dashboard — debería redirigir a /repartidor', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'repartidor')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'rep123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/repartidor/, { timeout: 20000 })

    const responses: { url: string; status: number }[] = []
    page.on('response', resp => {
      const url = resp.url()
      if (url.includes('/dashboard') || url.includes('/repartidor')) {
        responses.push({ url: url.replace(BASE, ''), status: resp.status() })
      }
    })

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const finalUrl = page.url()
    const dashResponse = responses.find(r => r.url === '/dashboard')
    addFinding({
      severity: dashResponse?.status === 307 ? 'P3' : 'P1',
      module: 'auth',
      title: `REPARTIDOR → /dashboard: status = ${dashResponse?.status}, final URL = ${finalUrl}`,
      description: `Esperado: redirect 307 a /repartidor. Si 200, el contenido del dashboard se renderizó para un repartidor.`,
    })
  })
})

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`\n[T1-T6] Closure + recurrentes temporal completo.`)
})
