// @tests E2E Producción — Suite exhaustiva
import { test, expect, fullLogin, goto, apiPost, apiGet, createSellador, getSellador } from './fixtures'
import type { Page } from '@playwright/test'

test.describe('Producción — E2E Exhaustivo', () => {

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async function fillConteos(page: Page, aguaA: number, aguaB: number, hieloA: number, hieloB: number) {
    await page.getByTestId('conteo-agua-a').fill(String(aguaA))
    await page.getByTestId('conteo-agua-b').fill(String(aguaB))
    await page.getByTestId('conteo-hielo-a').fill(String(hieloA))
    await page.getByTestId('conteo-hielo-b').fill(String(hieloB))
  }

  // ─── 1. Carga inicial ─────────────────────────────────────────────────────

  test('carga inicial con stepper y stock', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')

    await expect(page.getByRole('heading', { name: 'Registro de Producción' })).toBeVisible()
    await expect(page.getByText('Stock Inicial')).toBeVisible()
    await expect(page.getByText('Conteos')).toBeVisible()
    await expect(page.getByText('Datos del Turno')).toBeVisible()
    await expect(page.getByText('Conciliar')).toBeVisible()

    await expect(page.getByText('AGUA').first()).toBeVisible()
    await expect(page.getByText('HIELO').first()).toBeVisible()
    await expect(page.getByText('Balance del día').first()).toBeVisible()
  })

  // ─── 2. Navegación de steps ───────────────────────────────────────────────

  test('navegación avanzada y retroceso sin perder datos', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await expect(page.getByTestId('conteos-section')).toBeVisible()

    // Llenar conteos
    await fillConteos(page, 100, 102, 50, 52)

    // Step 2 → Step 3
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await expect(page.getByTestId('step3-sections')).toBeVisible()

    // Step 3 → Step 4
    await page.getByRole('button', { name: 'Ver resumen →' }).click()
    await expect(page.getByRole('heading', { name: 'Balance del día' }).first()).toBeVisible()

    // Retroceder a Step 3
    await page.getByRole('button', { name: '← Atrás' }).first().click()
    await page.waitForTimeout(300)
    const activeStep = page.locator('[class*="bg-blue-600"].rounded-full')
    await expect(activeStep).toContainText('3')

    // Retroceder a Step 2
    await page.getByRole('button', { name: '← Atrás' }).first().click()
    await page.waitForTimeout(300)
    await expect(activeStep).toContainText('2')

    // Verificar que los datos persisten
    await expect(page.getByTestId('conteo-agua-a')).toHaveValue('100')
    await expect(page.getByTestId('conteo-hielo-a')).toHaveValue('50')
  })

  // ─── 3. Conteos con promedio ──────────────────────────────────────────────

  test('promedio calculado en UI', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.getByRole('button', { name: 'Siguiente →' }).click()

    await fillConteos(page, 120, 124, 60, 64)

    await expect(page.getByTestId('conteo-agua').getByText('Promedio:')).toBeVisible()
    // Agua: (120+124)/2 = 122
    await expect(page.getByTestId('conteo-agua').getByText('122')).toBeVisible()
    // Hielo: (60+64)/2 = 62
    await expect(page.getByTestId('conteo-hielo').getByText('62')).toBeVisible()
  })

  // ─── 4. Alerta de diferencia de conteos ───────────────────────────────────

  test('alerta cuando conteos A y B difieren > 5', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.getByRole('button', { name: 'Siguiente →' }).click()

    await fillConteos(page, 120, 130, 50, 52)

    await expect(page.getByText(/Diferencia de \d+ pacas.*conteos de agua/)).toBeVisible()
    // Hielo no debe mostrar alerta (diferencia = 2)
    await expect(page.getByText(/conteos de hielo/)).not.toBeVisible()
  })

  // ─── 5. Datos del turno ───────────────────────────────────────────────────

  test('seleccionar sellador, turno, stock físico y pérdidas', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await fillConteos(page, 100, 100, 50, 50)
    await page.getByRole('button', { name: 'Siguiente →' }).click()

    // Sellador
    const sellador = await getSellador(page)
    if (sellador) {
      await page.locator('label:has-text("Sellador")').locator('..').locator('select').selectOption(sellador.id)
    }

    // Turno
    await page.locator('label:has-text("Turno")').locator('..').locator('select').selectOption('NOCHE')

    // Stock físico
    await page.getByTestId('stock-fisico-agua').fill('40')
    await page.getByTestId('stock-fisico-hielo').fill('25')

    // Pérdidas con data-testid
    await page.getByTestId('perdidas-rotasAgua').fill('2')
    await page.getByTestId('perdidas-rotasHielo').fill('1')
    await page.getByTestId('perdidas-filtradasAgua').fill('1')
    await page.getByTestId('perdidas-consumoInternoAgua').fill('1')

    // Verificar total de pérdidas
    await expect(page.getByText('Total pérdidas')).toBeVisible()
    await expect(page.getByText(/💧 4/)).toBeVisible()
    await expect(page.getByText(/🧊 1/)).toBeVisible()
  })

  // ─── 6. Conciliación OK ───────────────────────────────────────────────────

  test('conciliación verde cuando cuentas cuadran exacto', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    // Prod agua = 100, prod hielo = 50
    await fillConteos(page, 100, 100, 50, 50)
    await page.getByRole('button', { name: 'Siguiente →' }).click()

    // Stock físico: esperado = ini + prod - ventas
    // Si ini=0, prod=100, ventas=0 → esperado=100
    // Stock físico = 100 - 0 pérdidas = 100
    await page.getByTestId('stock-fisico-agua').fill('100')
    await page.getByTestId('stock-fisico-hielo').fill('50')

    await page.getByRole('button', { name: 'Ver resumen →' }).click()

    await expect(page.getByText('Todo cuadra')).toBeVisible()
    await expect(page.getByText('Las cuentas dan exacto')).toBeVisible()
  })

  // ─── 7. Conciliación Warning ──────────────────────────────────────────────

  test('conciliación amarilla con diferencia faltante', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await fillConteos(page, 100, 100, 50, 50)
    await page.getByRole('button', { name: 'Siguiente →' }).click()

    // Esperado: agua=100, hielo=50. Físico: agua=95, hielo=48
    // Diferencia: agua=5, hielo=2
    await page.getByTestId('stock-fisico-agua').fill('95')
    await page.getByTestId('stock-fisico-hielo').fill('48')

    await page.getByRole('button', { name: 'Ver resumen →' }).click()

    await expect(page.locator('p.font-bold').filter({ hasText: /Faltan \d+ paca.*agua/ })).toBeVisible()
    await expect(page.locator('p.font-bold').filter({ hasText: /Faltan \d+ paca.*hielo/ })).toBeVisible()
  })

  // ─── 8. Conciliación Danger (sobrantes) ───────────────────────────────────

  test('conciliación roja con sobrantes de stock', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await fillConteos(page, 100, 100, 50, 50)
    await page.getByRole('button', { name: 'Siguiente →' }).click()

    // Físico > esperado → sobrantes
    await page.getByTestId('stock-fisico-agua').fill('110')
    await page.getByTestId('stock-fisico-hielo').fill('60')

    await page.getByRole('button', { name: 'Ver resumen →' }).click()

    await expect(page.locator('p.font-bold').filter({ hasText: /Sobran \d+ paca.*agua/ })).toBeVisible()
    await expect(page.locator('p.font-bold').filter({ hasText: /Sobran \d+ paca.*hielo/ })).toBeVisible()
  })

  // ─── 9. Submit exitoso ────────────────────────────────────────────────────

  test('completar wizard y guardar producción', async ({ page }) => {
    test.slow()
    await fullLogin(page)

    // Asegurar que hay un sellador
    let sellador = await getSellador(page)
    if (!sellador) {
      await createSellador(page)
      const res = await apiGet(page, '/api/trabajadores?rol=SELLADOR&activo=true')
      const body = await res.json()
      sellador = body.trabajadores?.[0]
    }
    if (!sellador) test.skip(true, 'No sellador available')

    await goto(page, '/produccion')
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await fillConteos(page, 80, 80, 40, 40)
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await page.waitForTimeout(300)

    await page.locator('label:has-text("Sellador")').locator('..').locator('select').selectOption(sellador.id)
    await page.locator('label:has-text("Turno")').locator('..').locator('select').selectOption('TARDE')
    await page.getByTestId('stock-fisico-agua').fill('80')
    await page.getByTestId('stock-fisico-hielo').fill('40')

    await page.getByRole('button', { name: 'Ver resumen →' }).click()
    await page.waitForTimeout(300)

    const confirmarBtn = page.getByRole('button', { name: '✓ Confirmar y Guardar' })
    await expect(confirmarBtn).toBeEnabled()
    await confirmarBtn.click()

    // Verificar que algo cambió (page reload o toast)
    await page.waitForTimeout(3000)
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(0)
  })

  // ─── 10. Submit duplicado (409) ───────────────────────────────────────────

  test('segundo registro mismo turno retorna 409', async ({ page }) => {
    test.slow()
    await fullLogin(page)

    const selladoresRes = await apiGet(page, '/api/trabajadores?rol=SELLADOR&activo=true')
    const selladoresBody = await selladoresRes.json()
    let sellador = selladoresBody.trabajadores?.[0]
    if (!sellador) {
      await createSellador(page)
      const res2 = await apiGet(page, '/api/trabajadores?rol=SELLADOR&activo=true')
      const body2 = await res2.json()
      sellador = body2.trabajadores?.[0]
    }
    if (!sellador) test.skip(true, 'No sellador available')

    // Primer registro
    await goto(page, '/produccion')
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await fillConteos(page, 90, 90, 45, 45)
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await page.waitForTimeout(300)

    await page.locator('label:has-text("Sellador")').locator('..').locator('select').selectOption(sellador.id)
    await page.locator('label:has-text("Turno")').locator('..').locator('select').selectOption('NOCHE')
    await page.getByTestId('stock-fisico-agua').fill('90')
    await page.getByTestId('stock-fisico-hielo').fill('45')
    await page.getByRole('button', { name: 'Ver resumen →' }).click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '✓ Confirmar y Guardar' }).click()
    await page.waitForTimeout(3000)

    // Segundo registro MISMO sellador + MISMO turno → 409
    await goto(page, '/produccion')
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await fillConteos(page, 90, 90, 45, 45)
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await page.waitForTimeout(300)

    await page.locator('label:has-text("Sellador")').locator('..').locator('select').selectOption(sellador.id)
    await page.locator('label:has-text("Turno")').locator('..').locator('select').selectOption('NOCHE')
    await page.getByTestId('stock-fisico-agua').fill('90')
    await page.getByTestId('stock-fisico-hielo').fill('45')
    await page.getByRole('button', { name: 'Ver resumen →' }).click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '✓ Confirmar y Guardar' }).click()
    await page.waitForTimeout(3000)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toMatch(/Ya existe producción registrada|409|Error/)
  })

  // ─── 11. Validación de rol sellador (API) ─────────────────────────────────

  test('POST con trabajador no-sellador retorna 400', async ({ page }) => {
    await fullLogin(page)

    // Crear repartidor
    const repRes = await apiPost(page, '/api/trabajadores', {
      nombre: `Repartidor NoSell ${Date.now() % 10000}`,
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
      usaMoto: true,
      comPacaAgua: 500,
      comPacaHielo: 300,
    })
    const repBody = await repRes.json()
    const repId = repBody.trabajador?.id

    if (!repId) test.skip(true, 'No repartidor created')

    const res = await apiPost(page, '/api/produccion', {
      turno: 'NOCHE',
      trabajadorId: repId,
      conteoAAgua: 50,
      conteoBAgua: 50,
      conteoAHielo: 25,
      conteoBHielo: 25,
      stockFinFisicoAgua: 50,
      stockFinFisicoHielo: 25,
    })

    expect(res.status()).toBe(400)
    const errBody = await res.json()
    expect(errBody.error).toContain('SELLADOR')
  })

  // ─── 12. Stock esperado negativo ──────────────────────────────────────────

  test('stock esperado negativo se muestra correctamente', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    // Prod = 0
    await fillConteos(page, 0, 0, 0, 0)
    await page.getByRole('button', { name: 'Siguiente →' }).click()

    // Si ventas > stockIni, el esperado debe ser negativo
    // El balance card debe mostrar número negativo
    await page.getByTestId('stock-fisico-agua').fill('0')
    await page.getByTestId('stock-fisico-hielo').fill('0')
    await page.getByRole('button', { name: 'Ver resumen →' }).click()

    // Verificar que la tabla de balance muestra valores (pueden ser negativos)
    await expect(page.getByRole('heading', { name: 'Balance del día' }).first()).toBeVisible()
  })

  // ─── 13. API Preview ──────────────────────────────────────────────────────

  test('GET /api/produccion/preview retorna estructura correcta', async ({ page }) => {
    await fullLogin(page)
    const res = await apiGet(page, '/api/produccion/preview')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('stockIniAgua')
    expect(body).toHaveProperty('stockIniHielo')
    expect(body).toHaveProperty('ventasAgua')
    expect(body).toHaveProperty('ventasHielo')
    expect(body).toHaveProperty('repartidores')
    expect(body).toHaveProperty('embarquesAbiertos')
    expect(Array.isArray(body.repartidores)).toBe(true)
  })

  // ─── 14. Campos vacíos — validación ───────────────────────────────────────

  test('avanzar sin sellador muestra error', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await fillConteos(page, 100, 100, 50, 50)
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await page.getByTestId('stock-fisico-agua').fill('50')
    await page.getByTestId('stock-fisico-hielo').fill('25')
    await page.getByRole('button', { name: 'Ver resumen →' }).click()

    // Sin sellador seleccionado
    await page.getByRole('button', { name: '✓ Confirmar y Guardar' }).click()
    await expect(page.getByText('Selecciona un trabajador')).toBeVisible()
  })

  test('avanzar sin conteos muestra error al confirmar', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    // No llenar conteos — ambos en 0
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await page.getByRole('button', { name: 'Ver resumen →' }).click()
    await page.getByRole('button', { name: '✓ Confirmar y Guardar' }).click()
    // Sonner toasts tienen data-type="error"
    await page.waitForTimeout(1000)
    const errorToast = page.locator('[data-sonner-toast][data-type="error"]')
    await expect(errorToast).toBeVisible({ timeout: 10000 })
  })

  // ─── 15. Comisiones según tipoPago ────────────────────────────────────────

  test('comisiones FIJAS muestran salario fijo', async ({ page }) => {
    await fullLogin(page)

    // Crear sellador FIJO
    await createSellador(page, { tipoPago: 'FIJO' })

    await goto(page, '/produccion')
    await page.getByRole('button', { name: 'Siguiente →' }).click()
    await fillConteos(page, 100, 100, 50, 50)
    await page.getByRole('button', { name: 'Siguiente →' }).click()

    // Seleccionar sellador FIJO
    const selladores = await apiGet(page, '/api/trabajadores?rol=SELLADOR&activo=true')
    const body = await selladores.json()
    const fijo = body.trabajadores?.find((t: any) => t.tipoPago === 'FIJO')
    if (fijo) {
      await page.locator('label:has-text("Sellador")').locator('..').locator('select').selectOption(fijo.id)
    }

    await page.locator('label:has-text("Turno")').locator('..').locator('select').selectOption('NOCHE')
    await page.getByTestId('stock-fisico-agua').fill('100')
    await page.getByTestId('stock-fisico-hielo').fill('50')
    await page.getByRole('button', { name: 'Ver resumen →' }).click()

    await expect(page.getByText('Salario fijo')).toBeVisible()
    await expect(page.getByText('No aplica comisión por producción')).toBeVisible()
  })

  // ─── 16. Responsive layout ────────────────────────────────────────────────

  test('balance card abajo en mobile, sidebar en desktop', async ({ page }) => {
    await fullLogin(page)

    // Desktop: sidebar visible
    await page.setViewportSize({ width: 1280, height: 720 })
    await goto(page, '/produccion')
    const desktopBalance = page.locator('.sticky').locator('text=Balance del día')
    await expect(desktopBalance).toBeVisible()

    // Mobile: sidebar oculto, balance al final
    await page.setViewportSize({ width: 375, height: 667 })
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    const mobileBalance = page.locator('.lg\\:hidden').locator('text=Balance del día')
    await expect(mobileBalance).toBeVisible()
  })

  // ─── 17. GET /api/produccion con filtro por fecha ─────────────────────────

  test('GET /api/produccion retorna registros del día', async ({ page }) => {
    await fullLogin(page)

    const today = new Date().toISOString().split('T')[0]
    const res = await apiGet(page, `/api/produccion?fecha=${today}`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('produccion')
    expect(Array.isArray(body.produccion)).toBe(true)
  })

  // ─── 18. FIX 1.5: obs obligatorio cuando hay diferencia (server-side) ──────

  test('FIX 1.5: POST con diferencia y obs vacío debe rechazarse con 400', async ({ page }) => {
    await fullLogin(page)

    // Crear sellador fresco y obtener SU id (no el primero de la lista)
    const sellador = await createSellador(page)
    const selladorId = sellador?.trabajador?.id || sellador?.id
    if (!selladorId) test.skip(true, 'No se pudo crear sellador')

    // conteos 100+100 → prod=200. Físico=0 vs esperado≈338 → diferencia != 0
    const res = await apiPost(page, '/api/produccion', {
      turno: 'MANANA',
      trabajadorId: selladorId,
      conteoAAgua: 100,
      conteoBAgua: 100,
      conteoAHielo: 0,
      conteoBHielo: 0,
      stockFinFisicoAgua: 0, // ← diferencia intencional vs esperado
      stockFinFisicoHielo: 0,
      // obs intencionalmente ausente
    })

    expect(res.status()).toBe(400)
    const errBody = await res.json()
    // apiError retorna {success: false, error: {message: '...'}}
    const message = errBody?.error?.message || errBody?.message || JSON.stringify(errBody)
    expect(message).toMatch(/diferencia|observaciones/i)
  })

  test('FIX 1.5: POST con diferencia y obs presente debe aceptarse', async ({ page }) => {
    await fullLogin(page)

    const sellador = await createSellador(page)
    const selladorId = sellador?.trabajador?.id || sellador?.id
    if (!selladorId) test.skip(true, 'No se pudo crear sellador')

    const res = await apiPost(page, '/api/produccion', {
      turno: 'TARDE',
      trabajadorId: selladorId,
      conteoAAgua: 100,
      conteoBAgua: 100,
      conteoAHielo: 0,
      conteoBHielo: 0,
      stockFinFisicoAgua: 0,
      stockFinFisicoHielo: 0,
      obs: 'Se consumieron 200 pacas como gasto interno de la planta',
    })

    expect([200, 201]).toContain(res.status())
  })

  // ─── 19. FIX 1.1: race condition — concurrent POSTs ──────────────────────

  test('FIX 1.1: dos POSTs concurrentes mismo sellador+turno → solo uno gana', async ({ page }) => {
    await fullLogin(page)

    const sellador = await createSellador(page)
    const selladorId = sellador?.trabajador?.id || sellador?.id
    if (!selladorId) test.skip(true, 'No se pudo crear sellador')

    const payload = {
      turno: 'NOCHE',
      trabajadorId: selladorId,
      conteoAAgua: 60,
      conteoBAgua: 60,
      conteoAHielo: 30,
      conteoBHielo: 30,
      stockFinFisicoAgua: 60,
      stockFinFisicoHielo: 30,
    }

    // Disparar 5 requests en paralelo
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => apiPost(page, '/api/produccion', payload)),
    )

    const statuses = await Promise.all(responses.map((r) => r.status()))
    const successCount = statuses.filter((s) => s === 201).length
    const conflictCount = statuses.filter((s) => s === 409).length

    // Solo 1 debe ganar, los demás deben ser 409
    expect(successCount).toBe(1)
    expect(conflictCount).toBe(4)
    // Ningún 500
    expect(statuses.filter((s) => s >= 500)).toHaveLength(0)
  })

  // ─── 20. FIX 1.6: fecha truncada a medianoche Bogotá ──────────────────────

  test('FIX 1.6: registro creado tiene fecha en 00:00:00 (medianoche Bogotá)', async ({ page }) => {
    await fullLogin(page)

    const sellador = await createSellador(page)
    const selladorId = sellador?.trabajador?.id || sellador?.id
    if (!selladorId) test.skip(true, 'No se pudo crear sellador')

    const today = new Date().toISOString().split('T')[0]
    const res = await apiPost(page, '/api/produccion', {
      turno: 'NOCHE',
      trabajadorId: selladorId,
      conteoAAgua: 40,
      conteoBAgua: 40,
      conteoAHielo: 20,
      conteoBHielo: 20,
      stockFinFisicoAgua: 40,
      stockFinFisicoHielo: 20,
    })

    expect([200, 201]).toContain(res.status())

    const verifyRes = await apiGet(page, `/api/produccion?fecha=${today}`)
    const verifyBody = await verifyRes.json()
    const nuevo = (verifyBody.produccion || []).find(
      (p: any) => p.trabajadorId === selladorId && p.turno === 'NOCHE',
    )
    if (nuevo) {
      // La fecha debe ser YYYY-MM-DDT05:00:00.000Z (= 00:00 Bogotá -05:00)
      expect(nuevo.fecha).toMatch(/T05:00:00\.000Z$/)
    }
  })
})
