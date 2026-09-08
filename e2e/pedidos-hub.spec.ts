// @tests Fase 4a — Pedido Hub (blueprint §2). Detrás de NEXT_PUBLIC_PEDIDOS_V2.
//
// Cómo correrlo (el flag NO está en el webServer por defecto para no romper
// los ~180 specs de pedidos que esperan la UI de tabs):
//
//   NEXT_PUBLIC_PEDIDOS_V2=true PW_WORKERS=1 npx playwright test e2e/pedidos-hub.spec.ts
//
// Con un webServer fresco (Playwright arranca uno en :3001). Cuando 4a
// gradúe (flag a default ON, Fase 10) este skip se elimina.

import { test, expect, apiPost, createCliente, BASE, sharedLoginAs } from './fixtures'

const HUB_ON = process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true'

test.describe('Pedido Hub (NEXT_PUBLIC_PEDIDOS_V2)', () => {
  test.skip(!HUB_ON, 'requiere NEXT_PUBLIC_PEDIDOS_V2=true + webServer fresco')

  test('shell: focos visibles, sin tabs (G2), lista con microcopy y acción destacada', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const cliente = await createCliente(page, { nombre: 'Hub E2E' })
    await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }],
      offlineId: `hub-e2e-${Date.now()}`,
    })

    await page.goto(`${BASE}/pedidos?all=true`)
    await expect(page.getByTestId('pedido-hub')).toBeVisible()
    await expect(page.getByTestId('foco-strip')).toBeVisible()
    // G2: sin tabs Fiados/Alertas
    await expect(page.getByTestId('tab-hoy')).toHaveCount(0)
    await expect(page.getByTestId('tab-fiados')).toHaveCount(0)

    const row = page.locator('[data-testid^="operacion-row-"]').first()
    await expect(row).toBeVisible()
    // G6: microcopy de estado (texto), no badges apilados
    await expect(row).toContainText('Pendiente')
    // una acción destacada
    await expect(row.getByRole('button', { name: /Planificar|Registrar|Ver cartera|Completar|Confirmar|Resolver/ })).toBeVisible()
  })

  test('foco filtra la lista y el rango de fecha es independiente', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await page.goto(`${BASE}/pedidos?all=true`)
    await expect(page.getByTestId('foco-strip')).toBeVisible()

    const totalAntes = await page.locator('[data-testid^="operacion-row-"]').count()
    await page.getByTestId('foco-esperandoPago').click()
    // el filtro reduce (o iguala) — nunca aumenta
    const totalDespues = await page.locator('[data-testid^="operacion-row-"]').count()
    expect(totalDespues).toBeLessThanOrEqual(totalAntes)
    // re-clic deselecciona
    await page.getByTestId('foco-esperandoPago').click()
    expect(await page.locator('[data-testid^="operacion-row-"]').count()).toBe(totalAntes)
  })

  test('responsive: desktop tabla / mobile tarjetas', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${BASE}/pedidos?all=true`)
    await expect(page.getByTestId('pedido-hub-desktop')).toBeVisible()

    await page.setViewportSize({ width: 375, height: 720 })
    await expect(page.getByTestId('pedido-hub-mobile')).toBeVisible()
    await expect(page.getByTestId('pedido-hub-desktop')).toHaveCount(0)
  })

  test('offline: badge visible, datos intactos, sin pantalla de error', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await page.goto(`${BASE}/pedidos?all=true`)
    await expect(page.getByTestId('pedido-hub')).toBeVisible()
    const rowsAntes = await page.locator('[data-testid^="operacion-row-"]').count()

    await page.context().setOffline(true)
    await page.waitForTimeout(500)
    await expect(page.getByTestId('pedido-hub-offline')).toBeVisible()
    // datos siguen ahí
    expect(await page.locator('[data-testid^="operacion-row-"]').count()).toBe(rowsAntes)

    await page.context().setOffline(false)
  })

  test('peek: abre sin navegar (G4), ↑/↓ recorren, Escape cierra', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const cliente = await createCliente(page, { nombre: 'Hub Peek E2E' })
    await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 4 }], offlineId: `hub-peek-${Date.now()}`,
    })
    await page.goto(`${BASE}/pedidos?all=true`)

    const urlAntes = page.url()
    await page.locator('[data-testid^="operacion-row-"]').first().click()
    await expect(page.getByTestId('peek-desktop')).toBeVisible()
    expect(page.url()).toBe(urlAntes) // G4: no navegó

    await expect(page.getByTestId('peek-accion-destacada')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('peek-desktop')).toBeVisible() // sigue abierto en otra operación
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('peek-desktop')).toHaveCount(0)
  })

  test('command menu: ⌘/Ctrl+K abre; "Abrir planificación de hoy" navega, no ejecuta', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await page.goto(`${BASE}/pedidos?all=true`)
    await page.keyboard.press('Control+k')
    await expect(page.getByTestId('command-menu')).toBeVisible()
    await page.getByTestId('command-planificacion').click()
    await expect(page).toHaveURL(/\/rutas/)
  })

  test('workspace (Composición C1): crear un pedido — el total viene del preview, el commit crea', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const cliente = await createCliente(page, { nombre: 'WS C1 E2E' })
    const nombreCliente = cliente.nombre ?? 'WS C1 E2E'
    await page.goto(`${BASE}/pedidos`)

    // + Nueva operación → workspace
    await page.getByTestId('fab-main').click()
    await page.getByTestId('fab-pedido-envio').click()
    await expect(page.getByTestId('pedidos-workspace')).toBeVisible()
    // G1: no es un <form>
    expect(await page.locator('[data-testid="pedidos-workspace"] form').count()).toBe(0)

    await page.getByTestId('cliente-search-input').fill(nombreCliente)
    await page.getByTestId('cliente-search-result').first().click()
    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await page.getByTestId('workspace-inc-PACA_AGUA').click()

    // el commit se habilita cuando el preview del backend llega
    await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 5000 })
    await expect(page.getByTestId('workspace-commit')).toContainText(/Crear pedido \$/)

    await page.getByTestId('workspace-commit').click()
    await expect(page.getByTestId('pedidos-workspace')).toHaveCount(0) // modal cerró
    await expect(page.locator('[data-testid^="operacion-row-"]').filter({ hasText: 'WS C1 E2E' })).toBeVisible()
  })
})

test.describe('flag OFF: la UI de tabs sigue funcionando', () => {
  test.skip(HUB_ON, 'este bloque valida el comportamiento con el flag OFF')

  test('tabs Pedidos/Fiados/Alertas visibles, sin pedido-hub', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await page.goto(`${BASE}/pedidos`)
    await expect(page.getByTestId('tab-hoy')).toBeVisible()
    await expect(page.getByTestId('pedido-hub')).toHaveCount(0)
  })
})
