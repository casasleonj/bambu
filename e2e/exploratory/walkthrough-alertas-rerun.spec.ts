// @ts-check
// Fase 3: Re-test alertas con waitForTimeout(15000)
// Si F-003 (cliente 3+ pedidos) desaparece → era timing
// Si persiste → bug real

import { test, loginAs, shoot, addFinding, isVisible, BASE, RUN_ID, SCREENSHOTS_DIR } from './walkthrough-helpers'

test.describe('Fase 3. Re-test alertas con más wait', () => {
  test('F3.1: Cliente con 3+ pedidos mismo día aparece con 15s de wait', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    // Crear cliente + 3 pedidos
    const cliRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `F3 3er Pedido ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const cliData = await cliRes.json()
    const clienteId = cliData.cliente?.id || cliData.data?.id
    if (!clienteId) { test.skip(); return }

    for (let i = 0; i < 3; i++) {
      await page.request.post(`${BASE}/api/pedidos`, {
        data: { clienteId, canal: 'PUNTO', ventaRapida: true, items: [{ producto: 'PACA_AGUA', cantidad: 1 }], pagos: [{ metodo: 'EFECTIVO', monto: 3000 }] },
      })
    }

    // Ir a alertas y esperar 15s
    await page.goto(`${BASE}/pedidos?tab=alertas`, { waitUntil: 'domcontentloaded' })

    // Esperar 5s y ver
    await page.waitForTimeout(5000)
    const body5s = (await page.locator('body').textContent()) ?? ''
    const hasClient5s = body5s.includes(`F3 3er Pedido`)
    addFinding({
      severity: 'P3',
      module: 'alertas',
      title: `F3.1 @ 5s: cliente visible? ${hasClient5s}`,
      description: '',
    })

    // Esperar 10s más (total 15s)
    await page.waitForTimeout(10000)
    const body15s = (await page.locator('body').textContent()) ?? ''
    const hasClient15s = body15s.includes(`F3 3er Pedido`)
    addFinding({
      severity: hasClient15s ? 'P3' : 'P1',
      module: 'alertas',
      title: `F3.1 @ 15s: cliente con 3+ pedidos visible? ${hasClient15s}`,
      description: hasClient15s
        ? '✅ Con 15s de wait, la alerta SÍ aparece. Era timing issue del detector client-side. F-003 refutado.'
        : '❌ Con 15s de wait, la alerta NO aparece. Bug real: detector client-side no procesa correctamente.',
      userComplaint: 'Alertas no se ven',
    })

    // Verificar si hay badges BAJA/MEDIA
    const hasSeveridad = body15s.match(/(BAJA|MEDIA|ALTA)/g) || []
    addFinding({
      severity: 'P3',
      module: 'alertas',
      title: `Severidades detectadas en alertas: ${hasSeveridad.slice(0, 5).join(', ')}`,
      description: '',
    })

    await shoot(page, 'F3.1-15s')
  })

  test('F3.2: Cliente con 3+ fiados aparece con 15s de wait', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 20000 })

    const cliRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `F3 Fiado Recurrente ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const cliData = await cliRes.json()
    const clienteId = cliData.cliente?.id || cliData.data?.id
    if (!clienteId) { test.skip(); return }

    // 3 fiados
    for (let i = 0; i < 3; i++) {
      await page.request.post(`${BASE}/api/pedidos`, {
        data: { clienteId, canal: 'PUNTO', ventaRapida: true, items: [{ producto: 'PACA_AGUA', cantidad: 2 }], pagos: [{ metodo: 'EFECTIVO', monto: 1000 }] },
      })
    }

    await page.goto(`${BASE}/pedidos?tab=alertas`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(15000)
    const body = (await page.locator('body').textContent()) ?? ''
    const hasClient = body.includes(`F3 Fiado Recurrente`)
    addFinding({
      severity: hasClient ? 'P3' : 'P1',
      module: 'alertas',
      title: `F3.2 @ 15s: cliente con 3+ fiados visible? ${hasClient}`,
      description: hasClient
        ? '✅ La alerta FIADO_REcurrente SÍ aparece con 15s de wait. F-005 refutado.'
        : '❌ La alerta FIADO_REcurrente NO aparece. Bug real.',
    })
    await shoot(page, 'F3.2-15s')
  })
})
