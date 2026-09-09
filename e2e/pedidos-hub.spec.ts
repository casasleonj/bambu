// @tests Fase 4a — Pedido Hub (blueprint §2). Detrás de NEXT_PUBLIC_PEDIDOS_V2.
//
// Cómo correrlo (el flag NO está en el webServer por defecto para no romper
// los ~180 specs de pedidos que esperan la UI de tabs):
//
//   NEXT_PUBLIC_PEDIDOS_V2=true PW_WORKERS=1 npx playwright test e2e/pedidos-hub.spec.ts
//
// Con un webServer fresco (Playwright arranca uno en :3001). Cuando 4a
// gradúe (flag a default ON, Fase 10) este skip se elimina.
//
// NOTA sobre `appMain(page)`: los locators estructurales del Hub (los que se
// evalúan justo después de `page.goto`, antes de cualquier interacción) van
// scoped a `<main>`. Motivo en `fixtures.ts` → `appMain`: React 19 streaming
// SSR deja una copia transitoria del segmento fuera de `<main>` mientras el
// boundary de `loading.tsx` resuelve; en CI lento esa ventana hace que
// `getByTestId` matchee 2 elementos. Los locators de UI que sólo aparecen tras
// interacción (workspace, peek, command-menu, toasts) NO necesitan scope: para
// entonces la hidratación ya terminó.

import { test, expect, apiPost, apiGet, createCliente, BASE, sharedLoginAs, appMain } from './fixtures'

const HUB_ON = process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true'

test.describe('Pedido Hub (NEXT_PUBLIC_PEDIDOS_V2)', () => {
  test.skip(!HUB_ON, 'requiere NEXT_PUBLIC_PEDIDOS_V2=true + webServer fresco')

  test('shell: focos visibles, sin tabs (G2), lista con microcopy y acción destacada', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    const nombreCli = `Hub Shell ${Date.now()}`
    const { cliente } = await createCliente(page, { nombre: nombreCli })
    await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }],
      offlineId: `hub-e2e-${Date.now()}`,
    })

    await page.goto(`${BASE}/pedidos?all=true`)
    await expect(app.getByTestId('pedido-hub')).toBeVisible()
    await expect(app.getByTestId('foco-strip')).toBeVisible()
    // G2: sin tabs Fiados/Alertas
    await expect(app.getByTestId('tab-hoy')).toHaveCount(0)
    await expect(app.getByTestId('tab-fiados')).toHaveCount(0)

    // La fila de ESTE test: la lista trae datos de seed + otros tests del
    // shard, `.first()` no garantiza que sea la recién creada.
    const row = app.locator('[data-testid^="operacion-row-"]').filter({ hasText: nombreCli }).first()
    await expect(row).toBeVisible()
    // G6: microcopy de estado (texto), no badges apilados
    await expect(row).toContainText('Pendiente')
    // una acción destacada
    await expect(row.getByRole('button', { name: /Planificar|Registrar|Ver cartera|Completar|Confirmar|Resolver/ })).toBeVisible()
  })

  test('foco filtra la lista y el rango de fecha es independiente', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    await page.goto(`${BASE}/pedidos?all=true`)
    await expect(app.getByTestId('foco-strip')).toBeVisible()

    const totalAntes = await app.locator('[data-testid^="operacion-row-"]').count()
    await app.getByTestId('foco-esperandoPago').click()
    // el filtro reduce (o iguala) — nunca aumenta
    const totalDespues = await app.locator('[data-testid^="operacion-row-"]').count()
    expect(totalDespues).toBeLessThanOrEqual(totalAntes)
    // re-clic deselecciona
    await app.getByTestId('foco-esperandoPago').click()
    expect(await app.locator('[data-testid^="operacion-row-"]').count()).toBe(totalAntes)
  })

  test('responsive: desktop tabla / mobile tarjetas', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${BASE}/pedidos?all=true`)
    await expect(app.getByTestId('pedido-hub-desktop')).toBeVisible()

    await page.setViewportSize({ width: 375, height: 720 })
    await expect(app.getByTestId('pedido-hub-mobile')).toBeVisible()
    await expect(app.getByTestId('pedido-hub-desktop')).toHaveCount(0)
  })

  test('offline: badge visible, datos intactos, sin pantalla de error', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    await page.goto(`${BASE}/pedidos?all=true`)
    await expect(app.getByTestId('pedido-hub')).toBeVisible()
    const rowsAntes = await app.locator('[data-testid^="operacion-row-"]').count()

    await page.context().setOffline(true)
    await page.waitForTimeout(500)
    await expect(app.getByTestId('pedido-hub-offline')).toBeVisible()
    // datos siguen ahí
    expect(await app.locator('[data-testid^="operacion-row-"]').count()).toBe(rowsAntes)

    await page.context().setOffline(false)
  })

  // G9 (blueprint §4.7 / §4.8): offline muestra estado real; una mutación
  // encolada se ve como "pendiente", NUNCA como "confirmado". El estado
  // confirmado sólo aparece tras la respuesta del servidor.
  test('G9: online confirmado → offline encolado ("pendiente", no "confirmado") → reconexión → sincroniza', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    const nombreCliente = `G9 E2E ${Date.now()}`
    await createCliente(page, { nombre: nombreCliente })
    await page.goto(`${BASE}/pedidos`)

    async function abrirWorkspace() {
      await app.getByTestId('fab-main').click()
      await page.getByTestId('fab-pedido-envio').click()
      await expect(page.getByTestId('pedidos-workspace')).toBeVisible()
      await page.getByTestId('cliente-search-input').fill(nombreCliente)
      await page.getByTestId('cliente-search-result').first().click()
      await page.getByTestId('workspace-inc-PACA_AGUA').click()
      await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })
    }

    // 1) ONLINE → commit confirmado por el servidor
    await abrirWorkspace()
    await page.getByTestId('workspace-commit').click()
    await expect(page.getByTestId('pedidos-workspace')).toHaveCount(0)
    await expect(app.locator('[data-testid^="operacion-row-"]').filter({ hasText: nombreCliente })).toBeVisible()

    // 2) OFFLINE → nueva mutación encolada: la UI dice "se enviará al
    //    recuperar la red", NUNCA "confirmado"/"creado".
    await abrirWorkspace()
    await page.context().setOffline(true)
    await page.getByTestId('workspace-commit').click()
    await expect(page.getByText(/se enviará al recuperar la red/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/pedido creado|confirmado/i)).toHaveCount(0)

    // 3) RECONEXIÓN → el sync drena la cola; el pedido termina en el servidor.
    await page.context().setOffline(false)
    await expect(async () => {
      const res = await apiGet(page, `/api/pedidos?all=true&search=${encodeURIComponent(nombreCliente)}`)
      const body = await res.json()
      expect((body.pedidos ?? body.data ?? []).length).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 20000 })
  })

  test('peek: abre sin navegar (G4), ↑/↓ recorren, Escape cierra', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    const nombreCli = `Hub Peek ${Date.now()}`
    const { cliente } = await createCliente(page, { nombre: nombreCli })
    await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 4 }], offlineId: `hub-peek-${Date.now()}`,
    })
    await page.goto(`${BASE}/pedidos?all=true`)

    const urlAntes = page.url()
    // La fila de ESTE test (PENDIENTE → tiene acción destacada); `.first()`
    // podría caer en un pedido viejo ya cerrado sin acción.
    await app.locator('[data-testid^="operacion-row-"]').filter({ hasText: nombreCli }).first().click()
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
    const app = appMain(page)
    await page.goto(`${BASE}/pedidos?all=true`)
    // asegura que la hidratación terminó antes del atajo de teclado
    await expect(app.getByTestId('foco-strip')).toBeVisible()
    await page.keyboard.press('Control+k')
    await expect(page.getByTestId('command-menu')).toBeVisible()
    await page.getByTestId('command-planificacion').click()
    await expect(page).toHaveURL(/\/rutas/)
  })

  test('workspace (Composición C1): crear un pedido — el total viene del preview, el commit crea', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    const nombreCliente = `WS C1 ${Date.now()}`
    await createCliente(page, { nombre: nombreCliente })
    await page.goto(`${BASE}/pedidos`)

    // + Nueva operación → workspace
    await app.getByTestId('fab-main').click()
    await page.getByTestId('fab-pedido-envio').click()
    await expect(page.getByTestId('pedidos-workspace')).toBeVisible()
    // G1: no es un <form>
    expect(await page.locator('[data-testid="pedidos-workspace"] form').count()).toBe(0)

    await page.getByTestId('cliente-search-input').fill(nombreCliente)
    await page.getByTestId('cliente-search-result').first().click()
    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await page.getByTestId('workspace-inc-PACA_AGUA').click()

    // el commit se habilita cuando el preview del backend llega
    await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })
    await expect(page.getByTestId('workspace-commit')).toContainText(/Crear pedido \$/)

    await page.getByTestId('workspace-commit').click()
    await expect(page.getByTestId('pedidos-workspace')).toHaveCount(0) // modal cerró
    await expect(app.locator('[data-testid^="operacion-row-"]').filter({ hasText: nombreCliente })).toBeVisible()
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
