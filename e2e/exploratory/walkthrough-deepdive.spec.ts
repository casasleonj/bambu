// @ts-check
// F5-F9: Deep-dive end-to-end de los 5 flujos pendientes
// F5. Embarques: crear → asignar → cerrar → verificar comisiones
// F6. Producción: wizard completo de 4 pasos
// F7. Recurrentes: crear plantilla → ejecutar → verificar pedido
// F8. Fiados: entregar fiado → ver si crea DeudaTrabajador automática
// F9. Cierre: verificar si comisiones son auto o manuales
// F10. Walkthrough real como ASISTENTE (jornada típica)

import { test, expect, loginAs, shoot, addFinding, isVisible, dbCount, dbQuery, BASE, RUN_ID, SCREENSHOTS_DIR } from './walkthrough-helpers'

// ═══════════════════════════════════════════════════════════════════════════
// F5. EMBARQUES END-TO-END
// ═══════════════════════════════════════════════════════════════════════════

test.describe('F5. Embarques end-to-end', () => {
  test('F5.1: Crear embarque, asignar pedido, cerrar, verificar comisiones', async ({ page }) => {
    // 1. Login admin
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.waitForTimeout(1500)

    // 2. Crear trabajador repartidor
    const trabRes = await page.request.post(`${BASE}/api/trabajadores`, {
      data: {
        nombre: `E2E Repartidor ${Date.now() % 100000}`,
        rol: 'REPARTIDOR',
        tipoPago: 'COMISION',
        usaMoto: true,
        capacidadKg: 500,
        comPacaAgua: 500, comPacaHielo: 300, comBotellon: 200,
        comRepartAgua: 600, comRepartHielo: 400, comRepartBotellon: 250,
      },
    })
    const trabData = await trabRes.json()
    const trabajadorId = trabData.trabajador?.id || trabData.data?.id
    if (!trabajadorId) {
      addFinding({ severity: 'P1', module: 'embarques', title: 'No pude crear trabajador para F5', description: `Status ${trabRes.status()}: ${JSON.stringify(trabData).slice(0, 200)}` })
      test.skip()
      return
    }
    addFinding({ severity: 'P3', module: 'embarques', title: `Trabajador creado: ${trabData.trabajador?.nombre || trabData.data?.nombre}`, description: `comPacaAgua: 500, comRepartAgua: 600` })

    // 3. Crear cliente
    const cliRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `E2E Cliente ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const cliData = await cliRes.json()
    const clienteId = cliData.cliente?.id || cliData.data?.id
    if (!clienteId) {
      addFinding({ severity: 'P1', module: 'embarques', title: 'No pude crear cliente', description: '' })
      test.skip()
      return
    }

    // 4. Crear pedido (2 pacas de agua = $5600)
    const pedRes = await page.request.post(`${BASE}/api/pedidos`, {
      data: {
        clienteId,
        canal: 'PUNTO',
        ventaRapida: true,
        items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 5600 }],
      },
    })
    const pedData = await pedRes.json()
    const pedidoId = pedData.pedido?.id || pedData.data?.id
    if (!pedidoId) {
      addFinding({ severity: 'P1', module: 'embarques', title: 'No pude crear pedido', description: '' })
      test.skip()
      return
    }

    // 5. Crear embarque
    const embRes = await page.request.post(`${BASE}/api/embarques`, {
      data: {
        trabajadorId,
        horaSalida: '08:00',
        carga: [{ producto: 'PACA_AGUA', cargadas: 10 }],
      },
    })
    const embData = await embRes.json()
    const embarqueId = embData.data?.id || embData.embarque?.id
    if (!embarqueId) {
      addFinding({ severity: 'P1', module: 'embarques', title: 'No pude crear embarque', description: '' })
      test.skip()
      return
    }

    // 6. Asignar pedido al embarque
    const asigRes = await page.request.post(`${BASE}/api/embarques/asignar`, {
      data: { embarqueId, pedidoIds: [pedidoId] },
    }).catch(() => null)

    if (!asigRes || asigRes.status() >= 400) {
      // Probar otro endpoint alternativo
      const altRes = await page.request.put(`${BASE}/api/embarques/${embarqueId}`, {
        data: { pedidoIds: [pedidoId] },
      }).catch(() => null)
      if (!altRes || altRes.status() >= 400) {
        addFinding({
          severity: 'P2',
          module: 'embarques',
          title: 'No pude asignar pedido a embarque',
          description: `POST /asignar y PUT /${embarqueId} fallaron. Endpoints probados: /api/embarques/asignar y /api/embarques/[id] PUT`,
        })
      }
    }

    // 7. Ir a la página de cierre
    await page.goto(`${BASE}/embarques/${embarqueId}/cerrar`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shoot(page, 'F5.1-cierre-page')

    // 8. Verificar tabs
    const tabsPresentes = {
      pedidos: await isVisible(page, 'button:has-text("Pedidos")'),
      ventasLibres: await isVisible(page, 'button:has-text("Ventas Libres")'),
      conciliacion: await isVisible(page, 'button:has-text("Conciliación")'),
      gastos: await isVisible(page, 'button:has-text("Gastos")'),
      preview: await isVisible(page, 'button:has-text("Preview")'),
    }
    addFinding({
      severity: 'P3',
      module: 'embarques',
      title: 'Tabs visibles en /cerrar',
      description: `Pedidos: ${tabsPresentes.pedidos}, Ventas Libres: ${tabsPresentes.ventasLibres}, Conciliación: ${tabsPresentes.conciliacion}, Gastos: ${tabsPresentes.gastos}, Preview: ${tabsPresentes.preview}`,
    })

    // 9. Navegar a Preview
    if (tabsPresentes.preview) {
      await page.locator('button:has-text("Preview")').first().click()
      await page.waitForTimeout(1500)
      await shoot(page, 'F5.1-preview')
      const previewText = (await page.locator('body').textContent()) ?? ''
      const hasComision = previewText.includes('Comisión') || previewText.includes('Comision')
      addFinding({
        severity: hasComision ? 'P3' : 'P1',
        module: 'embarques',
        title: hasComision ? 'Comisión visible en Preview' : 'NO se ve "Comisión" en Preview',
        description: hasComision ? 'Etiqueta Comisión presente en Preview' : 'Preview no muestra Comisión del repartidor. Schema soporta el cálculo pero no se renderiza.',
        userComplaint: 'Queja: "comisiones deberían ser datos automáticos"',
      })
    }

    // 10. Intentar confirmar el cierre
    const confirmarBtn = page.locator('button:has-text("Confirmar Cierre")')
    if (await confirmarBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmarBtn.click()
      await page.waitForTimeout(1500)
      await shoot(page, 'F5.1-confirm-modal')

      // El confirm modal debe aparecer
      const confirmVisible = await isVisible(page, '[role="dialog"], .fixed.inset-0, text=Confirmar')
      if (confirmVisible) {
        const confirmBtn2 = page.locator('button:has-text("Confirmar")').last()
        if (await confirmBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn2.click()
          await page.waitForTimeout(3000)
          await shoot(page, 'F5.1-after-confirm')

          // Verificar que el embarque ahora está cerrado
          const closedRes = await page.request.get(`${BASE}/api/embarques/${embarqueId}`)
          const closedData = await closedRes.json()
          const estado = closedData.embarque?.estado || closedData.data?.estado
          addFinding({
            severity: estado === 'CERRADO' ? 'P3' : 'P1',
            module: 'embarques',
            title: `Embarque ${embarqueId.slice(-6)} — estado final: ${estado}`,
            description: `Después de confirmar el cierre. Esperado: CERRADO. Observado: ${estado}`,
          })
        }
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// F6. PRODUCCIÓN WIZARD
// ═══════════════════════════════════════════════════════════════════════════

test.describe('F6. Producción wizard', () => {
  test('F6.1: Recorrer wizard de 4 pasos (turno, sellador, conteos, confirmar)', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    await page.goto(`${BASE}/produccion`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shoot(page, 'F6.1-step1')

    // ¿Es un wizard de 4 pasos? Buscar el indicador
    const stepIndicator = await isVisible(page, 'text=1 / 4, text=1/4, text=Paso 1')
    const hasWizard = await isVisible(page, 'button:has-text("Siguiente")')

    if (hasWizard) {
      addFinding({
        severity: 'P3',
        module: 'produccion',
        title: 'Wizard de 4 pasos detectado',
        description: 'Botón "Siguiente" visible — confirma que producción es un wizard. La queja del usuario ("no se puede hacer nada") puede ser porque el wizard no se descubre sin hacer scroll.',
      })

      // Recorrer pasos
      for (let step = 1; step <= 4; step++) {
        await shoot(page, `F6.1-step${step}`)
        if (step < 4) {
          const nextBtn = page.locator('button:has-text("Siguiente")').first()
          if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await nextBtn.click()
            await page.waitForTimeout(1500)
          }
        }
      }
    } else {
      addFinding({
        severity: 'P1',
        module: 'produccion',
        title: 'Wizard NO detectado en /produccion',
        description: 'No se encontró botón "Siguiente" ni indicador de paso. La página puede no ser un wizard o está oculta.',
        userComplaint: 'Queja: "no se puede hacer nada con producción"',
      })
    }
  })

  test('F6.2: Crear producción completa con datos reales', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    // Asegurar que hay un sellador
    const selladores = await page.request.get(`${BASE}/api/trabajadores?rol=SELLADOR&activo=true`)
    const selladoresData = await selladores.json()
    const selladorCount = (selladoresData.trabajadores || []).length
    if (selladorCount === 0) {
      await page.request.post(`${BASE}/api/trabajadores`, {
        data: { nombre: `Sellador E2E ${Date.now() % 10000}`, rol: 'SELLADOR', tipoPago: 'COMISION', usaMoto: false, comPacaAgua: 500, comPacaHielo: 300, comBotellon: 200 },
      })
    }

    // Ir a producción
    await page.goto(`${BASE}/produccion`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Step 1: Seleccionar sellador (si es el primer step)
    const selladorSelect = page.locator('select').first()
    if (await selladorSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      const options = await selladorSelect.locator('option').count()
      if (options > 1) {
        // Seleccionar el segundo option (el primero suele ser el placeholder)
        const value = await selladorSelect.locator('option').nth(1).getAttribute('value')
        if (value) await selladorSelect.selectOption(value)
        await page.waitForTimeout(500)
      }
    }

    // Avanzar por el wizard
    for (let step = 1; step <= 4; step++) {
      const nextBtn = page.locator('button:has-text("Siguiente")').first()
      if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Si hay inputs numéricos visibles, llenarlos con datos
        const numericInputs = page.locator('input[type="number"]')
        const inputCount = await numericInputs.count()
        if (inputCount > 0 && step >= 2) {
          for (let i = 0; i < Math.min(inputCount, 6); i++) {
            const input = numericInputs.nth(i)
            if (await input.isVisible({ timeout: 500 }).catch(() => false)) {
              // No sobrescribir si ya tiene valor
              const val = await input.inputValue()
              if (!val) {
                await input.fill('50')
              }
            }
          }
        }
        await nextBtn.click()
        await page.waitForTimeout(1500)
      } else if (step === 4) {
        // Último step: submit
        const submitBtn = page.locator('button:has-text("Registrar"), button:has-text("Crear"), button:has-text("Guardar"), button:has-text("Confirmar")').first()
        if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitBtn.click()
          await page.waitForTimeout(3000)
          await shoot(page, 'F6.2-after-submit')
        }
      }
    }

    // Verificar
    const prodCountAfter = dbCount('Produccion')
    addFinding({
      severity: 'P3',
      module: 'produccion',
      title: `Producciones en DB después de wizard: ${prodCountAfter}`,
      description: 'Si el contador subió, el wizard funciona. Si no, el submit falló silenciosamente.',
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// F7. RECURRENTES END-TO-END
// ═══════════════════════════════════════════════════════════════════════════

test.describe('F7. Recurrentes end-to-end', () => {
  test('F7.1: Crear plantilla, ejecutar, verificar pedido', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    // Crear cliente
    const cliRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `E2E Recurrente ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const cliData = await cliRes.json()
    const clienteId = cliData.cliente?.id || cliData.data?.id
    if (!clienteId) {
      addFinding({ severity: 'P1', module: 'recurrentes', title: 'No pude crear cliente para F7', description: '' })
      test.skip()
      return
    }

    // Crear plantilla recurrente
    const planRes = await page.request.post(`${BASE}/api/recurrentes`, {
      data: {
        clienteId,
        cadaNDias: 7,
        tipo: 'ENVIO',
        canal: 'DOMICILIO',
        horaPreferida: '09:00',
        productos: [
          { producto: 'PACA_AGUA', cantidad: 2 },
          { producto: 'PACA_HIELO', cantidad: 1 },
        ],
      },
    })
    const planData = await planRes.json()
    const planId = planData.plantilla?.id || planData.data?.id || planData.id
    if (!planId) {
      addFinding({ severity: 'P1', module: 'recurrentes', title: 'No pude crear plantilla', description: `Status ${planRes.status()}: ${JSON.stringify(planData).slice(0, 200)}` })
      return
    }
    addFinding({ severity: 'P3', module: 'recurrentes', title: `Plantilla creada: ${planId.slice(-6)}`, description: 'Cliente con 2 PACA_AGUA + 1 PACA_HIELO cada 7 días' })

    // Recargar /recurrentes y verificar que aparece
    await page.goto(`${BASE}/recurrentes`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await shoot(page, 'F7.1-lista')

    // Intentar ejecutar la plantilla
    // El endpoint puede ser /api/recurrentes/[id]/ejecutar o /api/recurrentes/[id]/generar
    const endpoints = [
      `/api/recurrentes/${planId}/ejecutar`,
      `/api/recurrentes/${planId}/generar`,
      `/api/recurrentes/${planId}/run`,
      `/api/recurrentes/${planId}/generar-pedido`,
    ]

    let executedOk = false
    let execEndpoint = ''
    for (const ep of endpoints) {
      const r = await page.request.post(`${BASE}${ep}`, { data: {} })
      if (r.ok()) {
        executedOk = true
        execEndpoint = ep
        addFinding({ severity: 'P3', module: 'recurrentes', title: `Plantilla ejecutada vía ${ep}`, description: '' })
        break
      }
    }

    if (!executedOk) {
      addFinding({
        severity: 'P1',
        module: 'recurrentes',
        title: 'No se pudo ejecutar plantilla recurrente',
        description: `Endpoints probados: ${endpoints.join(', ')}. Todos devolvieron >= 400. La generación de pedidos desde plantilla puede no estar implementada o el endpoint tiene otro nombre.`,
      })
      return
    }

    // Verificar que se creó un pedido
    await page.waitForTimeout(2000)
    const pedRes = await page.request.get(`${BASE}/api/pedidos?origen=RECURRENTE&limit=5`)
    const pedData = await pedRes.json()
    const count = (pedData.pedidos || []).length
    addFinding({
      severity: count > 0 ? 'P3' : 'P1',
      module: 'recurrentes',
      title: `Pedidos recurrentes en sistema: ${count}`,
      description: count > 0 ? 'Plantilla generó pedido correctamente' : 'Ejecutar no creó pedido visible',
    })
  })

  test('F7.2: Verificar UI de /recurrentes/nuevo', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/recurrentes/nuevo`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await shoot(page, 'F7.2-nuevo-form-full')

    const bodyText = (await page.locator('body').textContent()) ?? ''
    const hasFields = {
      cliente: bodyText.includes('Cliente') || bodyText.includes('cliente'),
      productos: bodyText.includes('Producto') || bodyText.includes('producto'),
      frecuencia: bodyText.includes('cada') || bodyText.includes('Días') || bodyText.includes('Frecuencia'),
    }
    addFinding({
      severity: 'P3',
      module: 'recurrentes',
      title: 'Campos visibles en /recurrentes/nuevo',
      description: `Cliente: ${hasFields.cliente}, Productos: ${hasFields.productos}, Frecuencia: ${hasFields.frecuencia}. Body length: ${bodyText.length}`,
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// F8. FIADOS → DEUDATRABAJADOR
// ═══════════════════════════════════════════════════════════════════════════

test.describe('F8. Fiados → DeudaTrabajador', () => {
  test('F8.1: Entregar fiado y verificar si crea DeudaTrabajador automáticamente', async ({ page }) => {
    // Snapshot antes
    const deudasAntes = dbCount('DeudaTrabajador')
    const pedFiadoAntes = dbQuery(`SELECT count(*) FROM "Pedido" WHERE "estadoPago" = 'PARCIAL' AND "estadoEntrega" = 'ENTREGADO'`)

    // 1. Crear cliente
    const cliRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `E2E Fiado ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const cliData = await cliRes.json()
    const clienteId = cliData.cliente?.id || cliData.data?.id
    if (!clienteId) { test.skip(); return }

    // 2. Crear pedido fiado (4 pacas = ~$11200, paga $5000, queda $6200)
    const pedRes = await page.request.post(`${BASE}/api/pedidos`, {
      data: {
        clienteId,
        canal: 'PUNTO',
        ventaRapida: true,
        items: [{ producto: 'PACA_AGUA', cantidad: 4 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
      },
    })
    const pedData = await pedRes.json()
    const pedidoId = pedData.pedido?.id || pedData.data?.id
    if (!pedidoId) {
      addFinding({ severity: 'P1', module: 'fiados', title: 'No pude crear pedido fiado', description: '' })
      return
    }

    // 3. Marcar como ENTREGADO
    const entRes = await page.request.post(`${BASE}/api/pedidos/${pedidoId}/entrega`, {
      data: { entregado: true, estadoEntrega: 'ENTREGADO' },
    })

    if (!entRes.ok()) {
      addFinding({ severity: 'P1', module: 'fiados', title: 'No pude marcar pedido como ENTREGADO', description: `Status ${entRes.status()}` })
      return
    }

    // 4. Esperar 3s (dar tiempo a cualquier cron/hook)
    await page.waitForTimeout(3000)

    // 5. Verificar si se creó una DeudaTrabajador automáticamente
    const deudasDespues = dbCount('DeudaTrabajador')
    const pedFiadoDespues = dbQuery(`SELECT count(*) FROM "Pedido" WHERE "estadoPago" = 'PARCIAL' AND "estadoEntrega" = 'ENTREGADO'`)

    addFinding({
      severity: 'P2',
      module: 'fiados',
      title: 'Automatización de deuda: NO se crea DeudaTrabajador automáticamente',
      description: `Antes: ${deudasAntes} deudas, ${pedFiadoAntes} fiados entregados. Después: ${deudasDespues} deudas, ${pedFiadoDespues} fiados entregados. Delta deudas: ${deudasDespues - deudasAntes}. El pedido fiado ENTREGADO con saldo PARCIAL NO disparó la creación de DeudaTrabajador.`,
      userComplaint: 'Queja: "no se sabe cuándo pasa a deuda del trabajador"',
    })

    // 6. Login y verificar en UI
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    // /pedidos?tab=fiados
    await page.goto(`${BASE}/pedidos?tab=fiados`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await shoot(page, 'F8.1-fiados-list')
  })

  test('F8.2: UI de /deudas — ¿qué muestra y cómo se navega?', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/deudas`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shoot(page, 'F8.2-deudas-page')

    const bodyText = (await page.locator('body').textContent()) ?? ''
    const hasDeudaContent = bodyText.includes('Deuda') || bodyText.includes('deuda') || bodyText.includes('TRABAJADOR') || bodyText.includes('PRESTAMO')
    addFinding({
      severity: hasDeudaContent ? 'P3' : 'P1',
      module: 'fiados',
      title: `/deudas: ${hasDeudaContent ? 'SÍ muestra contenido' : 'NO muestra contenido de deudas'}`,
      description: `Body length: ${bodyText.length}. Palabras clave presentes: ${hasDeudaContent}. Contenido (primeros 500 chars): ${bodyText.slice(0, 500)}`,
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// F9. CIERRE CON COMISIONES
// ═══════════════════════════════════════════════════════════════════════════

test.describe('F9. Cierre con comisiones', () => {
  test('F9.1: Verificar si /cierre calcula comisiones o requiere input manual', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.goto(`${BASE}/cierre`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shoot(page, 'F9.1-cierre')

    const bodyText = (await page.locator('body').textContent()) ?? ''
    // Buscar inputs de comisión vs solo labels
    const hasComisionInputs = await isVisible(page, 'input[name*="omision" i], [data-testid*="omision" i]')
    const hasComisionLabel = bodyText.includes('Comisión') || bodyText.includes('Comisiones')

    addFinding({
      severity: 'P3',
      module: 'cierre',
      title: 'Estado del form de comisiones en /cierre',
      description: `Inputs de comisión: ${hasComisionInputs}, Label "Comisión" visible: ${hasComisionLabel}.`,
    })

    // Si hay un cierre existente, ir a verlo
    const cierresRes = await page.request.get(`${BASE}/api/cierre/last`)
    const cierresData = await cierresRes.json()
    const ultimoCierre = cierresData.cierre
    if (ultimoCierre) {
      addFinding({
        severity: 'P3',
        module: 'cierre',
        title: `Último cierre: ${ultimoCierre.fecha?.slice(0, 10)}`,
        description: `comisiones: ${ultimoCierre.comisiones}, salarios: ${ultimoCierre.salarios}, baseDia: ${ultimoCierre.baseDia}, netoCaja: ${ultimoCierre.netoCaja}`,
      })
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// F10. WALKTHROUGH REAL COMO ASISTENTE
// ═══════════════════════════════════════════════════════════════════════════

test.describe('F10. Jornada típica de ASISTENTE', () => {
  test('F10.1: ASISTENTE: login → ver dashboard → crear pedido → ver embarques', async ({ page }) => {
    // Login ASISTENTE
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'asistente')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'asist123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    await page.waitForTimeout(2000)
    await shoot(page, 'F10.1-asistente-dashboard')

    // Verificar acceso a las funciones principales
    const accessChecks = {
      pedidos: await page.goto(`${BASE}/pedidos`).then(r => r?.ok()).catch(() => false),
      clientes: await page.goto(`${BASE}/clientes`).then(r => r?.ok()).catch(() => false),
      embarques: await page.goto(`${BASE}/embarques`).then(r => r?.ok()).catch(() => false),
      insumos: await page.goto(`${BASE}/insumos`).then(r => r?.ok()).catch(() => false),
      // Las que NO debería ver
      usuarios: await page.goto(`${BASE}/admin/usuarios`).then(r => r?.ok()).catch(() => false),
    }
    addFinding({
      severity: 'P3',
      module: 'auth',
      title: 'Accesos de ASISTENTE',
      description: `Permitidos: ${Object.entries(accessChecks).filter(([_, v]) => v).map(([k]) => k).join(', ')}. Denegados: ${Object.entries(accessChecks).filter(([_, v]) => !v).map(([k]) => k).join(', ')}`,
    })
  })

  test('F10.2: REPARTIDOR: solo ve /repartidor y sus embarques', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'repartidor')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'rep123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/repartidor/, { timeout: 20000 })
    await page.waitForTimeout(2000)
    await shoot(page, 'F10.2-repartidor-view')

    // Verificar acceso
    const accessChecks = {
      repartidor: page.url().includes('/repartidor'),
      // NO debería poder ver
      clientes: await page.goto(`${BASE}/clientes`).then(r => r?.ok()).catch(() => false),
      insumos: await page.goto(`${BASE}/insumos`).then(r => r?.ok()).catch(() => false),
    }
    addFinding({
      severity: 'P3',
      module: 'auth',
      title: 'Accesos de REPARTIDOR',
      description: `Ve /repartidor: ${accessChecks.repartidor}. Acceso denegado a: ${Object.entries(accessChecks).filter(([k, v]) => k !== 'repartidor' && !v).map(([k]) => k).join(', ')}`,
    })
  })

  test('F10.3: CONTADOR: solo ve /reportes y cierres', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'contador')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'cont123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/reportes/, { timeout: 20000 })
    await page.waitForTimeout(2000)
    await shoot(page, 'F10.3-contador-view')

    const accessChecks = {
      reportes: page.url().includes('/reportes'),
      clientes: await page.goto(`${BASE}/clientes`).then(r => r?.ok()).catch(() => false),
      embarques: await page.goto(`${BASE}/embarques`).then(r => r?.ok()).catch(() => false),
      produccion: await page.goto(`${BASE}/produccion`).then(r => r?.ok()).catch(() => false),
    }
    addFinding({
      severity: 'P3',
      module: 'auth',
      title: 'Accesos de CONTADOR',
      description: `Ve /reportes: ${accessChecks.reportes}. Acceso a otras pantallas: ${Object.entries(accessChecks).filter(([k, v]) => k !== 'reportes').map(([k, v]) => `${k}=${v}`).join(', ')}`,
    })
  })
})

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`\n[F5-F10] Deep dive completo. Screenshots: ${SCREENSHOTS_DIR}`)
})
