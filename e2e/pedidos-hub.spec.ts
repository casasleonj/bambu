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

import type { Page } from '@playwright/test'
import { test, expect, apiPost, apiGet, apiPut, apiPatch, createCliente, createTrabajador, createEmbarque, BASE, sharedLoginAs, appMain } from './fixtures'
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

  // Paridad Hub ↔ legacy (docs/pedidos/HUB_REVISION_INTEGRAL_v1.0.md §12): una fila
  // solo es ✅ si el flujo termina bien en la BASE DE DATOS, no solo en pantalla.
  test('B-19 (#346): crear un cliente nuevo desde el workspace persiste Cliente + Pedido', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    const sufijo = `${Date.now()}`.slice(-9)
    const nombre = `Nuevo Hub ${sufijo}`
    const telefono = `31${sufijo}`.slice(0, 10)
    await page.goto(`${BASE}/pedidos`)
    await app.getByTestId('fab-main').click()
    await page.getByTestId('fab-pedido-envio').click()
    await expect(page.getByTestId('pedidos-workspace')).toBeVisible()

    await page.getByTestId('cliente-search-input').fill(nombre)
    await page.getByText(/Crear cliente nuevo/i).click()
    await page.getByPlaceholder('Nombre *').fill(nombre)
    await page.getByPlaceholder('Teléfono *').fill(telefono)
    await page.getByPlaceholder('Dirección *').fill('Cra 9 # 4-5')
    await page.getByPlaceholder('Barrio *').fill('Centro')
    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })
    await page.getByTestId('workspace-commit').click()
    await expect(page.getByTestId('pedidos-workspace')).toHaveCount(0)

    // BD: el cliente nació con sus datos y el pedido quedó a su nombre, con clave de borrador.
    await expect(async () => {
      const cliente = await prisma.cliente.findFirst({ where: { nombre } })
      expect(cliente?.telefono).toContain(telefono) // el servidor lo normaliza (prefijo 57)
      const pedidos = await prisma.pedido.findMany({ where: { clienteId: cliente!.id } })
      expect(pedidos).toHaveLength(1)
      expect(pedidos[0].origen).toBe('PEDIDO')
      expect(pedidos[0].offlineId).toBeTruthy()
    }).toPass({ timeout: 15000 })
  })

  test('B-20 (#347): sin conexión se puede crear el pedido y al reconectar se crea UNA sola vez', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    const nombre = `Offline Hub ${Date.now()}`
    const { cliente } = await createCliente(page, { nombre })
    await page.goto(`${BASE}/pedidos`)
    await app.getByTestId('fab-main').click()
    await page.getByTestId('fab-pedido-envio').click()
    await expect(page.getByTestId('pedidos-workspace')).toBeVisible()
    await page.getByTestId('cliente-search-input').fill(nombre)
    await page.getByTestId('cliente-search-result').first().click()

    // se pierde la señal ANTES de componer: no habrá preview del servidor
    await page.context().setOffline(true)
    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await expect(page.getByTestId('workspace-offline-aviso')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('workspace-commit')).toBeEnabled()
    await expect(page.getByTestId('workspace-commit')).toContainText(/sin conexión/i)
    await page.getByTestId('workspace-commit').click()
    await expect(page.getByText(/se enviará al recuperar la red/i)).toBeVisible({ timeout: 5000 })

    // reconexión → el sync drena la cola (bajo Playwright el auto-sync está
    // apagado: se dispara con el helper de test); exactamente un pedido en BD
    const encolados = await page.evaluate(() => (window as unknown as { __bambu: { getRequestQueue: () => Promise<unknown[]> } }).__bambu.getRequestQueue())
    expect(encolados).toHaveLength(1)
    await page.context().setOffline(false)
    const sync = () => page.evaluate(() => (window as unknown as { __bambu: { syncWithServer: () => Promise<unknown> } }).__bambu.syncWithServer())
    await sync()
    await expect(async () => {
      expect(await prisma.pedido.count({ where: { clienteId: cliente.id } })).toBe(1)
    }).toPass({ timeout: 20000 })
    // un segundo drenaje (reintento) no duplica: misma clave de borrador
    await sync()
    expect(await prisma.pedido.count({ where: { clienteId: cliente.id } })).toBe(1)
    const pedido = await prisma.pedido.findFirst({ where: { clienteId: cliente.id } })
    expect(pedido?.offlineId).toBeTruthy()
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

  test('P1-1: "Abrir detalle completo" del peek abre el detalle sin recargar ni ir a un 404', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    const nombreCli = `Peek detalle ${Date.now()}`
    const { cliente } = await createCliente(page, { nombre: nombreCli })
    await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 3 }], offlineId: `hub-detalle-${Date.now()}`,
    })
    await page.goto(`${BASE}/pedidos?all=true`)
    await app.locator('[data-testid^="operacion-row-"]').filter({ hasText: nombreCli }).first().click()
    await expect(page.getByTestId('peek-ver-detalle-completo')).toBeVisible()
    const urlAntes = page.url()
    await page.getByTestId('peek-ver-detalle-completo').click()
    await expect(app.getByText('Total Pedido', { exact: true })).toBeVisible({ timeout: 10000 })
    expect(page.url()).toBe(urlAntes) // no navegó
  })

  test('P1-1: el menú de comandos abre el detalle del pedido seleccionado', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    const nombreCli = `Menu detalle ${Date.now()}`
    const { cliente } = await createCliente(page, { nombre: nombreCli })
    await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }], offlineId: `hub-menu-${Date.now()}`,
    })
    await page.goto(`${BASE}/pedidos?all=true`)
    await app.locator('[data-testid^="operacion-row-"]').filter({ hasText: nombreCli }).first().click()
    await expect(page.getByTestId('peek-ver-detalle-completo')).toBeVisible()
    await page.keyboard.press('Control+k')
    await expect(page.getByTestId('command-menu')).toBeVisible()
    await page.getByTestId('command-ver-detalle').click()
    await expect(app.getByText('Total Pedido', { exact: true })).toBeVisible({ timeout: 10000 })
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
    // #425: el pago cubre el total → el botón dice lo que va a pasar
    await expect(page.getByTestId('workspace-commit')).toHaveText(/^Cobrar \$/)

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

  // P1-2 (#389, B-10): la venta rápida nace en PUNTO; a DOMICILIO exige dirección.
  test('workspace (P1-2): venta rápida a domicilio — sin dirección no se cobra; con dirección queda guardada', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    await page.goto(`${BASE}/pedidos`)
    await app.getByTestId('fab-main').click()
    await page.getByTestId('fab-venta-rapida').click()
    await expect(page.getByTestId('workspace-venta-rapida')).toBeVisible()

    // nace en PUNTO: sin zona de entrega
    await expect(page.getByTestId('workspace-entrega')).toHaveCount(0)

    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await page.getByTestId('workspace-canal-DOMICILIO').click()
    await expect(page.getByTestId('workspace-entrega')).toBeVisible()
    await page.getByTestId('dinero-pagar-completo-EFECTIVO').click()
    // sin dirección el commit queda bloqueado y dice qué falta
    await expect(page.getByTestId('workspace-commit')).toBeDisabled({ timeout: 10000 })
    await expect(page.getByTestId('workspace-commit-hint')).toContainText('Falta la dirección de entrega')

    const direccion = `Calle ${Date.now() % 100} # 3-2`
    await page.getByTestId('workspace-entrega-direccion').fill(direccion)
    await page.getByTestId('workspace-entrega-barrio').fill('Centro')
    await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })

    const creado = page.waitForResponse((r) => r.url().endsWith('/api/pedidos') && r.request().method() === 'POST')
    await page.getByTestId('workspace-commit').click()
    const res = await creado
    expect(res.status()).toBeLessThan(300)
    const body = await res.json()
    const pedidoId = (body.data?.pedido ?? body.pedido).id as string

    const enBD = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })
    expect(enBD.origen).toBe('VENTA_RAPIDA')
    expect(enBD.canal).toBe('DOMICILIO')
    expect(enBD.estadoEntrega).toBe('ENTREGADO')
    expect(enBD.direccionEntrega).toBe(direccion)
    expect(enBD.barrioEntrega).toBe('Centro')
  })

  // P2-3 (#453): la fila de la lista dice a qué embarque y repartidor va el pedido.
  test('lista (P2-3): un pedido asignado a un embarque muestra «Embarque #N · Repartidor» y uno sin planificar no', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    const t = Date.now()
    const nombreRep = `Repartidor Lista ${t % 100000}`
    const trab = await createTrabajador(page, { nombre: nombreRep })
    const trabajadorId = (trab.trabajador?.id ?? trab.data?.id) as string
    const emb = await createEmbarque(page, trabajadorId)
    const embarqueId = (emb.embarque?.id ?? emb.data?.id) as string
    const embarqueBD = await prisma.embarque.findUniqueOrThrow({ where: { id: embarqueId } })

    const nombreAsignado = `Lista Asignado ${t}`
    const nombreLibre = `Lista Libre ${t}`
    const ids: string[] = []
    for (const nombre of [nombreAsignado, nombreLibre]) {
      const { cliente } = await createCliente(page, { nombre })
      const res = await apiPost(page, '/api/pedidos', {
        clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }], offlineId: `lista-emb-${t}-${ids.length}`,
      })
      expect(res.status()).toBeLessThan(300)
      const body = await res.json()
      ids.push((body.data?.pedido ?? body.pedido).id as string)
    }
    await prisma.pedido.update({ where: { id: ids[0] }, data: { embarqueId } })

    await page.goto(`${BASE}/pedidos`)
    await expect(app.getByTestId(`operacion-row-${ids[0]}`)).toBeVisible({ timeout: 15000 })
    await expect(app.getByTestId(`operacion-embarque-${ids[0]}`)).toHaveText(`Embarque #${embarqueBD.numeroDia} · ${nombreRep}`)
    await expect(app.getByTestId(`operacion-row-${ids[1]}`)).toBeVisible()
    await expect(app.getByTestId(`operacion-embarque-${ids[1]}`)).toHaveCount(0)

    // GET /api/pedidos (refrescos de la lista) trae los mismos campos que la carga inicial
    const api = await apiGet(page, '/api/pedidos?all=true')
    expect(api.status()).toBe(200)
    const cuerpo = await api.json()
    const filas = (cuerpo.data?.pedidos ?? cuerpo.pedidos ?? cuerpo.data) as Array<{ id: string; embarqueNumeroDia: number | null; embarqueRepartidor: string | null }>
    const asignado = filas.find((p) => p.id === ids[0])
    const libre = filas.find((p) => p.id === ids[1])
    expect(asignado?.embarqueNumeroDia).toBe(embarqueBD.numeroDia)
    expect(asignado?.embarqueRepartidor).toBe(nombreRep)
    expect(libre?.embarqueNumeroDia).toBeNull()
    expect(libre?.embarqueRepartidor).toBeNull()
  })

  // P1-4 (#419): el destino de UN pedido no pisa la dirección guardada del cliente, y con
  // una ubicación (link o GPS) la dirección y el barrio son opcionales. Se verifica en la BD.
  async function personaADomicilio(page: Page, nombre: string) {
    const app = appMain(page)
    await page.goto(`${BASE}/pedidos`)
    await app.getByTestId('fab-main').click()
    await page.getByTestId('fab-venta-rapida').click()
    await page.getByTestId('workspace-identificar').click()
    await page.getByTestId('cliente-search-input').fill(nombre)
    await page.getByTestId('cliente-search-result').first().click()
    await expect(page.getByTestId('comprador-nombre')).toContainText(nombre)
    await page.getByTestId('workspace-canal-DOMICILIO').click()
    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await expect(page.getByTestId('workspace-entrega')).toHaveAttribute('data-estado', 'SUFICIENTE', { timeout: 10000 })
  }

  async function crearYLeer(page: Page) {
    await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })
    const creado = page.waitForResponse((r) => r.url().endsWith('/api/pedidos') && r.request().method() === 'POST')
    await page.getByTestId('workspace-commit').click()
    const res = await creado
    expect(res.status()).toBeLessThan(300)
    const body = await res.json()
    const pedidoId = (body.data?.pedido ?? body.pedido).id as string
    return prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })
  }

  test('workspace (P1-4): otro destino solo para este pedido — el cliente conserva su dirección guardada', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const t = Date.now()
    const nombre = `Persona Destino ${t}`
    const { cliente } = await createCliente(page, { nombre, direccion: 'Calle 5 # 3-2', barrio: 'Centro' })
    await personaADomicilio(page, nombre)

    await page.getByTestId('workspace-entrega-cambiar').click()
    await expect(page.getByTestId('workspace-entrega-guardada')).toContainText('Calle 5 # 3-2 · Centro')
    await page.getByTestId('workspace-entrega-direccion').fill('Carrera 9 # 10-20')
    await page.getByTestId('workspace-entrega-barrio').fill('La Paz')
    await expect(page.getByTestId('workspace-entrega-guardar-en-cliente')).not.toBeChecked()

    const enBD = await crearYLeer(page)
    expect(enBD.clienteId).toBe(cliente.id)
    expect(enBD.direccionEntrega).toBe('Carrera 9 # 10-20')
    expect(enBD.barrioEntrega).toBe('La Paz')
    const clienteBD = await prisma.cliente.findUniqueOrThrow({ where: { id: cliente.id } })
    expect(clienteBD.direccion).toBe('Calle 5 # 3-2')
    expect(clienteBD.barrio).toBe('Centro')
  })

  test('workspace (P1-4): «Guardar también como dirección del cliente» sí actualiza la guardada', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const t = Date.now()
    const nombre = `Persona Mudanza ${t}`
    const { cliente } = await createCliente(page, { nombre, direccion: 'Calle 5 # 3-2', barrio: 'Centro' })
    await personaADomicilio(page, nombre)

    await page.getByTestId('workspace-entrega-cambiar').click()
    await page.getByTestId('workspace-entrega-direccion').fill('Carrera 9 # 10-20')
    await page.getByTestId('workspace-entrega-barrio').fill('La Paz')
    await page.getByTestId('workspace-entrega-guardar-en-cliente').check()

    const enBD = await crearYLeer(page)
    // la dirección guardada ya es la nueva: el pedido la usa sin necesidad de un destino propio
    expect(enBD.clienteId).toBe(cliente.id)
    const clienteBD = await prisma.cliente.findUniqueOrThrow({ where: { id: cliente.id } })
    expect(clienteBD.direccion).toBe('Carrera 9 # 10-20')
    expect(clienteBD.barrio).toBe('La Paz')
  })

  test('workspace (P1-4): un link corto de Maps (WhatsApp) fija la ubicación del pedido; sin dirección ni barrio; el cliente no cambia', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const t = Date.now()
    const nombre = `Persona Link ${t}`
    const { cliente } = await createCliente(page, { nombre, direccion: 'Calle 5 # 3-2', barrio: 'Centro' })
    // Google no es alcanzable desde CI: el servicio de expansión se simula con coordenadas conocidas.
    await page.route('**/api/geo/expand-maps', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, url: 'https://maps.app.goo.gl/AbC123', coords: { lat: 4.652, lng: -74.054 } }) }),
    )
    await personaADomicilio(page, nombre)

    await page.getByTestId('workspace-entrega-cambiar').click()
    // #459: la ubicación sale del link que manda el cliente; no hay botón de GPS del dispositivo
    await expect(page.getByTestId('workspace-entrega-usar-ubicacion')).toHaveCount(0)
    await page.getByTestId('workspace-entrega-direccion').fill('')
    await page.getByTestId('workspace-entrega-barrio').fill('')
    await page.getByTestId('workspace-entrega-link').fill('https://maps.app.goo.gl/AbC123')
    await expect(page.getByTestId('workspace-entrega-ubicacion-fijada')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('workspace-entrega-direccion')).toHaveAttribute('placeholder', /opcional/)

    const enBD = await crearYLeer(page)
    expect(Number(enBD.entregaLat)).toBeCloseTo(4.652, 3)
    expect(Number(enBD.entregaLng)).toBeCloseTo(-74.054, 3)
    expect(enBD.direccionEntrega).toBeNull()
    const clienteBD = await prisma.cliente.findUniqueOrThrow({ where: { id: cliente.id } })
    expect(clienteBD.direccion).toBe('Calle 5 # 3-2')
    expect(clienteBD.barrio).toBe('Centro')
  })

  test('workspace (#459): con ubicación guardada se avisa y cambiarla con otro link es solo del pedido', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const t = Date.now()
    const nombre = `Persona Guardada ${t}`
    const { cliente } = await createCliente(page, { nombre, direccion: 'Calle 6 # 4-3', barrio: 'Centro' })
    await prisma.cliente.update({ where: { id: cliente.id }, data: { lat: 4.6, lng: -74.1 } })
    await personaADomicilio(page, nombre)

    await page.getByTestId('workspace-entrega-cambiar').click()
    await expect(page.getByTestId('workspace-entrega-ubicacion-guardada')).toBeVisible()
    await page.getByTestId('workspace-entrega-link').fill('https://www.google.com/maps?q=4.6520,-74.0540')
    await expect(page.getByTestId('workspace-entrega-ubicacion-fijada')).toBeVisible()
    await expect(page.getByTestId('workspace-entrega-ubicacion-guardada')).toHaveCount(0)

    const enBD = await crearYLeer(page)
    expect(Number(enBD.entregaLat)).toBeCloseTo(4.652, 3)
    expect(Number(enBD.entregaLng)).toBeCloseTo(-74.054, 3)
    const clienteBD = await prisma.cliente.findUniqueOrThrow({ where: { id: cliente.id } })
    expect(Number(clienteBD.lat)).toBeCloseTo(4.6, 3)
    expect(Number(clienteBD.lng)).toBeCloseTo(-74.1, 3)
  })

  test('workspace (P1-4): venta rápida a domicilio con solo un link de Maps (sin dirección ni barrio) se cobra', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    await page.goto(`${BASE}/pedidos`)
    await app.getByTestId('fab-main').click()
    await page.getByTestId('fab-venta-rapida').click()
    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await page.getByTestId('workspace-canal-DOMICILIO').click()
    await page.getByTestId('dinero-pagar-completo-EFECTIVO').click()
    await expect(page.getByTestId('workspace-commit')).toBeDisabled({ timeout: 10000 })

    await page.getByTestId('workspace-entrega-link').fill('https://www.google.com/maps?q=4.6520,-74.0540')
    await expect(page.getByTestId('workspace-entrega-ubicacion-fijada')).toBeVisible()
    const enBD = await crearYLeer(page)
    expect(enBD.origen).toBe('VENTA_RAPIDA')
    expect(enBD.canal).toBe('DOMICILIO')
    expect(Number(enBD.entregaLat)).toBeCloseTo(4.652, 3)
    expect(enBD.direccionEntrega).toBeNull()
  })

  // P2-2 (#463): «Entregar después» solo existe con NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR
  // (el job «E2E Hub» lo enciende en el build y en el servidor).
  test.describe('«Entregar después» (P2-2)', () => {
    test.skip(process.env.NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR !== 'true', 'requiere NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR=true')

    test('con comprador y pagada completa: queda pendiente y anticipada, con su pago', async ({ browser }) => {
      const page = await sharedLoginAs(browser, 'admin')
      const app = appMain(page)
      const nombre = `Persona Despues ${Date.now()}`
      const { cliente } = await createCliente(page, { nombre })
      await page.goto(`${BASE}/pedidos`)
      await app.getByTestId('fab-main').click()
      await page.getByTestId('fab-venta-rapida').click()
      await page.getByTestId('workspace-identificar').click()
      await page.getByTestId('cliente-search-input').fill(nombre)
      await page.getByTestId('cliente-search-result').first().click()
      await expect(page.getByTestId('comprador-nombre')).toContainText(nombre)
      await page.getByTestId('workspace-inc-PACA_AGUA').click()
      await page.getByTestId('dinero-pagar-completo-EFECTIVO').click()
      await page.getByTestId('workspace-entrega-despues').click()
      await expect(page.getByTestId('workspace-entrega-despues-aviso')).toContainText('pendiente')
      await expect(page.getByTestId('workspace-commit')).toContainText('Registrar venta pagada', { timeout: 10000 })

      const enBD = await crearYLeer(page)
      const conPagos = await prisma.pedido.findUniqueOrThrow({ where: { id: enBD.id }, include: { pagos: true } })
      expect(conPagos.clienteId).toBe(cliente.id)
      expect(conPagos.origen).toBe('PEDIDO')
      expect(conPagos.estadoEntrega).toBe('PENDIENTE')
      expect(conPagos.estadoPago).toBe('ANTICIPADO')
      expect(Number(conPagos.saldo)).toBe(0)
      expect(conPagos.pagos.length).toBeGreaterThan(0)
    })

    test('sin comprador no se puede dejar para después; «ahora» vuelve a permitirlo', async ({ browser }) => {
      const page = await sharedLoginAs(browser, 'admin')
      const app = appMain(page)
      await page.goto(`${BASE}/pedidos`)
      await app.getByTestId('fab-main').click()
      await page.getByTestId('fab-venta-rapida').click()
      await page.getByTestId('workspace-inc-PACA_AGUA').click()
      await page.getByTestId('dinero-pagar-completo-EFECTIVO').click()
      await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })
      await page.getByTestId('workspace-entrega-despues').click()
      await expect(page.getByTestId('workspace-entrega-despues-sin-comprador')).toBeVisible()
      await expect(page.getByTestId('workspace-commit')).toBeDisabled()
      await page.getByTestId('workspace-entrega-ahora').click()
      await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })
    })
  })

  // P2-5 (#477): el precio de cada línea lo resuelve el servidor (especial del negocio >
  // especial del cliente > tramo de volumen > base). Se verifica en la BD, no en pantalla.
  test.describe('precios automáticos desde el Hub (P2-5)', () => {
    const especiales = (precio: number) => JSON.stringify({ PUNTO: { PACA_AGUA: precio }, DOMICILIO: { PACA_AGUA: precio } })

    async function ventaRapidaConComprador(page: Page, nombre: string) {
      const app = appMain(page)
      await page.goto(`${BASE}/pedidos`)
      await app.getByTestId('fab-main').click()
      await page.getByTestId('fab-venta-rapida').click()
      await page.getByTestId('workspace-identificar').click()
      await page.getByTestId('cliente-search-input').fill(nombre)
      await page.getByTestId('cliente-search-result').first().click()
      await expect(page.getByTestId('comprador-nombre')).toContainText(nombre)
    }

    async function crearYLeerItems(page: Page) {
      await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })
      const creado = page.waitForResponse((r) => r.url().endsWith('/api/pedidos') && r.request().method() === 'POST')
      await page.getByTestId('workspace-commit').click()
      const res = await creado
      expect(res.status()).toBeLessThan(300)
      const body = await res.json()
      const pedidoId = (body.data?.pedido ?? body.pedido).id as string
      const pedido = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { items: true } })
      return { pedido, item: pedido.items.find((i) => i.producto === 'PACA_AGUA')! }
    }

    /** Tramo de la tabla vigente para una cantidad (misma regla que `pricing.ts`). */
    async function tramoDe(cantidad: number) {
      const tramos = await prisma.precioVolumen.findMany({ where: { activo: true, producto: { codigo: 'PACA_AGUA' } } })
      return tramos
        .filter((t) => t.cantMin <= cantidad && (t.cantMax === null || t.cantMax >= cantidad))
        .sort((a, b) => b.cantMin - a.cantMin)[0]
    }

    test('el precio especial del cliente se aplica solo y queda en la BD', async ({ browser }) => {
      const page = await sharedLoginAs(browser, 'admin')
      const t = Date.now()
      const nombre = `Persona Especial ${t}`
      const { cliente } = await createCliente(page, { nombre })
      await prisma.cliente.update({ where: { id: cliente.id }, data: { preciosEspeciales: especiales(1900) } })

      await ventaRapidaConComprador(page, nombre)
      await page.getByTestId('workspace-inc-PACA_AGUA').click()
      await page.getByTestId('workspace-inc-PACA_AGUA').click()
      await expect(page.getByTestId('workspace-cant-PACA_AGUA')).toHaveValue('2')

      const { pedido, item } = await crearYLeerItems(page)
      expect(pedido.clienteId).toBe(cliente.id)
      expect(Number(item.precio)).toBe(1900)
      expect(item.precioOrigen).toBe('cliente')
      expect(Number(item.subtotal)).toBe(3800)
      expect(Number(pedido.total)).toBe(3800)
    })

    test('si la tienda tiene su propio precio especial, gana el de la tienda; el cliente queda como respaldo', async ({ browser }) => {
      const page = await sharedLoginAs(browser, 'admin')
      const t = Date.now()
      const { cliente } = await createCliente(page, { nombre: `Dueño Precios ${t}` })
      const nombreTienda = `Tienda Precios${t}`
      const rn = await apiPost(page, '/api/negocios', { clienteId: cliente.id, nombre: nombreTienda, tipoNegocio: 'Tienda', direccion: 'Cra 7 # 10-20', barrio: 'Centro' })
      expect(rn.status()).toBeLessThan(300)
      const negocio = await prisma.negocio.findFirstOrThrow({ where: { clienteId: cliente.id, nombre: nombreTienda } })
      await prisma.cliente.update({ where: { id: cliente.id }, data: { preciosEspeciales: especiales(1900) } })
      await prisma.negocio.update({ where: { id: negocio.id }, data: { preciosEspeciales: especiales(1700) } })

      // comprando como la tienda: 1700 (el de la tienda)
      await ventaRapidaConComprador(page, nombreTienda)
      await page.getByTestId('workspace-inc-PACA_AGUA').click()
      const deTienda = await crearYLeerItems(page)
      expect(deTienda.pedido.negocioId).toBe(negocio.id)
      expect(Number(deTienda.item.precio)).toBe(1700)
      expect(deTienda.item.precioOrigen).toBe('cliente')

      // comprando como la persona (sin tienda): 1900 (el del cliente)
      await ventaRapidaConComprador(page, `Dueño Precios ${t}`)
      await page.getByTestId('workspace-inc-PACA_AGUA').click()
      const dePersona = await crearYLeerItems(page)
      expect(dePersona.pedido.negocioId).toBeNull()
      expect(Number(dePersona.item.precio)).toBe(1900)
      expect(dePersona.item.precioOrigen).toBe('cliente')
    })

    test('sin precio especial, la cantidad fija el tramo de volumen sin intervención del usuario', async ({ browser }) => {
      const page = await sharedLoginAs(browser, 'admin')
      const t = Date.now()
      const nombre = `Persona Volumen ${t}`
      await createCliente(page, { nombre })

      const tramoUno = await tramoDe(1)
      const tramoCinco = await tramoDe(5)
      // la tabla de prueba (seed-test) tiene tramos distintos para 1 y 5 und
      expect(tramoUno && tramoCinco && tramoUno.id !== tramoCinco.id).toBeTruthy()

      // 1 und → tramo de 1 und
      await ventaRapidaConComprador(page, nombre)
      await page.getByTestId('workspace-inc-PACA_AGUA').click()
      const una = await crearYLeerItems(page)
      expect(Number(una.item.precio)).toBe(Number(tramoUno.precio))
      expect(una.item.precioOrigen).toBe('volumen')

      // 5 und → tramo de 5 und, más barato por unidad
      await ventaRapidaConComprador(page, nombre)
      await page.getByTestId('workspace-cant-PACA_AGUA').fill('5')
      await expect(page.getByTestId('workspace-cant-PACA_AGUA')).toHaveValue('5')
      const cinco = await crearYLeerItems(page)
      expect(Number(cinco.item.precio)).toBe(Number(tramoCinco.precio))
      expect(cinco.item.precioOrigen).toBe('volumen')
      expect(Number(cinco.item.precio)).toBeLessThan(Number(tramoUno.precio))
      expect(Number(cinco.item.subtotal)).toBe(Number(tramoCinco.precio) * 5)
      expect(Number(cinco.pedido.total)).toBe(Number(tramoCinco.precio) * 5)
    })
  })

  // P1-3 (#394, B-05): el comprador se identifica DENTRO de la venta rápida, sea una
  // tienda o una persona, y se verifica en la base de datos.
  test('workspace (P1-3): venta rápida con comprador identificado — tienda elegida de un toque, pedido de la tienda pagado', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    const t = Date.now()
    const { cliente } = await createCliente(page, { nombre: `Dueño ${t}` })
    const nombreTienda = `Tienda Aurora${t}`
    const rn = await apiPost(page, '/api/negocios', { clienteId: cliente.id, nombre: nombreTienda, tipoNegocio: 'Tienda', direccion: 'Cra 7 # 10-20', barrio: 'Centro' })
    expect(rn.status()).toBeLessThan(300)
    const negocioId = (await prisma.negocio.findFirstOrThrow({ where: { clienteId: cliente.id, nombre: nombreTienda } })).id
    await apiPost(page, '/api/negocios', { clienteId: cliente.id, nombre: `Sucursal Faro ${t}`, tipoNegocio: 'Tienda', direccion: 'Cll 80', barrio: 'Norte' })

    await page.goto(`${BASE}/pedidos`)
    await app.getByTestId('fab-main').click()
    await page.getByTestId('fab-venta-rapida').click()
    await expect(page.getByTestId('workspace-venta-rapida')).toContainText('Sin identificar')
    await page.getByTestId('workspace-identificar').click()

    // se busca la tienda: sale la tienda (no el dueño) y un toque la elige
    await page.getByTestId('cliente-search-input').fill(`Aurora${t}`)
    const fila = page.getByTestId('cliente-search-result')
    await expect(fila).toHaveCount(1)
    await expect(fila).toHaveAttribute('data-tipo', 'negocio')
    await fila.click()
    await expect(page.getByTestId('comprador-nombre')).toContainText(nombreTienda)
    await expect(page.getByTestId('comprador-detalle')).toContainText(`Dueño ${t}`)
    await expect(page.getByText(/domicilio principal/i)).toHaveCount(0)

    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await page.getByTestId('dinero-pagar-completo-EFECTIVO').click()
    await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })
    const creado = page.waitForResponse((r) => r.url().endsWith('/api/pedidos') && r.request().method() === 'POST')
    await page.getByTestId('workspace-commit').click()
    const res = await creado
    expect(res.status()).toBeLessThan(300)
    const body = await res.json()
    const pedidoId = (body.data?.pedido ?? body.pedido).id as string

    const enBD = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { pagos: true } })
    expect(enBD.clienteId).toBe(cliente.id)
    expect(enBD.negocioId).toBe(negocioId)
    expect(enBD.origen).toBe('PEDIDO')
    expect(enBD.canal).toBe('PUNTO')
    expect(enBD.estadoEntrega).toBe('ENTREGADO')
    expect(enBD.estadoPago).toBe('PAGADO')
    expect(Number(enBD.saldo)).toBe(0)
    expect(enBD.pagos).toHaveLength(1)
  })

  test('workspace (P1-3): al buscar a la persona salen ella y sus tiendas; fiar a un cliente identificado deja el saldo a su nombre', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    const t = Date.now()
    const nombre = `Persona Fiada ${t}`
    const { cliente } = await createCliente(page, { nombre })
    await apiPost(page, '/api/negocios', { clienteId: cliente.id, nombre: `Kiosco Sol ${t}`, tipoNegocio: 'Kiosco', direccion: 'Cra 1', barrio: 'Centro' })

    await page.goto(`${BASE}/pedidos`)
    await app.getByTestId('fab-main').click()
    await page.getByTestId('fab-venta-rapida').click()
    await page.getByTestId('workspace-identificar').click()
    await page.getByTestId('cliente-search-input').fill(nombre)
    const filas = page.getByTestId('cliente-search-result')
    await expect(filas).toHaveCount(2)
    await expect(filas.nth(0)).toHaveAttribute('data-tipo', 'persona')
    await expect(filas.nth(1)).toHaveAttribute('data-tipo', 'negocio')
    // nada queda elegido hasta tocar una fila
    await expect(page.getByTestId('comprador-elegido')).toHaveCount(0)
    await filas.nth(0).click()
    await expect(page.getByTestId('comprador-nombre')).toContainText(nombre)

    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    // con comprador identificado el saldo no bloquea: queda fiado a su nombre
    await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })
    // #425: sin pago queda saldo → el botón sigue diciendo «Crear pedido», no «Cobrar»
    await expect(page.getByTestId('workspace-commit')).toHaveText(/^Crear pedido \$/)
    await expect(page.getByTestId('dinero-deudor-requerido')).toHaveCount(0)
    const creado = page.waitForResponse((r) => r.url().endsWith('/api/pedidos') && r.request().method() === 'POST')
    await page.getByTestId('workspace-commit').click()
    const res = await creado
    expect(res.status()).toBeLessThan(300)
    const body = await res.json()
    const pedidoId = (body.data?.pedido ?? body.pedido).id as string

    const enBD = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })
    expect(enBD.clienteId).toBe(cliente.id)
    expect(enBD.negocioId).toBeNull()
    expect(enBD.origen).toBe('PEDIDO')
    expect(enBD.estadoEntrega).toBe('ENTREGADO')
    expect(Number(enBD.saldo)).toBe(Number(enBD.total))
    expect(enBD.estadoPago).not.toBe('PAGADO')
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

  test('workspace (P0-3): cliente sobre el límite pide excepción, se autoriza y el pedido la consume', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    const nombre = `Credito Hub ${Date.now()}`
    const { cliente } = await createCliente(page, { nombre })
    await apiPut(page, `/api/clientes/${cliente.id}`, { limitePedidosFiados: 1 })
    // un fiado abierto: el cliente queda al límite
    const fiado = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', entregado: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }], pagos: [],
    })
    expect(fiado.status()).toBe(201)
    const fiadoBody = await fiado.json()
    const fiadoId = (fiadoBody.data?.pedido ?? fiadoBody.pedido).id as string
    // solo cuentan para el límite los pedidos ENTREGADOS con saldo
    await prisma.pedido.update({ where: { id: fiadoId }, data: { estadoEntrega: 'ENTREGADO' } })
    // el admin de prueba puede autorizar (permiso por usuario)
    await prisma.user.updateMany({ where: { username: 'admin' }, data: { puedeAutorizarExcepcionCredito: true } })

    await page.goto(`${BASE}/pedidos`)
    await app.getByTestId('fab-main').click()
    await page.getByTestId('fab-pedido-envio').click()
    await page.getByTestId('cliente-search-input').fill(nombre)
    await page.getByTestId('cliente-search-result').first().click()
    await page.getByTestId('workspace-inc-PACA_AGUA').click()

    await expect(page.getByTestId('credito-panel')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('credito-tabla')).toBeVisible()
    await expect(page.getByTestId('workspace-commit')).toBeDisabled()

    await page.getByTestId('credito-pedir-excepcion').click()
    await page.getByTestId('credito-motivo').fill('Cliente de confianza, paga el viernes')
    await page.getByTestId('credito-enviar').click()
    await expect(page.getByTestId('credito-estado-pendiente')).toBeVisible({ timeout: 10000 })

    const sol = await prisma.pedidoExcepcionCredito.findFirstOrThrow({ where: { clienteId: cliente.id } })
    expect(sol.estado).toBe('PENDIENTE')
    const res = await apiPatch(page, `/api/pedidos/excepciones-credito/${sol.id}`, { resolucion: 'AUTORIZAR' })
    expect(res.status()).toBeLessThan(300)

    // la pantalla detecta la autorización sola (polling de 10 s)
    await expect(page.getByTestId('credito-estado-autorizada')).toBeVisible({ timeout: 25000 })
    await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })

    const creado = page.waitForResponse((r) => r.url().endsWith('/api/pedidos') && r.request().method() === 'POST')
    await page.getByTestId('workspace-commit').click()
    const body = await (await creado).json()
    const pedidoId = (body.data?.pedido ?? body.pedido).id as string

    const enBD = await prisma.pedidoExcepcionCredito.findUniqueOrThrow({ where: { id: sol.id } })
    expect(enBD.pedidoId).toBe(pedidoId)
    expect(await prisma.pedido.count({ where: { clienteId: cliente.id } })).toBe(2)
  })

  // P0-3 PR 2: quien autoriza. La solicitud se siembra directo en BD (el flujo del
  // solicitante ya lo cubre el test anterior) y se verifica la decisión en BD.
  async function sembrarSolicitud(nombre: string) {
    const admin = await prisma.user.findFirstOrThrow({ where: { username: 'admin' } })
    await prisma.user.update({ where: { id: admin.id }, data: { puedeAutorizarExcepcionCredito: true } })
    const cliente = await prisma.cliente.create({ data: { nombre, telefono: `57${Date.now()}`.slice(0, 12) } })
    const sol = await prisma.pedidoExcepcionCredito.create({
      data: {
        clienteId: cliente.id, motivoSolicitud: 'Cliente de confianza, paga el viernes', solicitadoPorId: admin.id,
        limiteSnapshot: 1, fiadosAbiertosSnapshot: 1, saldoFiadoSnapshot: 18000,
        operacionSaldoSnapshot: 12000, fiadosDespuesSnapshot: 2, saldoDespuesSnapshot: 30000,
      },
    })
    return { sol, admin }
  }

  test('workspace (P0-3 PR2): quien autoriza ve el aviso, abre la ventana y autoriza', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    const nombre = `Autoriza Hub ${Date.now()}`
    const { sol, admin } = await sembrarSolicitud(nombre)

    await page.goto(`${BASE}/pedidos`)
    await expect(app.getByTestId('excepciones-pendientes')).toBeVisible({ timeout: 15000 })
    await app.getByTestId(`excepcion-fila-${sol.id}`).click()
    await expect(app.getByTestId('excepcion-modal')).toBeVisible()
    await expect(app.getByTestId('excepcion-datos')).toContainText('18.000')
    await expect(app.getByTestId('excepcion-motivo')).toContainText('paga el viernes')
    await app.getByTestId('excepcion-nota').fill('solo hoy')
    await app.getByTestId('excepcion-autorizar').click()
    await expect(app.getByTestId('excepcion-estado')).toHaveText('Autorizada', { timeout: 10000 })

    const enBD = await prisma.pedidoExcepcionCredito.findUniqueOrThrow({ where: { id: sol.id } })
    expect(enBD.estado).toBe('AUTORIZADA')
    expect(enBD.autorizadoPorId).toBe(admin.id)
    expect(enBD.notaAutorizacion).toBe('solo hoy')
    // el aviso ya no la lista
    await app.getByTestId('excepcion-cerrar').click()
    await expect(app.getByTestId(`excepcion-fila-${sol.id}`)).toHaveCount(0, { timeout: 10000 })
  })

  test('workspace (P0-3 PR2): el enlace de la notificación abre la ventana y permite rechazar', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    const { sol } = await sembrarSolicitud(`Rechaza Hub ${Date.now()}`)
    await page.goto(`${BASE}/pedidos?openExcepcionCredito=${sol.id}`)
    await expect(app.getByTestId('excepcion-modal')).toBeVisible({ timeout: 15000 })
    await app.getByTestId('excepcion-rechazar').click()
    await expect(app.getByTestId('excepcion-estado')).toHaveText('Rechazada', { timeout: 10000 })
    const enBD = await prisma.pedidoExcepcionCredito.findUniqueOrThrow({ where: { id: sol.id } })
    expect(enBD.estado).toBe('RECHAZADA')
    expect(enBD.rechazadoPorId).toBeTruthy()
  })

  test('workspace (P0-3 PR2): quien no tiene el permiso no ve el aviso ni los botones', async ({ browser }) => {
    const { sol } = await sembrarSolicitud(`SinPermiso Hub ${Date.now()}`)
    const asistente = await prisma.user.findFirstOrThrow({ where: { username: 'asistente' } })
    await prisma.user.update({ where: { id: asistente.id }, data: { puedeAutorizarExcepcionCredito: false } })
    const page = await sharedLoginAs(browser, 'asistente')
    const app = appMain(page)
    await page.goto(`${BASE}/pedidos`)
    await expect(app.getByTestId('fab-main')).toBeVisible({ timeout: 15000 })
    await expect(app.getByTestId('excepciones-pendientes')).toHaveCount(0)
    await page.goto(`${BASE}/pedidos?openExcepcionCredito=${sol.id}`)
    await expect(app.getByTestId('excepcion-sin-permiso')).toBeVisible({ timeout: 15000 })
    await expect(app.getByTestId('excepcion-autorizar')).toHaveCount(0)
    const res = await apiPatch(page, `/api/pedidos/excepciones-credito/${sol.id}`, { resolucion: 'AUTORIZAR' })
    expect(res.status()).toBe(403)
    expect((await prisma.pedidoExcepcionCredito.findUniqueOrThrow({ where: { id: sol.id } })).estado).toBe('PENDIENTE')
  })

  // P0-3 PR 3: el permiso de autorizar se da desde Administración > Usuarios (solo ADMIN).
  test.describe('permiso de autorizar excepciones de crédito (admin de usuarios)', () => {
    test.beforeEach(async () => {
      await prisma.user.updateMany({ data: { puedeAutorizarExcepcionCredito: false } })
    })

    test('un ADMIN da el permiso a un asistente desde la pantalla y queda en BD', async ({ browser }) => {
      const page = await sharedLoginAs(browser, 'admin')
      const app = appMain(page)
      await page.goto(`${BASE}/admin/usuarios`)
      const card = app.locator('div.rounded-2xl', { hasText: '@asistente' }).first()
      await card.getByRole('button', { name: 'Editar' }).click()
      await page.getByTestId('check-autoriza-credito').check()
      await page.getByRole('button', { name: 'Guardar', exact: true }).click()
      await expect(async () => {
        const u = await prisma.user.findFirstOrThrow({ where: { username: 'asistente' } })
        expect(u.puedeAutorizarExcepcionCredito).toBe(true)
      }).toPass({ timeout: 10000 })
      await expect(app.locator('div.rounded-2xl', { hasText: '@asistente' }).getByTestId('badge-autoriza-credito')).toBeVisible({ timeout: 10000 })
    })

    test('no se puede quitar el permiso a la última persona autorizadora (409) ni dárselo a un rol sin derecho', async ({ browser }) => {
      const page = await sharedLoginAs(browser, 'admin')
      const asistente = await prisma.user.findFirstOrThrow({ where: { username: 'asistente' } })
      await prisma.user.update({ where: { id: asistente.id }, data: { puedeAutorizarExcepcionCredito: true } })

      const quitar = await apiPut(page, `/api/users/${asistente.id}`, { puedeAutorizarExcepcionCredito: false })
      expect(quitar.status()).toBe(409)
      const desactivar = await apiPut(page, `/api/users/${asistente.id}`, { activo: false })
      expect(desactivar.status()).toBe(409)
      const rol = await apiPut(page, `/api/users/${asistente.id}`, { rol: 'CONTADOR' })
      expect(rol.status()).toBe(409)
      const intacto = await prisma.user.findUniqueOrThrow({ where: { id: asistente.id } })
      expect(intacto.puedeAutorizarExcepcionCredito).toBe(true)
      expect(intacto.activo).toBe(true)
      expect(intacto.rol).toBe('ASISTENTE')

      const repartidor = await prisma.user.findFirstOrThrow({ where: { username: 'repartidor' } })
      const aRol = await apiPut(page, `/api/users/${repartidor.id}`, { puedeAutorizarExcepcionCredito: true })
      expect(aRol.status()).toBe(409)
      expect((await prisma.user.findUniqueOrThrow({ where: { id: repartidor.id } })).puedeAutorizarExcepcionCredito).toBe(false)

      // con otra persona autorizadora ya sí se puede quitar
      const admin = await prisma.user.findFirstOrThrow({ where: { username: 'admin' } })
      const darAdmin = await apiPut(page, `/api/users/${admin.id}`, { puedeAutorizarExcepcionCredito: true })
      expect(darAdmin.status()).toBe(200)
      const ahoraSi = await apiPut(page, `/api/users/${asistente.id}`, { puedeAutorizarExcepcionCredito: false })
      expect(ahoraSi.status()).toBe(200)
      expect((await prisma.user.findUniqueOrThrow({ where: { id: asistente.id } })).puedeAutorizarExcepcionCredito).toBe(false)
    })

    test('un ASISTENTE no puede cambiar permisos (403) aunque tenga el de autorizar', async ({ browser }) => {
      const asistente = await prisma.user.findFirstOrThrow({ where: { username: 'asistente' } })
      await prisma.user.update({ where: { id: asistente.id }, data: { puedeAutorizarExcepcionCredito: true } })
      const repartidor = await prisma.user.findFirstOrThrow({ where: { username: 'admin' } })
      const page = await sharedLoginAs(browser, 'asistente')
      const res = await apiPut(page, `/api/users/${repartidor.id}`, { puedeAutorizarExcepcionCredito: true })
      expect(res.status()).toBe(403)
      const propio = await apiPut(page, `/api/users/${asistente.id}`, { puedeAutorizarExcepcionCredito: false })
      expect(propio.status()).toBe(403)
      expect((await prisma.user.findUniqueOrThrow({ where: { id: repartidor.id } })).puedeAutorizarExcepcionCredito).toBe(false)
      expect((await prisma.user.findUniqueOrThrow({ where: { id: asistente.id } })).puedeAutorizarExcepcionCredito).toBe(true)
    })
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
