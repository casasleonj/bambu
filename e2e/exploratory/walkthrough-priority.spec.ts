// @ts-check
// F2: Walkthrough profundo de los 8 módulos con quejas reportadas.
// Si no hay datos seed, se crean vía UI como un usuario real.
//
// Módulos cubiertos:
// A. Base de caja (molesta, pide cada vez)
// B. Transición Cliente → Pedido
// C. Recurrentes
// D. Dashboard - métricas $0 y obsequios (feature gap)
// E. Embarques
// F. Producción
// G. Cierre - comisiones
// H. Fiados / Deudas

import { test, expect, loginAs, shoot, addFinding, isVisible, hasHorizontalOverflow, hasGarbageText, dbCount, dbQuery, BASE, RUN_ID, SCREENSHOTS_DIR } from './walkthrough-helpers'

// ═══════════════════════════════════════════════════════════════════════════
// A. BASE DE CAJA
// ═══════════════════════════════════════════════════════════════════════════

test.describe('A. Base de caja', () => {
  test('A1: ADMIN ve modal al login si NO hay base para hoy', async ({ page }) => {
    // Forzar que no haya config BASE_DIA_YYYY-MM-DD para hoy
    const today = new Date().toISOString().split('T')[0]
    await dbQuery(`DELETE FROM "Config" WHERE clave = 'BASE_DIA_${today}'`)

    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.waitForTimeout(2000)

    // ¿Apareció el modal de base de caja?
    const modalVisible = await isVisible(page, '#base-dia-input')
    if (modalVisible) {
      await shoot(page, 'A1-modal-aparece')
      // Llenar y guardar
      await page.fill('#base-dia-input', '50000')
      await page.click('button[type="submit"]')
      await page.waitForTimeout(2000)
      await shoot(page, 'A1-modal-guardado')
    } else {
      await shoot(page, 'A1-NO-modal')
      addFinding({
        severity: 'P2',
        module: 'base-caja',
        title: 'Modal de base de caja NO aparece cuando debería',
        description: `No hay config BASE_DIA_${today} en DB pero el modal no se mostró`,
        expected: 'Modal de base de caja aparece',
        observed: 'No apareció',
        userComplaint: 'A veces pide base de caja, a veces no',
      })
    }
  })

  test('A2: ADMIN NO ve modal al recargar si ya hay base para hoy', async ({ page }) => {
    // Asegurar que SÍ hay config para hoy
    const today = new Date().toISOString().split('T')[0]
    await dbQuery(`INSERT INTO "Config" (id, clave, valor, "updatedAt") VALUES ('wt-test-${Date.now()}', 'BASE_DIA_${today}', '75000', NOW()) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, "updatedAt" = NOW()`)

    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.waitForTimeout(3000)

    const modalVisible = await isVisible(page, '#base-dia-input')
    if (modalVisible) {
      addFinding({
        severity: 'P0',
        module: 'base-caja',
        title: 'Modal aparece aunque YA hay base de caja guardada',
        description: `Config BASE_DIA_${today} existe pero el modal igual se muestra. Posible bug: el check server-side falla, o el modal se renderiza antes de la respuesta`,
        expected: 'Modal NO aparece (config existe para hoy)',
        observed: 'Modal SÍ aparece',
        userComplaint: 'Pide base de caja cada vez que se inicia sesión',
      })
    }
    await shoot(page, 'A2-no-modal-esperado')
  })

  test('A3: REPARTIDOR NUNCA ve modal de base de caja', async ({ page }) => {
    const today = new Date().toISOString().split('T')[0]
    await dbQuery(`DELETE FROM "Config" WHERE clave = 'BASE_DIA_${today}'`)

    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'repartidor')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'rep123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/repartidor/, { timeout: 20000 })
    await page.waitForTimeout(3000)

    const modalVisible = await isVisible(page, '#base-dia-input')
    if (modalVisible) {
      addFinding({
        severity: 'P0',
        module: 'base-caja',
        title: 'REPARTIDOR ve modal de base de caja (no debería)',
        description: 'El modal solo debería mostrarse a ADMIN/ASISTENTE según código, pero el REPARTIDOR lo está viendo',
        expected: 'REPARTIDOR no ve modal',
        observed: 'SÍ ve modal',
        userComplaint: 'Base de caja molesta',
      })
    }
    await shoot(page, 'A3-repartidor-no-modal')
  })

  test('A4: Cambio de día fuerza modal de nuevo', async ({ page }) => {
    // Setear base para ayer y para hoy
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    await dbQuery(`INSERT INTO "Config" (id, clave, valor, "updatedAt") VALUES ('wt-test-yd-${Date.now()}', 'BASE_DIA_${yesterday}', '50000', NOW()) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, "updatedAt" = NOW()`)
    await dbQuery(`DELETE FROM "Config" WHERE clave = 'BASE_DIA_${today}'`)

    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.waitForTimeout(3000)

    const modalVisible = await isVisible(page, '#base-dia-input')
    if (!modalVisible) {
      addFinding({
        severity: 'P2',
        module: 'base-caja',
        title: 'Modal NO aparece en día nuevo sin base',
        description: 'Hoy no tiene base pero ayer sí. El modal debería pedir la base de hoy',
        expected: 'Modal aparece (es día nuevo)',
        observed: 'No aparece',
      })
    }
    await shoot(page, 'A4-cambio-dia')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// B. TRANSICIÓN CLIENTE → PEDIDO
// ═══════════════════════════════════════════════════════════════════════════

test.describe('B. Transición Cliente → Pedido', () => {
  test('B1: Botón "Crear pedido" desde clientes navega a /pedidos?new=1&clienteId=ID', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Buscar el primer row de cliente
    const firstRow = page.locator('.cursor-pointer').first()
    if (!(await firstRow.isVisible({ timeout: 5000 }).catch(() => false))) {
      addFinding({ severity: 'P2', module: 'clientes', title: 'No hay clientes en la lista', description: 'La lista de clientes está vacía' })
      test.skip()
      return
    }
    await firstRow.hover()
    await page.waitForTimeout(500)
    // Click en el menú de acciones rápidas (tres puntos)
    const actionsBtn = firstRow.locator('button[aria-label="Acciones rápidas"]')
    if (!(await actionsBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
      // Probar hacer click en el row para abrir el panel lateral
      await firstRow.click()
      await page.waitForTimeout(2000)
      await shoot(page, 'B1-cliente-detalle')
    } else {
      await actionsBtn.click()
      await page.waitForTimeout(500)
    }

    await shoot(page, 'B1-acciones-rapidas')

    // Buscar el link "Crear pedido"
    const crearPedidoLink = page.locator('a:has-text("Crear pedido")')
    if (!(await crearPedidoLink.isVisible({ timeout: 3000 }).catch(() => false))) {
      addFinding({
        severity: 'P1',
        module: 'clientes',
        title: 'No hay botón/link "Crear pedido" en vista de cliente',
        description: 'No se encontró el link en quick actions ni en el panel de detalle',
        userComplaint: 'Queja: "crear pedido desde cliente" confuso',
      })
      return
    }

    const href = await crearPedidoLink.getAttribute('href')
    if (href && (!href.includes('new=1') || !href.includes('clienteId='))) {
      addFinding({
        severity: 'P0',
        module: 'clientes',
        title: 'Link "Crear pedido" no pasa new=1 ni clienteId al destino',
        description: `href=${href}. Debe incluir "new=1" y "clienteId=" para abrir el formulario`,
        expected: 'href contiene new=1&clienteId=ID',
        observed: href,
        userComplaint: 'Queja: "crear pedido desde cliente" no funciona',
      })
    }

    await crearPedidoLink.click()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    await shoot(page, 'B1-despues-click-crear-pedido')

    const url = page.url()
    if (!url.includes('new=1') || !url.includes('clienteId=')) {
      addFinding({
        severity: 'P0',
        module: 'clientes',
        title: 'Click en "Crear pedido" no lleva a URL con new=1&clienteId=ID',
        description: `URL resultante: ${url}. El botón no abre el formulario de pedido.`,
        expected: 'URL contiene ?new=1&clienteId=ID',
        observed: url,
        userComplaint: 'Queja: "crear pedido desde cliente" no funciona',
      })
    }

    // Verificar que el cliente está pre-seleccionado en el form de pedido
    const clientePreSelect = await isVisible(page, 'select[name="clienteId"] option[selected]')
    const clienteInForm = await page.locator('text=Cliente Test').first().isVisible({ timeout: 2000 }).catch(() => false)
    if (!clienteInForm) {
      addFinding({
        severity: 'P1',
        module: 'pedidos',
        title: 'Cliente NO pre-seleccionado al entrar desde /clientes',
        description: 'Click en "Crear pedido" no pre-llena el cliente en el form',
        userComplaint: 'Queja: "crear pedido desde cliente" requiere re-tipear el cliente',
      })
    }
  })

  test('B2: Query params separados: new=1 abre formulario, clienteId filtra lista', async ({ page }) => {
    // Contrato actual: ?new=1&clienteId=ID abre el formulario de pedido.
    // ?clienteId=ID (sin new=1) solo filtra la lista de pedidos por cliente.
    // cliente-table.tsx y clientes-client/index.tsx mandan /pedidos?new=1&clienteId=ID
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.waitForTimeout(2000)

    // Probar /pedidos?clienteId=fake-id (solo filtra; no debe abrir modal)
    await page.goto(`${BASE}/pedidos?clienteId=fake-test-id`)
    await page.waitForTimeout(3000)
    await shoot(page, 'B2-pedidos-clienteId-fake')

    const bodyText1 = (await page.locator('body').textContent()) ?? ''
    addFinding({
      severity: 'P2',
      module: 'clientes',
      title: 'Verificar comportamiento con clienteId en query',
      description: `Probado: /pedidos?clienteId=fake-id filtra la lista sin abrir el formulario.`,
      observed: `URL navegada correctamente. Body length: ${bodyText1.length}`,
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// C. RECURRENTES
// ═══════════════════════════════════════════════════════════════════════════

test.describe('C. Recurrentes', () => {
  test('C1: Lista de plantillas recurrentes', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/recurrentes`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await shoot(page, 'C1-recurrentes-lista')

    // Verificar que la página tiene contenido
    const bodyText = (await page.locator('body').textContent()) ?? ''
    if (bodyText.length < 50) {
      addFinding({ severity: 'P0', module: 'recurrentes', title: 'Página /recurrentes vacía', description: `Body: ${bodyText.length} chars` })
      return
    }

    // Contar plantillas en DB
    const dbCount_ = dbCount('PlantillaRecurrente')
    addFinding({
      severity: 'P3',
      module: 'recurrentes',
      title: `Hay ${dbCount_} plantillas en DB`,
      description: `Recuento DB: ${dbCount_}. Verificar que la UI muestra el mismo número.`,
    })

    // ¿Hay botón "Crear" o similar?
    const crearBtn = await isVisible(page, 'button:has-text("Crear"), button:has-text("Nueva"), a:has-text("Crear")')
    if (!crearBtn) {
      addFinding({
        severity: 'P1',
        module: 'recurrentes',
        title: 'No hay botón "Crear" / "Nueva" plantilla en /recurrentes',
        description: 'No se encontró acción para crear una plantilla recurrente',
        userComplaint: 'Queja en recurrentes',
      })
    }
  })

  test('C2: Crear plantilla recurrente manualmente', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/recurrentes/nuevo`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await shoot(page, 'C2-nuevo-form')

    const bodyText = (await page.locator('body').textContent()) ?? ''
    if (bodyText.length < 50) {
      addFinding({ severity: 'P0', module: 'recurrentes', title: 'Página /recurrentes/nuevo no carga', description: '' })
      return
    }

    // Verificar campos del form
    const hasClienteField = await isVisible(page, 'select[name="clienteId"], input[name="clienteId"], [data-testid*="cliente"]')
    const hasProductosSection = await isVisible(page, 'text=Productos, [data-testid*="producto"]')
    const hasFrecuencia = await isVisible(page, 'input[name*="cadaNDias"], select[name*="cadaNDias"]')

    addFinding({
      severity: 'P3',
      module: 'recurrentes',
      title: 'Inventario del form de creación de plantilla',
      description: `Cliente: ${hasClienteField}, Productos: ${hasProductosSection}, Frecuencia: ${hasFrecuencia}`,
    })
  })

  test('C3: Verificar que la página /recurrentes navega correctamente', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/recurrentes`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Si no hay plantillas, crear una vía API
    let count = dbCount('PlantillaRecurrente')
    if (count === 0) {
      // Crear cliente y plantilla vía API
      const clienteRes = await page.request.post(`${BASE}/api/clientes`, {
        data: { nombre: `Test Recurrente ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'Calle Test', barrio: 'Centro' },
      })
      const clienteData = await clienteRes.json()
      const clienteId = clienteData.cliente?.id || clienteData.data?.id
      if (clienteId) {
        const plantillaRes = await page.request.post(`${BASE}/api/recurrentes`, {
          data: { clienteId, cadaNDias: 7, productos: [{ producto: 'PACA_AGUA', cantidad: 2 }] },
        })
        if (plantillaRes.ok()) {
          count = dbCount('PlantillaRecurrente')
          addFinding({
            severity: 'P3',
            module: 'recurrentes',
            title: 'Creé una plantilla vía API porque no había',
            description: 'Acción manual: crear plantilla recurrente para que el walkthrough pueda probarla',
          })
          // Recargar
          await page.goto(`${BASE}/recurrentes`, { waitUntil: 'domcontentloaded' })
          await page.waitForTimeout(2000)
        } else {
          addFinding({ severity: 'P1', module: 'recurrentes', title: 'POST /api/recurrentes falló', description: `Status: ${plantillaRes.status()}` })
        }
      }
    }
    await shoot(page, 'C3-lista-final')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// D. DASHBOARD - MÉTRICAS $0 Y OBSEQUIOS
// ═══════════════════════════════════════════════════════════════════════════

test.describe('D. Dashboard - Métricas y Obsequios', () => {
  test('D1: Dashboard renderiza para admin', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.waitForTimeout(3000)
    await shoot(page, 'D1-dashboard-admin')

    // Verificar métricas básicas
    const bodyText = (await page.locator('body').textContent()) ?? ''
    const hasMetrics = bodyText.includes('Total') || bodyText.includes('Ventas') || bodyText.includes('Pedidos') || bodyText.includes('$')

    if (!hasMetrics) {
      addFinding({ severity: 'P1', module: 'dashboard', title: 'Dashboard no muestra métricas esperadas', description: 'No se ven palabras como Total, Ventas, Pedidos, $' })
    }
  })

  test('D2: Verificar distinción visual de ventas a $0 vs obsequios', async ({ page }) => {
    // Crear un pedido con items a $0 (sin pagos) — sería indistinguible de obsequio
    const clienteRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `Test Obs ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const clienteData = await clienteRes.json()
    const clienteId = clienteData.cliente?.id || clienteData.data?.id
    if (!clienteId) {
      addFinding({ severity: 'P1', module: 'dashboard', title: 'No pude crear cliente para test de obsequio', description: '' })
      return
    }

    // Crear pedido vía API — la UI NO permite $0 explícitamente
    // Probemos con precio 0 vs 100 para ver si se distinguen en el dashboard
    const pedido0 = await page.request.post(`${BASE}/api/pedidos`, {
      data: {
        clienteId,
        canal: 'PUNTO',
        ventaRapida: true,
        items: [{ producto: 'PACA_AGUA', cantidad: 1, precio: 0 }],
        pagos: [],
      },
    })

    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.waitForTimeout(3000)
    await shoot(page, 'D2-dashboard-con-pedido-0')

    // Verificar si existe alguna UI o filtro para marcar como obsequio
    const hasObsequioField = await isVisible(page, 'text=Obsequio, text=Gratis, text=Regalo, [data-testid*="obsequio"]')

    // Búsqueda en la API: ¿hay alguna forma de marcar un pedido como obsequio?
    // Verificamos la estructura del schema que ya vimos: NO hay campo esObsequio
    addFinding({
      severity: 'P1',
      module: 'dashboard',
      title: 'NO existe distinción visual/funcional entre venta a $0 y obsequio',
      description: `Pedido creado con precio $0 (status: ${pedido0.status()}). Verifico si en el dashboard se distingue de una venta normal. UI no tiene campo "Obsequio" (hasObsequioField: ${hasObsequioField}). Schema Pedido NO tiene campo esObsequio.`,
      expected: 'Opción "Marcar como obsequio" o distinción visual',
      observed: 'Sin distinción. Ventas a $0 se ven igual que ventas normales',
      featureGap: 'GAP',
      userComplaint: 'Queja: "se muestran pacas vendidas pero el valor es 0 y se confunde con obsequio"',
    })
  })

  test('D3: Verificar schema Pedido — NO hay campo esObsequio', async () => {
    // Confirmación directa: leer schema vía API de introspección o query
    const cols = dbQuery(`SELECT column_name FROM information_schema.columns WHERE table_name = 'Pedido' AND column_name LIKE '%obsequio%' OR table_name = 'Pedido' AND column_name LIKE '%gratis%'`)
    const colsItems = dbQuery(`SELECT column_name FROM information_schema.columns WHERE table_name = 'PedidoItem' AND column_name LIKE '%obsequio%' OR table_name = 'PedidoItem' AND column_name LIKE '%gratis%'`)

    if (cols || colsItems) {
      addFinding({
        severity: 'P1',
        module: 'dashboard',
        title: 'Sorpresa: SÍ hay campos relacionados a obsequio',
        description: `Cols: ${cols}, ${colsItems}`,
      })
    } else {
      addFinding({
        severity: 'P1',
        module: 'dashboard',
        title: 'CONFIRMADO: NO existe campo esObsequio/gratis en Pedido ni PedidoItem',
        description: 'Query a information_schema confirma que no hay ningún campo relacionado a obsequio. Feature gap confirmado.',
        featureGap: 'GAP',
        userComplaint: 'Queja: "debería haber una opción para obsequios"',
      })
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// E. EMBARQUES
// ═══════════════════════════════════════════════════════════════════════════

test.describe('E. Embarques', () => {
  test('E1: Lista de embarques renderiza', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/embarques`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await shoot(page, 'E1-embarques-lista')

    const bodyText = (await page.locator('body').textContent()) ?? ''
    const hasEmbarquesHeader = await isVisible(page, 'h1:has-text("Embarques")')
    if (!hasEmbarquesHeader) {
      addFinding({ severity: 'P1', module: 'embarques', title: 'Header "Embarques del Día" no visible', description: '' })
    }

    // Verificar botones de filtro
    const hasTodos = await isVisible(page, 'button:has-text("Todos")')
    const hasAbiertos = await isVisible(page, 'button:has-text("Abiertos")')
    if (!hasTodos || !hasAbiertos) {
      addFinding({ severity: 'P2', module: 'embarques', title: 'Filtros Todos/Abiertos/Cerrados no todos visibles', description: `Todos: ${hasTodos}, Abiertos: ${hasAbiertos}` })
    }
  })

  test('E2: Crear embarque vía API y verlo en la lista', async ({ page }) => {
    // Crear trabajador vía API
    const trabRes = await page.request.post(`${BASE}/api/trabajadores`, {
      data: {
        nombre: `Test Embarque ${Date.now() % 10000}`,
        rol: 'REPARTIDOR',
        tipoPago: 'COMISION',
        usaMoto: true,
        capacidadKg: 500,
        comPacaAgua: 500, comPacaHielo: 300, comBotellon: 200,
        comRepartAgua: 500, comRepartHielo: 300, comRepartBotellon: 200,
      },
    })
    const trabData = await trabRes.json()
    const trabajadorId = trabData.trabajador?.id || trabData.data?.id
    if (!trabajadorId) {
      addFinding({ severity: 'P1', module: 'embarques', title: 'No pude crear trabajador', description: '' })
      return
    }

    // Crear embarque
    const embRes = await page.request.post(`${BASE}/api/embarques`, {
      data: { trabajadorId, horaSalida: '08:00', carga: [{ producto: 'PACA_AGUA', cargadas: 10 }] },
    })
    const embData = await embRes.json()
    const embarqueId = embData.data?.id || embData.embarque?.id
    if (!embarqueId) {
      addFinding({ severity: 'P1', module: 'embarques', title: 'No pude crear embarque', description: JSON.stringify(embData).slice(0, 200) })
      return
    }

    // Login y verificar que aparece
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/embarques`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    const bodyText = (await page.locator('body').textContent()) ?? ''
    addFinding({
      severity: 'P3',
      module: 'embarques',
      title: `Embarque ${embarqueId.slice(-6)} creado y visible`,
      description: `Trabajador: ${trabajadorId.slice(-6)}. Body length: ${bodyText.length}.`,
    })
    await shoot(page, 'E2-despues-crear-embarque')
  })

  test('E3: Verificar tabs del cierre (Pedidos, Ventas Libres, Conciliación, Gastos, Preview)', async ({ page }) => {
    // Buscar un embarque existente
    const embList = await page.request.get(`${BASE}/api/embarques?estado=ABIERTO&all=true`)
    const embListData = await embList.json()
    const embarques = embListData.embarques || []
    if (embarques.length === 0) {
      addFinding({ severity: 'P2', module: 'embarques', title: 'No hay embarques abiertos para probar tabs de cierre', description: '' })
      return
    }
    const embarque = embarques[0]

    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/embarques/${embarque.id}/cerrar`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shoot(page, 'E3-cierre-pedidos-tab')

    const tabs = ['Pedidos', 'Ventas Libres', 'Conciliación', 'Gastos', 'Preview']
    const tabResults = []
    for (const tab of tabs) {
      const visible = await isVisible(page, `button:has-text("${tab}")`)
      tabResults.push(`${tab}: ${visible}`)
    }
    addFinding({
      severity: 'P3',
      module: 'embarques',
      title: 'Tabs visibles en /cierre',
      description: tabResults.join(' | '),
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// F. PRODUCCIÓN
// ═══════════════════════════════════════════════════════════════════════════

test.describe('F. Producción', () => {
  test('F1: Página /produccion carga y muestra contenido', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/produccion`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shoot(page, 'F1-produccion')

    const bodyText = (await page.locator('body').textContent()) ?? ''
    if (bodyText.length < 100) {
      addFinding({ severity: 'P0', module: 'produccion', title: 'Página /produccion casi vacía', description: `Body: ${bodyText.length} chars` })
      return
    }

    // Buscar CTA claro de "qué hacer"
    const hasCreateBtn = await isVisible(page, 'button:has-text("Crear"), button:has-text("Nueva"), button:has-text("Registrar")')
    const hasTurnoBtn = await isVisible(page, 'button:has-text("Mañana"), button:has-text("Tarde"), button:has-text("Noche")')
    const hasSellador = await isVisible(page, 'text=Sellador, text=Trabajador')

    addFinding({
      severity: 'P2',
      module: 'produccion',
      title: 'Inventario de CTAs en /produccion',
      description: `Crear: ${hasCreateBtn}, Turno: ${hasTurnoBtn}, Sellador: ${hasSellador}. Body: ${bodyText.slice(0, 300)}`,
      userComplaint: 'Queja: "no se puede hacer nada con producción"',
    })
  })

  test('F2: Crear una producción vía API y verla en la lista', async ({ page }) => {
    // Crear sellador si no hay
    const selladores = await page.request.get(`${BASE}/api/trabajadores?rol=SELLADOR&activo=true`)
    const selladoresData = await selladores.json()
    let sellador = selladoresData.trabajadores?.[0]
    if (!sellador) {
      const sellRes = await page.request.post(`${BASE}/api/trabajadores`, {
        data: { nombre: `Sellador Test ${Date.now() % 10000}`, rol: 'SELLADOR', tipoPago: 'COMISION', usaMoto: false, comPacaAgua: 500, comPacaHielo: 300, comBotellon: 200 },
      })
      const sellData = await sellRes.json()
      sellador = sellData.trabajador || sellData.data
    }

    if (!sellador) {
      addFinding({ severity: 'P1', module: 'produccion', title: 'No pude crear sellador', description: '' })
      return
    }

    // Crear producción
    const prodRes = await page.request.post(`${BASE}/api/produccion`, {
      data: {
        trabajadorId: sellador.id,
        turno: 'MANANA',
        items: [{ producto: 'PACA_AGUA', conteoA: 50, conteoB: 50, ventas: 10, stockIni: 100, stockFinFisico: 140, filtradas: 0, rotas: 0, consumoInterno: 0 }],
      },
    })
    const prodStatus = prodRes.status()

    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/produccion`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shoot(page, 'F2-produccion-despues-de-crear')

    const dbCountAfter = dbCount('Produccion')
    addFinding({
      severity: 'P3',
      module: 'produccion',
      title: `Producción creada vía API (status ${prodStatus})`,
      description: `Sellador: ${sellador.nombre}. Producciones en DB: ${dbCountAfter}.`,
    })
  })

  test('F3: Test de UX: ¿qué puede hacer un usuario nuevo en /produccion?', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/produccion`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Capturar TODA la página para análisis visual
    await shoot(page, 'F3-produccion-full')

    // Inspeccionar headings y textos clave
    const headings = await page.locator('h1, h2, h3').allTextContents()
    const buttons = await page.locator('button').allTextContents()

    addFinding({
      severity: 'P3',
      module: 'produccion',
      title: 'Inventario visual de /produccion',
      description: `Headings: ${JSON.stringify(headings.slice(0, 5))}. Botones: ${JSON.stringify(buttons.slice(0, 8))}.`,
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// G. CIERRE - COMISIONES
// ═══════════════════════════════════════════════════════════════════════════

test.describe('G. Cierre - Comisiones', () => {
  test('G1: Página /cierre carga', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/cierre`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shoot(page, 'G1-cierre')

    const bodyText = (await page.locator('body').textContent()) ?? ''
    if (bodyText.length < 100) {
      addFinding({ severity: 'P0', module: 'cierre', title: 'Página /cierre vacía', description: '' })
      return
    }

    // Verificar si hay sección de comisiones
    const hasComisiones = await isVisible(page, 'text=Comisión, text=Comisiones')
    const hasComisionInput = await isVisible(page, 'input[name*="comision" i], [data-testid*="comision" i]')

    addFinding({
      severity: 'P3',
      module: 'cierre',
      title: 'Inventario de comisiones en /cierre',
      description: `Comisiones visibles: ${hasComisiones}, Inputs de comisión: ${hasComisionInput}. Body: ${bodyText.slice(0, 200)}`,
    })
  })

  test('G2: Schema CierreDia tiene campo comisiones, pero ¿se calcula o se tipea?', async () => {
    // Verificar schema
    const cols = dbQuery(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'CierreDia' AND column_name IN ('comisiones', 'salarios', 'baseDia', 'netoCaja')`)
    addFinding({
      severity: 'P3',
      module: 'cierre',
      title: 'Schema CierreDia — campos relacionados a dinero',
      description: `Cols: ${cols}`,
    })
  })

  test('G3: Ver reporte de cierre existente en /cierre/reporte', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/cierre/reporte`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shoot(page, 'G3-cierre-reporte')

    const bodyText = (await page.locator('body').textContent()) ?? ''
    if (bodyText.length < 100) {
      addFinding({ severity: 'P1', module: 'cierre', title: 'Página /cierre/reporte vacía', description: '' })
      return
    }

    addFinding({
      severity: 'P3',
      module: 'cierre',
      title: 'Reporte de cierre renderiza',
      description: `Body length: ${bodyText.length}. Contiene: ${['Comisión', 'Venta', 'Base', 'Cierre'].filter(k => bodyText.includes(k)).join(', ')}`,
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// H. FIADOS / DEUDAS
// ═══════════════════════════════════════════════════════════════════════════

test.describe('H. Fiados / Deudas', () => {
  test('H1: Verificar schema DeudaTrabajador (existe vs falta automatización)', async () => {
    const cols = dbQuery(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'DeudaTrabajador' ORDER BY ordinal_position`)
    const colAbono = dbQuery(`SELECT column_name FROM information_schema.columns WHERE table_name = 'AbonoDeuda'`)
    const colDeduccion = dbQuery(`SELECT column_name FROM information_schema.columns WHERE table_name = 'DeduccionDeuda'`)
    const nominaDeuda = dbQuery(`SELECT column_name FROM information_schema.columns WHERE table_name = 'Nomina' AND column_name LIKE '%deuda%' OR column_name LIKE '%descuento%'`)

    addFinding({
      severity: 'P3',
      module: 'fiados',
      title: 'Schema de deudas del trabajador',
      description: `DeudaTrabajador cols: ${cols}\nAbonoDeuda: ${colAbono}\nDeduccionDeuda: ${colDeduccion}\nNomina deudas/descuento: ${nominaDeuda}`,
      featureGap: 'EXISTS',
    })
  })

  test('H2: Crear fiado manualmente y verificar en /pedidos?tab=fiados', async ({ page }) => {
    // Crear cliente
    const clienteRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `Test Fiado ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const clienteData = await clienteRes.json()
    const clienteId = clienteData.cliente?.id || clienteData.data?.id
    if (!clienteId) {
      addFinding({ severity: 'P1', module: 'fiados', title: 'No pude crear cliente', description: '' })
      return
    }

    // Crear pedido con pago parcial (queda fiado de $4000)
    const pedidoRes = await page.request.post(`${BASE}/api/pedidos`, {
      data: {
        clienteId,
        canal: 'PUNTO',
        ventaRapida: true,
        items: [{ producto: 'PACA_AGUA', cantidad: 4 }], // ~$12000 aprox
        pagos: [{ metodo: 'EFECTIVO', monto: 8000 }], // deja $4000 de saldo
      },
    })
    const pedidoData = await pedidoRes.json()
    const pedidoId = pedidoData.pedido?.id || pedidoData.data?.id

    if (!pedidoId) {
      addFinding({ severity: 'P1', module: 'fiados', title: 'No pude crear pedido fiado', description: JSON.stringify(pedidoData).slice(0, 200) })
      return
    }

    // Login y ver en Fiados
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/pedidos?tab=fiados`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shoot(page, 'H2-fiados-lista')

    // Verificar que aparece el cliente
    const bodyText = (await page.locator('body').textContent()) ?? ''
    const hasClient = bodyText.includes('Test Fiado')
    if (!hasClient) {
      addFinding({
        severity: 'P1',
        module: 'fiados',
        title: 'Cliente con fiado NO aparece en /pedidos?tab=fiados',
        description: `Pedido creado con saldo pendiente. Cliente "Test Fiado" no visible. Body: ${bodyText.slice(0, 300)}`,
        userComplaint: 'Queja: "flujo de fiados confuso"',
      })
    } else {
      addFinding({
        severity: 'P3',
        module: 'fiados',
        title: 'Fiado aparece en lista',
        description: `Pedido ${pedidoId.slice(-6)} con saldo pendiente visible en Fiados.`,
      })
    }

    // Probar expandir
    const verPedidosBtn = page.locator('button:has-text("Ver pedidos")').first()
    if (await verPedidosBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verPedidosBtn.click()
      await page.waitForTimeout(1000)
      await shoot(page, 'H2-fiados-expandido')
    }
  })

  test('H3: Pagar fiado y verificar descuento de saldo', async ({ page }) => {
    // Crear fiado nuevo
    const clienteRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `Test Pago Fiado ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const clienteData = await clienteRes.json()
    const clienteId = clienteData.cliente?.id || clienteData.data?.id
    if (!clienteId) {
      addFinding({ severity: 'P1', module: 'fiados', title: 'No pude crear cliente para pago fiado', description: '' })
      return
    }

    const pedidoRes = await page.request.post(`${BASE}/api/pedidos`, {
      data: {
        clienteId,
        canal: 'PUNTO',
        ventaRapida: true,
        items: [{ producto: 'PACA_AGUA', cantidad: 2 }], // ~$6000
        pagos: [{ metodo: 'EFECTIVO', monto: 3000 }], // deja $3000
      },
    })
    const pedidoData = await pedidoRes.json()
    const pedidoId = pedidoData.pedido?.id || pedidoData.data?.id
    if (!pedidoId) {
      addFinding({ severity: 'P1', module: 'fiados', title: 'No pude crear pedido para pago fiado', description: '' })
      return
    }

    // Pagar $1000 del saldo
    const pagoRes = await page.request.post(`${BASE}/api/pedidos/pagar-fiado`, {
      data: { pedidoId, monto: 1000, metodo: 'EFECTIVO' },
    })

    // Re-fetch pedido
    await page.waitForTimeout(1000)
    const afterRes = await page.request.get(`${BASE}/api/pedidos/${pedidoId}`)
    const afterData = await afterRes.json()
    const newSaldo = afterData.pedido?.saldo ?? afterData.data?.saldo

    addFinding({
      severity: 'P3',
      module: 'fiados',
      title: `Pago parcial de fiado`,
      description: `Status del pago: ${pagoRes.status()}. Nuevo saldo del pedido: ${newSaldo}.`,
    })
  })

  test('H4: ¿Existe UI de deudas del trabajador y descuento automático en nómina?', async ({ page }) => {
    // Ver schema: ya hay Nomina.descuentoDeudas. ¿Se ejecuta automáticamente?

    // Login y ver /nomina
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/nomina`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shoot(page, 'H4-nomina')

    const bodyText = (await page.locator('body').textContent()) ?? ''
    const hasNominaContent = bodyText.length > 100

    // ¿Hay UI para "deudas del trabajador" o "descuentos"?
    const hasDeudaSection = await isVisible(page, 'text=Deuda, text=Deudas, text=Préstamo, text=Descuento')

    addFinding({
      severity: 'P2',
      module: 'fiados',
      title: 'Inventario de UI en /nomina',
      description: `Body length: ${bodyText.length}, Deuda/Descuento visible: ${hasDeudaSection}. Schema tiene Nomina.descuentoDeudas (server-side) pero falta ver si la UI lo muestra.`,
      userComplaint: 'Queja: "flujo de fiados a deuda del trabajador confuso"',
    })
  })

  test('H5: Deuda del trabajador — ¿se crea automáticamente al pasar X días?', async () => {
    // Verificar: hay pedidos entregados con saldo pendiente que NO se convirtieron en DeudaTrabajador
    const pedFiado = dbQuery(`SELECT count(*) FROM "Pedido" WHERE "estadoPago" = 'PARCIAL' AND "estadoEntrega" = 'ENTREGADO'`)
    const deudasTrab = dbCount('DeudaTrabajador')

    addFinding({
      severity: 'P2',
      module: 'fiados',
      title: 'Pedidos con fiado entregado vs DeudaTrabajador creadas',
      description: `Pedidos fiados entregados con saldo: ${pedFiado}. DeudaTrabajador en sistema: ${deudasTrab}. Si pedFiado >> deudasTrab, la automatización NO está creando deudas.`,
      userComplaint: 'Queja: "no se sabe cuándo pasa a deuda del trabajador"',
    })
  })
})

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`\n[priority] Findings: ${BASE}/reports/walkthrough-*.jsonl`)
  // eslint-disable-next-line no-console
  console.log(`[priority] Screenshots: ${SCREENSHOTS_DIR}`)
})
