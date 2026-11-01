// @tests #538 — hoja de detalle del pedido en el teléfono: el botón «+» no tapa ni intercepta la hoja,
// «Qué» y «Productos» ya no se repiten y la hoja dice lo mismo que la fila de la consulta.
// Va detrás del Hub (NEXT_PUBLIC_PEDIDOS_V2=true), igual que `pedidos-hub.spec.ts`:
//   NEXT_PUBLIC_PEDIDOS_V2=true PW_WORKERS=1 npx playwright test e2e/peek-movil.spec.ts
import { test, expect, apiPost, createCliente, BASE, sharedLoginAs, appMain } from './fixtures'

const HUB_ON = process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true'

test.describe('Hoja de detalle del pedido (#538)', () => {
  test.skip(!HUB_ON, 'requiere NEXT_PUBLIC_PEDIDOS_V2=true + webServer fresco')

  async function pedidoDe(page: Parameters<typeof createCliente>[0], etiqueta: string) {
    const nombre = `${etiqueta} ${Date.now()}`
    const { cliente } = await createCliente(page, { nombre })
    await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 3 }], offlineId: `peek538-${Date.now()}`,
    })
    return nombre
  }

  test('móvil: con la hoja abierta no hay «+», nada se solapa y el fondo/✕ la cierran', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await page.setViewportSize({ width: 390, height: 844 })
    const app = appMain(page)
    const nombre = await pedidoDe(page, 'Peek movil')
    await page.goto(`${BASE}/pedidos?all=true`)
    await expect(app.getByTestId('fab-container')).toBeVisible()
    await app.locator('[data-testid^="operacion-row-"]').filter({ hasText: nombre }).first().click()
    const hoja = page.getByTestId('peek-mobile')
    await expect(hoja).toBeVisible()

    // el «+» no existe mientras la hoja está abierta
    await expect(page.getByTestId('fab-container')).toHaveCount(0)
    // y lo que está en el centro del ✕ es el ✕ (nada lo intercepta)
    const caja = await page.getByTestId('peek-close').boundingBox()
    expect(caja).not.toBeNull()
    const esLaHoja = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y)
      return Boolean(el?.closest('[data-testid="peek-mobile"]'))
    }, [caja!.x + caja!.width / 2, caja!.y + caja!.height / 2])
    expect(esLaHoja).toBe(true)
    // tocable: ✕ de al menos 44 px
    expect(caja!.width).toBeGreaterThanOrEqual(44)
    expect(caja!.height).toBeGreaterThanOrEqual(44)

    // tocar el fondo atenuado cierra y el «+» vuelve
    await page.getByTestId('peek-backdrop').click({ position: { x: 10, y: 90 } }) // debajo del encabezado fijo de la app
    await expect(hoja).toHaveCount(0)
    await expect(app.getByTestId('fab-container')).toBeVisible()

    // con el ✕ también
    await app.locator('[data-testid^="operacion-row-"]').filter({ hasText: nombre }).first().click()
    await expect(hoja).toBeVisible()
    await page.getByTestId('peek-close').click()
    await expect(hoja).toHaveCount(0)
    await expect(app.getByTestId('fab-container')).toBeVisible()
  })

  test('sin repetir: una sola lista de productos y la misma frase que la fila de la consulta', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await page.setViewportSize({ width: 390, height: 844 })
    const app = appMain(page)
    const nombre = await pedidoDe(page, 'Peek repetido')
    await page.goto(`${BASE}/pedidos?all=true`)
    const fila = app.locator('[data-testid^="operacion-row-"]').filter({ hasText: nombre }).first()
    await expect(fila).toContainText('3 pedidas · por entregar')
    await fila.click()
    const hoja = page.getByTestId('peek-mobile')
    await expect(hoja).toBeVisible()
    await expect(hoja.getByTestId('peek-producto-linea')).toHaveCount(1)
    await expect(hoja.getByTestId('peek-producto-linea')).toHaveText('3 pedidas · por entregar')
    // los títulos sueltos del diseño anterior ya no están
    await expect(hoja.getByText('Qué', { exact: true })).toHaveCount(0)
    await expect(hoja.getByText('Productos', { exact: true })).toHaveCount(0)
    // mismo diseño que la consulta: canal, estado, pago, importes y «Ver pedido #N»
    await expect(hoja.getByTestId('peek-pills')).toContainText('Domicilio')
    await expect(hoja.getByTestId('peek-pills')).toContainText('Por entregar')
    await expect(hoja.getByTestId('peek-importes')).toContainText('Importe')
    await expect(hoja.getByTestId('peek-ver-detalle-completo')).toContainText('Ver pedido #')
    // la hoja no se sale de la pantalla
    const caja = await hoja.boundingBox()
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(844 + 1)
  })

  test('escritorio: el «+» sigue visible con el panel lateral abierto', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await page.setViewportSize({ width: 1280, height: 800 })
    const app = appMain(page)
    const nombre = await pedidoDe(page, 'Peek escritorio')
    await page.goto(`${BASE}/pedidos?all=true`)
    await app.locator('[data-testid^="operacion-row-"]').filter({ hasText: nombre }).first().click()
    await expect(page.getByTestId('peek-desktop')).toBeVisible()
    await expect(app.getByTestId('fab-container')).toBeVisible()
    await expect(page.getByTestId('peek-backdrop')).toHaveCount(0)
  })
})
