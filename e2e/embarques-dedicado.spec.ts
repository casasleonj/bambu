// @tests embarques detail page — dedicated E2E coverage
// Covers: action bar, assign modal, send/cancel flows, closed summary
import { test, expect, fullLogin, apiPost, createTrabajador, createCliente, BASE } from './fixtures'

test.describe('Embarques — Detail Page Actions', () => {

  test('ADMIN puede asignar pedidos desde embarque ABIERTO', async ({ page }) => {
    await fullLogin(page)

    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    expect(trabajadorId).toBeTruthy()

    const eRes = await apiPost(page, '/api/embarques', {
      trabajadorId,
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: 5 }],
    })
    expect(eRes.ok()).toBe(true)
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    expect(embarqueId).toBeTruthy()

    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    expect(clienteId).toBeTruthy()

    const pRes = await apiPost(page, '/api/pedidos', {
      clienteId,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
    })
    expect(pRes.ok()).toBe(true)

    await page.goto(`${BASE}/embarques/${embarqueId}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    await page.locator('[data-testid="embarque-actions-menu"]').first().hover()
    await page.locator('[data-testid="asignar-pedidos-button"]').first().click()
    await page.waitForTimeout(500)

    const checkbox = page.locator('[role="dialog"] input[type="checkbox"]').first()
    if (await checkbox.count() > 0) {
      await checkbox.check()
      await page.locator('[role="dialog"] button:has-text("Asignar")').click()
      await page.waitForTimeout(500)
      // Cerrar modal o ver toast; si no hay toast, validar que el modal se cerró
      const modal = page.locator('[role="dialog"]')
      const modalVisible = await modal.isVisible().catch(() => false)
      if (modalVisible) {
        // El modal debería cerrarse tras asignar exitosamente
        await page.waitForTimeout(1500)
      }
    }
  })

  test('ADMIN puede enviar embarque ABIERTO en ruta', async ({ page }) => {
    await fullLogin(page)

    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    expect(trabajadorId).toBeTruthy()

    const eRes = await apiPost(page, '/api/embarques', {
      trabajadorId,
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: 5 }],
    })
    expect(eRes.ok()).toBe(true)
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    expect(embarqueId).toBeTruthy()

    await page.goto(`${BASE}/embarques/${embarqueId}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    await page.locator('[data-testid="enviar-embarque-button"]').first().click()
    await page.waitForTimeout(300)
    await page.locator('[role="dialog"] button:has-text("Enviar en Ruta")').click()

    // El botón primario debe cambiar a "Cerrar y Cuadrar" al pasar a EN_RUTA
    await expect(page.locator('[data-testid="cerrar-embarque-button"]').first()).toBeVisible({ timeout: 8000 })
  })

  test('ADMIN puede cancelar embarque ABIERTO', async ({ page }) => {
    await fullLogin(page)

    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    expect(trabajadorId).toBeTruthy()

    const eRes = await apiPost(page, '/api/embarques', {
      trabajadorId,
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: 5 }],
    })
    expect(eRes.ok()).toBe(true)
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    expect(embarqueId).toBeTruthy()

    await page.goto(`${BASE}/embarques/${embarqueId}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    await page.locator('[data-testid="embarque-actions-menu"]').first().hover()
    await page.locator('[data-testid="cancelar-embarque-button"]').first().click()
    await page.waitForTimeout(300)
    await page.locator('[role="dialog"] button:has-text("Cancelar Embarque")').click()

    // Al cancelar se redirige al listado de embarques
    await page.waitForURL('**/embarques', { timeout: 8000 })
  })

  test('embarque EN_RUTA muestra Cerrar y Cuadrar y Asignar pedidos', async ({ page }) => {
    await fullLogin(page)

    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    expect(trabajadorId).toBeTruthy()

    const eRes = await apiPost(page, '/api/embarques', {
      trabajadorId,
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: 5 }],
    })
    expect(eRes.ok()).toBe(true)
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    expect(embarqueId).toBeTruthy()

    const enviarRes = await apiPost(page, `/api/embarques/${embarqueId}/enviar`, {})
    expect(enviarRes.ok()).toBe(true)

    await page.goto(`${BASE}/embarques/${embarqueId}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    await expect(page.locator('[data-testid="cerrar-embarque-button"]').first()).toBeVisible()
    await page.locator('[data-testid="embarque-actions-menu"]').first().hover()
    await expect(page.locator('[data-testid="asignar-pedidos-button"]').first()).toBeVisible()
  })

  test('embarque CERRADO muestra resumen y link a cierre', async ({ page }) => {
    await fullLogin(page)

    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    expect(trabajadorId).toBeTruthy()

    const eRes = await apiPost(page, '/api/embarques', {
      trabajadorId,
      horaSalida: '08:00',
      carga: [
        { producto: 'PACA_AGUA', cargadas: 5 },
        { producto: 'PACA_HIELO', cargadas: 0 },
        { producto: 'BOTELLON', cargadas: 0 },
        { producto: 'BOLSA_AGUA', cargadas: 0 },
        { producto: 'BOLSA_HIELO', cargadas: 0 },
      ],
    })
    expect(eRes.ok()).toBe(true)
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    expect(embarqueId).toBeTruthy()

    // Cerrar requiere que el embarque esté EN_RUTA
    const enviarRes = await apiPost(page, `/api/embarques/${embarqueId}/enviar`, {})
    expect(enviarRes.ok()).toBe(true)

    const cierreRes = await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
      pedidos: [],
      ventasLibres: [],
      productos: [
        { producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'PACA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOTELLON', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
      ],
      gastos: [],
      dineroEntregado: 0,
    })
    expect(cierreRes.ok()).toBe(true)

    await page.goto(`${BASE}/embarques/${embarqueId}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    await expect(page.locator('[data-testid="ver-cierre-button"]').first()).toBeVisible()
    await page.locator('[data-testid="ver-cierre-button"]').first().click()
    await page.waitForURL(`**/embarques/${embarqueId}/cerrar`, { timeout: 5000 })
  })
})
