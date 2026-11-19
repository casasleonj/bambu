import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { test, expect, sharedLoginAs, resetTestDatabase, createCliente, BASE, appMain } from './fixtures'

const db = new PrismaClient()

test.describe('#795 · regalos separados del importe', () => {
  test.beforeAll(() => resetTestDatabase())
  test.afterAll(async () => { await db.$disconnect() })

  for (const flujo of ['pedido', 'rapida', 'ruta'] as const) {
    test(`${flujo}: 60 cobradas + 3 de regalo persisten como 63 físicas y $138.000`, async ({ browser }) => {
      const page = await sharedLoginAs(browser, 'admin')
      const nombre = `Regalos ${flujo} ${randomUUID()}`
      await createCliente(page, { nombre, direccion: 'Dirección sintética', barrio: 'Centro' })
      const cliente = await db.cliente.findFirstOrThrow({ where: { nombre } })
      let repartidorId: string | undefined
      if (flujo === 'ruta') {
        await db.config.upsert({ where: { clave: 'GESTION_ADMIN_SIN_EMBARQUE' }, create: { clave: 'GESTION_ADMIN_SIN_EMBARQUE', valor: 'true' }, update: { valor: 'true' } })
        repartidorId = (await db.trabajador.create({ data: { nombre: `Repartidor sintético ${randomUUID()}`, rol: 'REPARTIDOR', usaMoto: true } })).id
      }
      await page.goto(`${BASE}/pedidos`)
      await appMain(page).getByTestId('fab-main').click()
      await page.getByTestId(flujo === 'pedido' ? 'fab-pedido-envio' : flujo === 'rapida' ? 'fab-venta-rapida' : 'fab-venta-en-ruta').click()
      await page.locator('[data-testid$="-cant-PACA_AGUA"]').fill('60')
      await page.getByRole('spinbutton', { name: /Precio unitario de Paca de Agua/ }).fill('2300')
      const regalo = page.locator('[data-testid$="-regalo-PACA_AGUA"]')
      const details = page.locator('details').filter({ has: regalo })
      await details.locator('summary').click()
      await regalo.fill('3')
      await expect(page.locator('[data-testid$="-regalo-resumen-PACA_AGUA"]')).toContainText('60 con precio + 3 de regalo')
      // Contraer la ayuda no equivale a quitar lo autorizado.
      await details.locator('summary').click()
      await details.locator('summary').click()
      await expect(regalo).toHaveValue('3')
      const workspace = await page.getByTestId('pedidos-workspace').count() > 0
      if (workspace && flujo !== 'pedido') await page.getByTestId('workspace-identificar').click()
      await page.getByTestId('cliente-search-input').fill(nombre)
      await page.getByTestId('cliente-search-result').filter({ hasText: nombre }).first().click()
      if (repartidorId) await page.getByTestId('venta-ruta-repartidor').selectOption(repartidorId)
      if (flujo !== 'pedido') {
        if (workspace) await page.getByTestId('dinero-pagar-completo-EFECTIVO').click()
        else await page.getByRole('button', { name: 'Pagar completo', exact: true }).click()
      }
      const commit = page.getByTestId(workspace ? 'workspace-commit' : 'submit-pedido')
      await expect(commit).toBeEnabled()
      const creado = page.waitForResponse(r => r.url().endsWith('/api/pedidos') && r.request().method() === 'POST')
      await commit.click()
      expect((await creado).status()).toBe(201)
      const pedido = await db.pedido.findFirstOrThrow({ where: { clienteId: cliente.id }, include: { items: true, factura: true, pagos: true } })
      expect(pedido.items[0].cantPedido).toBe(60)
      expect(pedido.items[0].cantRegaloPedido).toBe(3)
      expect(pedido.items[0].regaloAutorizadoPorId).toBeTruthy()
      expect(Number(pedido.total)).toBe(138000)
      expect(Number(pedido.factura?.total)).toBe(138000)
      if (flujo !== 'pedido') {
        expect([pedido.items[0].cantEntrega, pedido.items[0].cantRegaloEntrega]).toEqual([60, 3])
        expect(Number(pedido.totalPagado)).toBe(138000)
        expect(pedido.pagos).toHaveLength(1)
      } else {
        await page.goto(`${BASE}/pedidos/${pedido.id}`)
        await page.reload()
        await page.getByTestId('detalle-acciones').getByRole('button', { name: /Editar/ }).click()
        const editGift = page.locator('[data-testid$="-regalo-PACA_AGUA"]')
        const editDetails = page.locator('details').filter({ has: editGift })
        if (!(await editDetails.evaluate(e => (e as HTMLDetailsElement).open))) await editDetails.locator('summary').click()
        await expect(editGift).toHaveValue('3')
        await expect(page.locator('[data-testid$="-cant-PACA_AGUA"]')).toHaveValue('60')
      }
      await page.goto(`${BASE}/facturas?openFactura=${pedido.factura?.id}`)
      await page.reload()
      await expect(page.getByText(/3 de regalo · 63 unidades físicas/).first()).toBeVisible()
      await expect(page.getByText('$138.000,00', { exact: true }).first()).toBeVisible()
    })
  }

  test('ASISTENTE no puede autorizar regalos en el editor', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'asistente')
    await page.goto(`${BASE}/pedidos`)
    await appMain(page).getByTestId('fab-main').click()
    await page.getByTestId('fab-pedido-envio').click()
    await page.locator('[data-testid$="-cant-PACA_AGUA"]').fill('60')
    await expect(page.getByText('+ Agregar unidades de regalo', { exact: true })).toHaveCount(0)
    await expect(page.locator('[data-testid$="-regalo-PACA_AGUA"]')).toHaveCount(0)
  })

  test('sin conexión conserva regalos y dos sincronizaciones crean un solo pedido', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const nombre = `Regalos offline ${randomUUID()}`
    await createCliente(page, { nombre, direccion: 'Dirección sintética', barrio: 'Centro' })
    const cliente = await db.cliente.findFirstOrThrow({ where: { nombre } })
    await page.goto(`${BASE}/pedidos`)
    await appMain(page).getByTestId('fab-main').click()
    await page.getByTestId('fab-pedido-envio').click()
    await page.getByTestId('cliente-search-input').fill(nombre)
    await page.getByTestId('cliente-search-result').filter({ hasText: nombre }).first().click()
    await page.locator('[data-testid$="-cant-PACA_AGUA"]').fill('60')
    await page.getByRole('spinbutton', { name: /Precio unitario de Paca de Agua/ }).fill('2300')
    const gift = page.locator('[data-testid$="-regalo-PACA_AGUA"]')
    await page.locator('details').filter({ has: gift }).locator('summary').click()
    await gift.fill('3')
    const workspace = await page.getByTestId('pedidos-workspace').count() > 0
    const commit = page.getByTestId(workspace ? 'workspace-commit' : 'submit-pedido')
    await expect(commit).toBeEnabled()
    try {
      await page.context().setOffline(true)
      await commit.click()
      await expect.poll(() => page.evaluate(async () => {
        if (!window.__bambu) throw new Error('Ayudante de cola no disponible')
        return (await window.__bambu.getRequestQueue()).length
      })).toBe(1)
      expect(await db.pedido.count({ where: { clienteId: cliente.id } })).toBe(0)
      const queued = await page.evaluate(async () => {
        if (!window.__bambu) throw new Error('Ayudante de cola no disponible')
        return window.__bambu.getRequestQueue()
      })
      const body = JSON.parse(queued[0].body) as { items: Array<{ producto: string; cantidadRegalo: number }> }
      expect(body.items.find(i => i.producto === 'PACA_AGUA')?.cantidadRegalo).toBe(3)
      await page.context().setOffline(false)
      const sync = () => page.evaluate(async () => {
        if (!window.__bambu) throw new Error('Ayudante de cola no disponible')
        await window.__bambu.syncWithServer()
      })
      await sync()
      await expect.poll(() => db.pedido.count({ where: { clienteId: cliente.id } })).toBe(1)
      await sync()
      expect(await db.pedido.count({ where: { clienteId: cliente.id } })).toBe(1)
      const p = await db.pedido.findFirstOrThrow({ where: { clienteId: cliente.id }, include: { items: true, factura: true } })
      expect([p.items[0].cantPedido, p.items[0].cantRegaloPedido, Number(p.total), Number(p.factura?.total)]).toEqual([60, 3, 138000, 138000])
    } finally { await page.context().setOffline(false) }
  })
})
