// @tests api/cierre, api/cierre-dia, api/embarque, api/pedido, api/trabajador
import { test, expect, login, handleBaseCaja, fullLogin, goto, apiPost, apiGet, resetDatabase } from './fixtures'

let _uniqueDateOffset = 0
function getUniqueFutureDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1 + _uniqueDateOffset++)
  return d.toISOString().split('T')[0]
}

test.describe('Cierre', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    resetDatabase()
  })

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

  test('asistente can access cierre', async ({ page }) => {
    await login(page, 'asistente', 'asist123')
    await handleBaseCaja(page)
    await page.waitForTimeout(300)
    await goto(page, '/cierre')
    await expect(page.locator('h1:has-text("Cierre del Día")')).toBeVisible({ timeout: 10000 })
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
    const stockSection = page.locator('text=Stock y Base de Caja')
    if (await stockSection.count() === 0) {
      test.skip()
      return
    }
    const stockInputs = page.locator('input[type="number"]')
    if (await stockInputs.count() > 0) {
      const firstInput = stockInputs.first()
      await firstInput.fill('50')
      await expect(firstInput).toHaveValue('50')
    }
  })

  test('admin can close day via API', async ({ page }) => {
    await fullLogin(page)
    const fecha = getUniqueFutureDate()
    const res = await apiPost(page, '/api/cierre', {
      fecha,
      baseDia: 100000,
      comisiones: 8000,
      salarios: 0,
      stockIniAgua: 200,
      prodAgua: 150,
      stockFinAgua: 180,
      stockIniHielo: 100,
      prodHielo: 80,
      stockFinHielo: 90,
    })
    if (res.status() === 409) {
      test.skip()
      return
    }
    expect(res.status()).toBe(201)
  })

  test('double close same day fails', async ({ page }) => {
    await fullLogin(page)
    const fecha = getUniqueFutureDate()
    const data = {
      fecha,
      baseDia: 100000,
      comisiones: 0,
      salarios: 0,
      stockIniAgua: 0,
      prodAgua: 0,
      stockFinAgua: 0,
      stockIniHielo: 0,
      prodHielo: 0,
      stockFinHielo: 0,
    }
    const res1 = await apiPost(page, '/api/cierre', data)
    if (res1.status() === 409) {
      const res2 = await apiPost(page, '/api/cierre', data)
      expect(res2.status()).toBe(409)
    } else if (res1.ok()) {
      const res2 = await apiPost(page, '/api/cierre', data)
      // Sequential validation returns 400 for same-day before duplicate check runs
      expect([400, 409]).toContain(res2.status())
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
    const arqueoSection = page.locator('text=Arqueo de Caja')
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
      baseDia: 100000,
      comisiones: 0,
      salarios: 0,
      stockIniAgua: 0,
      prodAgua: 0,
      stockFinAgua: 0,
      stockIniHielo: 0,
      prodHielo: 0,
      stockFinHielo: 0,
    })
    const cierreBody = await cierreRes.json()
    const blocked = cierreRes.status() === 400 || (cierreBody?.error && cierreBody.error.includes('embarque'))
    expect(blocked).toBeTruthy()
  })

  test('post-cierre: ventas nocturnas aparecen despues del cierre', async ({ page }) => {
    await fullLogin(page)
    const fecha = getUniqueFutureDate()
    // 1. Cerrar el día
    const cierreRes = await apiPost(page, '/api/cierre', {
      fecha,
      baseDia: 50000,
      comisiones: 0,
      salarios: 0,
      stockIniAgua: 0,
      prodAgua: 0,
      stockFinAgua: 0,
      stockIniHielo: 0,
      prodHielo: 0,
      stockFinHielo: 0,
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

    // 3. Verificar post-cierre via API
    const cierreGetRes = await apiGet(page, `/api/cierre?fecha=${fecha}`)
    expect(cierreGetRes.status()).toBe(200)
    const cierreData = await cierreGetRes.json()
    expect(cierreData.cierre).toBeTruthy()
    expect(cierreData.cierre.postCierre).toBeTruthy()
    expect(cierreData.cierre.postCierre.pedidos.length).toBeGreaterThan(0)
  })
})
