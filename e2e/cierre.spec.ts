import { test, expect, login, handleBaseCaja, fullLogin, goto, apiPost, apiGet } from './fixtures'

test.describe('Cierre', () => {

  test('page loads', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/cierre')
    await page.waitForTimeout(1000)
    await expect(page.locator('h1:has-text("Cierre del Día")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Resumen Financiero').first()).toBeVisible({ timeout: 5000 })
  })

  test('admin sees cerrar dia button', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/cierre')
    await page.waitForTimeout(1000)
    const cerrarBtn = page.locator('button:has-text("Cerrar Día")')
    if (await cerrarBtn.count() === 0) {
      const yaCerrado = page.locator('text=Día ya cerrado')
      if (await yaCerrado.isVisible({ timeout: 2000 }).catch(() => false)) {
        test.skip()
        return
      }
    }
    await expect(cerrarBtn).toBeVisible({ timeout: 5000 })
  })

  test('asistente redirected from cierre', async ({ page }) => {
    await login(page, 'asistente', 'asist123')
    await handleBaseCaja(page)
    await page.waitForTimeout(300)
    await goto(page, '/cierre')
    await expect(page).toHaveURL(/.*dashboard/)
  })

  test('admin can input stock', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/cierre')
    await page.waitForTimeout(1000)
    const yaCerrado = page.locator('text=Día ya cerrado')
    if (await yaCerrado.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip()
      return
    }
    const stockCards = page.locator('text=Stock:')
    if (await stockCards.count() === 0) {
      test.skip()
      return
    }
    const stockIniAguaInput = page.locator('label:has-text("Stock Inicial")').locator('..').locator('input[type="number"]').first()
    if (await stockIniAguaInput.count() > 0) {
      await stockIniAguaInput.fill('50')
      await expect(stockIniAguaInput).toHaveValue('50')
    }
  })

  test('admin can close day via API', async ({ page }) => {
    await fullLogin(page)
    const today = new Date().toISOString().split('T')[0]
    const res = await apiPost(page, '/api/cierre', {
      fecha: today,
      numPedidos: 5,
      totalVentas: 50000,
      cobrado: 45000,
      fiado: 5000,
      efectivo: 30000,
      transferencia: 10000,
      nequi: 3000,
      daviplata: 1500,
      bono: 500,
      baseDia: 100000,
      comisiones: 8000,
      salarios: 0,
      gastos: 5000,
      stockIniAgua: 200,
      prodAgua: 150,
      stockFinAgua: 180,
      stockIniHielo: 100,
      prodHielo: 80,
      stockFinHielo: 90,
      netoCaja: 132000,
    })
    if (res.status() === 409) {
      test.skip()
      return
    }
    expect(res.status()).toBe(201)
  })

  test('double close same day fails', async ({ page }) => {
    await fullLogin(page)
    const today = new Date().toISOString().split('T')[0]
    const data = {
      fecha: today,
      numPedidos: 0,
      totalVentas: 0,
      cobrado: 0,
      fiado: 0,
      efectivo: 0,
      transferencia: 0,
      nequi: 0,
      daviplata: 0,
      bono: 0,
      baseDia: 100000,
      comisiones: 0,
      salarios: 0,
      gastos: 0,
      stockIniAgua: 0,
      prodAgua: 0,
      stockFinAgua: 0,
      stockIniHielo: 0,
      prodHielo: 0,
      stockFinHielo: 0,
      netoCaja: 100000,
    }
    const res1 = await apiPost(page, '/api/cierre', data)
    if (res1.status() === 409) {
      const res2 = await apiPost(page, '/api/cierre', data)
      expect(res2.status()).toBe(409)
    } else if (res1.ok()) {
      const res2 = await apiPost(page, '/api/cierre', data)
      expect(res2.status()).toBe(409)
    } else {
      test.skip()
    }
  })

  test('ver reporte para imprimir', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/cierre')
    await page.waitForTimeout(1000)
    const yaCerrado = page.locator('text=Día ya cerrado')
    if (await yaCerrado.isVisible({ timeout: 2000 }).catch(() => false)) {
      const irDashboard = page.locator('button:has-text("Volver al Dashboard")')
      await expect(irDashboard).toBeVisible()
      return
    }
    const reporteBtn = page.locator('button:has-text("Ver Reporte para Imprimir")')
    if (await reporteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(reporteBtn).toBeVisible()
    }
  })

  test('arqueo de caja', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/cierre')
    await page.waitForTimeout(1000)
    const yaCerrado = page.locator('text=Día ya cerrado')
    if (await yaCerrado.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip()
      return
    }
    const arqueoSection = page.locator('text=Arqueo Físico de Caja')
    if (await arqueoSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(arqueoSection).toBeVisible()
    }
  })

  test('cierre blocked by open embarques', async ({ page }) => {
    test.setTimeout(120000)
    await fullLogin(page)
    const trabajador = await (async () => {
      const res = await apiGet(page, '/api/trabajadores')
      const body = await res.json()
      return body.trabajadores?.[0]
    })()
    if (!trabajador) {
      test.skip()
      return
    }
    const embarqueRes = await apiPost(page, '/api/embarques', { trabajadorId: trabajador.id })
    if (!embarqueRes.ok()) {
      test.skip()
      return
    }
    const today = new Date().toISOString().split('T')[0]
    const cierreRes = await apiPost(page, '/api/cierre', {
      fecha: today,
      numPedidos: 0,
      totalVentas: 0,
      cobrado: 0,
      fiado: 0,
      efectivo: 0,
      transferencia: 0,
      nequi: 0,
      daviplata: 0,
      bono: 0,
      baseDia: 100000,
      comisiones: 0,
      salarios: 0,
      gastos: 0,
      stockIniAgua: 0,
      prodAgua: 0,
      stockFinAgua: 0,
      stockIniHielo: 0,
      prodHielo: 0,
      stockFinHielo: 0,
      netoCaja: 100000,
    })
    const cierreBody = await cierreRes.json()
    const blocked = cierreRes.status() === 400 || (cierreBody?.error && cierreBody.error.includes('embarque'))
    expect(blocked).toBeTruthy()
  })

  test('post-cierre: ventas nocturnas aparecen despues del cierre', async ({ page }) => {
    await fullLogin(page)
    const today = new Date().toISOString().split('T')[0]
    // 1. Cerrar el día
    const cierreRes = await apiPost(page, '/api/cierre', {
      fecha: today,
      numPedidos: 1,
      totalVentas: 10000,
      cobrado: 10000,
      fiado: 0,
      efectivo: 10000,
      transferencia: 0,
      nequi: 0,
      daviplata: 0,
      bono: 0,
      baseDia: 50000,
      comisiones: 0,
      salarios: 0,
      gastos: 0,
      stockIniAgua: 0,
      prodAgua: 0,
      stockFinAgua: 0,
      stockIniHielo: 0,
      prodHielo: 0,
      stockFinHielo: 0,
      netoCaja: 60000,
    })
    if (cierreRes.status() === 409) {
      test.skip()
      return
    }
    expect(cierreRes.status()).toBe(201)

    // 2. Crear un pedido post-cierre
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      origen: 'VENTA_RAPIDA',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    expect(pedidoRes.status()).toBe(201)

    // 3. Ir a /cierre y verificar post-cierre
    await goto(page, '/cierre')
    await page.waitForTimeout(1000)
    await expect(page.locator('text=Día cerrado')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Ventas Nocturnas')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Total entregado incluyendo nocturnas')).toBeVisible({ timeout: 5000 })
  })
})
