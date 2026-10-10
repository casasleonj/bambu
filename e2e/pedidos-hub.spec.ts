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
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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

  // F10a-preflight, gate F10-2 (fase-composicion-c4-edit-plan.md): los flujos
  // activos en producción deben pasar por el workspace con el flag ON.
  // "Editar VENTA_RAPIDA" y "entregar después" no son alcanzables hoy: sin
  // NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR una venta rápida nace ENTREGADA
  // (CrearPedidoUseCase) y el detalle solo ofrece "Editar" en PENDIENTE.
  // P0 (docs/pedidos/HUB_REVISION_INTEGRAL_v1.0.md): esta prueba pasaba
  // mientras el Hub creaba ventas SIN Pago — solo miraba la respuesta HTTP.
  // Ahora verifica el resultado económico real en la base de datos.
  test('workspace (P0): venta rápida pagada en efectivo — Pago persistido, PAGADO, saldo 0', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    await page.goto(`${BASE}/pedidos`)

    await app.getByTestId('fab-main').click()
    await page.getByTestId('fab-venta-rapida').click()
    await expect(page.getByTestId('pedidos-workspace')).toBeVisible()
    await expect(page.getByTestId('workspace-venta-rapida')).toBeVisible()

    // el saldo a favor de CONSUMIDOR_FINAL no debe moverse con ninguna venta
    // (antes el cambio se acreditaba ahí — HUB_REVISION_INTEGRAL §11).
    const cfAntes = Number((await prisma.cliente.findUniqueOrThrow({ where: { id: 'CONSUMIDOR_FINAL' } })).saldoFavor)

    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    // sin cobro: la venta anónima no se puede confirmar (DEUDOR_REQUERIDO)
    await expect(page.getByTestId('dinero-deudor-requerido')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('workspace-commit')).toBeDisabled()

    await page.getByTestId('dinero-pagar-completo-EFECTIVO').click()
    await expect(page.getByTestId('dinero-saldo')).toHaveText('Pagado', { timeout: 10000 })
    // recibido/cambio es ayuda de caja: no cambia lo aplicado
    await page.getByTestId('dinero-recibido').fill('20000')
    await expect(page.getByTestId('dinero-cambio')).toBeVisible()
    await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })

    const creado = page.waitForResponse((r) => r.url().endsWith('/api/pedidos') && r.request().method() === 'POST')
    await page.getByTestId('workspace-commit').click()
    const res = await creado
    expect(res.status()).toBeLessThan(300)
    const body = await res.json()
    const pedidoId = (body.data?.pedido ?? body.pedido).id as string
    await expect(page.getByTestId('pedidos-workspace')).toHaveCount(0)

    const enBD = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { pagos: true } })
    const total = Number(enBD.total)
    expect(enBD.origen).toBe('VENTA_RAPIDA')
    expect(enBD.clienteId).toBe('CONSUMIDOR_FINAL')
    expect(enBD.estadoEntrega).toBe('ENTREGADO')
    expect(enBD.estadoPago).toBe('PAGADO')
    expect(Number(enBD.saldo)).toBe(0)
    expect(enBD.pagos).toHaveLength(1)
    expect(enBD.pagos[0].metodo).toBe('EFECTIVO')
    // se persiste lo APLICADO (= total), no el billete recibido
    expect(Number(enBD.pagos[0].monto)).toBe(total)
    const cf = await prisma.cliente.findUniqueOrThrow({ where: { id: 'CONSUMIDOR_FINAL' } })
    expect(Number(cf.saldoFavor)).toBe(cfAntes)
  })

  test('workspace (P0): venta rápida con pago combinado — un Pago por método', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    await page.goto(`${BASE}/pedidos`)

    await app.getByTestId('fab-main').click()
    await page.getByTestId('fab-venta-rapida').click()
    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await page.getByTestId('dinero-pagar-completo-NEQUI').click()
    await expect(page.getByTestId('dinero-saldo')).toHaveText('Pagado', { timeout: 10000 })

    // partir el cobro: 1000 en efectivo, el resto por Nequi
    const total = Number(await page.getByTestId('dinero-pago-monto-0').inputValue())
    await page.getByTestId('dinero-pago-monto-0').fill(String(total - 1000))
    await page.getByTestId('dinero-agregar-EFECTIVO').click()
    await expect(page.getByTestId('dinero-pago-monto-1')).toHaveValue('1000')
    await expect(page.getByTestId('dinero-saldo')).toHaveText('Pagado', { timeout: 10000 })
    await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })

    const creado = page.waitForResponse((r) => r.url().endsWith('/api/pedidos') && r.request().method() === 'POST')
    await page.getByTestId('workspace-commit').click()
    const body = await (await creado).json()
    const pedidoId = (body.data?.pedido ?? body.pedido).id as string

    const enBD = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { pagos: true } })
    expect(enBD.estadoPago).toBe('PAGADO')
    expect(enBD.pagos.map((p) => p.metodo).sort()).toEqual(['EFECTIVO', 'NEQUI'])
    expect(enBD.pagos.reduce((s, p) => s + Number(p.monto), 0)).toBe(Number(enBD.total))
  })

  test('workspace (F10-2 / C4): editar un PEDIDO — "Guardar cambios" hace PUT y persiste la cantidad', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const nombreCli = `WS C4 ${Date.now()}`
    const { cliente } = await createCliente(page, { nombre: nombreCli })
    const creadoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 3 }],
      offlineId: `hub-c4-${Date.now()}`,
    })
    const creadoBody = await creadoRes.json()
    const pedidoId: string = (creadoBody.data?.pedido ?? creadoBody.pedido).id

    await page.goto(`${BASE}/pedidos?all=true&openPedido=${pedidoId}`)
    await page.getByRole('button', { name: /Editar/ }).click()
    await expect(page.getByTestId('pedidos-workspace')).toBeVisible()
    await expect(page.getByTestId('workspace-canal-fijo')).toBeVisible()
    await expect(page.getByTestId('workspace-cant-PACA_AGUA')).toHaveValue('3')

    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await expect(page.getByTestId('workspace-cant-PACA_AGUA')).toHaveValue('4')
    await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })
    await expect(page.getByTestId('workspace-commit')).toContainText('Guardar cambios')

    const put = page.waitForResponse((r) => r.url().endsWith(`/api/pedidos/${pedidoId}`) && r.request().method() === 'PUT')
    await page.getByTestId('workspace-commit').click()
    expect((await put).status()).toBe(200)
    await expect(page.getByTestId('pedidos-workspace')).toHaveCount(0)

    // GET /api/pedidos/[id] → { pedido } con items del DTO (cantPedido).
    const detalle = await (await apiGet(page, `/api/pedidos/${pedidoId}`)).json()
    const items = detalle.pedido.items as Array<{ producto: string; cantPedido: number }>
    expect(items.find((i) => i.producto === 'PACA_AGUA')?.cantPedido).toBe(4)
  })
})

test.describe('flag OFF: la UI de tabs sigue funcionando', () => {
  test.skip(HUB_ON, 'este bloque valida el comportamiento con el flag OFF')

  test('tabs Pedidos/Fiados/Alertas visibles, sin pedido-hub', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    // Scoped a <main> (ver NOTA de cabecera): sin esto, la copia transitoria
    // del streaming SSR hace que `tab-hoy` resuelva a 2 elementos (strict mode).
    const app = appMain(page)
    await page.goto(`${BASE}/pedidos`)
    await expect(app.getByTestId('tab-hoy')).toBeVisible()
    await expect(app.getByTestId('pedido-hub')).toHaveCount(0)
  })
})
