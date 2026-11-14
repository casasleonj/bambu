import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import type { Page } from '@playwright/test'
import { expect, createCliente, BASE, appMain } from './fixtures'

/** Recorrido real compartido por la suite general y la de venta en ruta del Hub. */
export async function comprobarPrecioDecimal(page: Page, flujo: 'pedido' | 'rapida' | 'ruta', errorInicial = false) {
  const db = new PrismaClient()
  try {
    const nombre = `Precio decimal ${flujo} ${randomUUID()}`
    await createCliente(page, { nombre, direccion: 'Calle de prueba 795', barrio: 'Centro' })
    const cliente = await db.cliente.findFirstOrThrow({ where: { nombre } })
    let repartidorId: string | undefined
    if (flujo === 'ruta') {
      await db.config.upsert({ where: { clave: 'GESTION_ADMIN_SIN_EMBARQUE' }, create: { clave: 'GESTION_ADMIN_SIN_EMBARQUE', valor: 'true' }, update: { valor: 'true' } })
      repartidorId = (await db.trabajador.create({data:{nombre:`Repartidor prueba ${randomUUID()}`,rol:'REPARTIDOR',usaMoto:true}})).id
    }
    await page.goto(`${BASE}/pedidos`)
    await appMain(page).getByTestId('fab-main').click()
    await page.getByTestId(flujo === 'pedido' ? 'fab-pedido-envio' : flujo === 'rapida' ? 'fab-venta-rapida' : 'fab-venta-en-ruta').click()
    const cantidad = page.locator('[data-testid$="-cant-PACA_AGUA"]')
    await expect(cantidad).toBeVisible()
    await cantidad.fill('63')
    const inputPrecio = page.getByRole('spinbutton', {name:/Precio unitario de Paca de Agua/})
    await inputPrecio.fill('2190.47619')
    await expect(inputPrecio).toHaveValue('2190.47619')
    expect(await inputPrecio.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(true)

    const workspace = await page.getByTestId('pedidos-workspace').count() > 0
    if (workspace && flujo !== 'pedido') await page.getByTestId('workspace-identificar').click()
    await page.getByTestId('cliente-search-input').fill(nombre)
    await page.getByTestId('cliente-search-result').filter({hasText:nombre}).first().click()
    if (repartidorId) await page.getByTestId('venta-ruta-repartidor').selectOption(repartidorId)
    if (flujo !== 'pedido') {
      if (workspace) await page.getByTestId('dinero-pagar-completo-EFECTIVO').click()
      else await page.getByRole('button', {name:'Pagar completo',exact:true}).click()
    }
    const commit = page.getByTestId(workspace ? 'workspace-commit' : 'submit-pedido')
    await expect(commit).toBeEnabled({timeout:15000})
    if (errorInicial) {
      let fallar = true
      await page.route('**/api/pedidos',route => {
        if (route.request().method() === 'POST' && fallar) {
          fallar = false
          return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({success:false,error:{code:'INTERNAL_ERROR',message:'Fallo de prueba del guardado'}})})
        }
        return route.continue()
      })
      const rechazado = page.waitForResponse(r => r.url().endsWith('/api/pedidos') && r.request().method() === 'POST' && r.status() === 500)
      await commit.click()
      await rechazado
      // #783 (previo): el aviso puede cubrir el botón; el hover pausa su cierre.
      // Acción real de usuario: apartar el puntero y esperar el cierre normal.
      await page.mouse.move(0,0)
      await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0,{timeout:15000})
      await expect(inputPrecio).toHaveValue('2190.47619')
      expect(await db.pedido.count({where:{clienteId:cliente.id}})).toBe(0)
      const cola = await page.evaluate(async () => {
        if (!window.__bambu) throw new Error('Ayudante offline de Playwright no disponible')
        return window.__bambu.getRequestQueue()
      })
      expect(cola).toHaveLength(0)
      await expect(commit).toBeEnabled()
    }
    const enviado = page.waitForResponse(r => r.url().endsWith('/api/pedidos') && r.request().method() === 'POST')
    await commit.click()
    const response = await enviado
    expect(response.status()).toBe(201)
    const pedido = await db.pedido.findFirstOrThrow({where:{clienteId:cliente.id},include:{items:true,factura:true,pagos:true}})
    expect(await db.pedido.count({where:{clienteId:cliente.id}})).toBe(1)
    expect(Number(pedido.total)).toBe(138000)
    expect(Number(pedido.items[0].precio)).toBe(2190.47619)
    expect(Number(pedido.items[0].subtotal)).toBe(138000)
    expect(pedido.items[0].cantPedido).toBe(63)
    expect(Number(pedido.factura?.total)).toBe(138000)
    if (flujo !== 'pedido') {
      expect(Number(pedido.totalPagado)).toBe(138000)
      expect(Number(pedido.saldo)).toBe(0)
      expect(pedido.pagos).toHaveLength(1)
      expect(pedido.items[0].cantEntrega).toBe(63)
    }
    if (repartidorId) expect(pedido.entregadoPorId).toBe(repartidorId)

    if (flujo === 'pedido') {
      await page.goto(`${BASE}/pedidos/${pedido.id}`)
      await page.getByTestId('detalle-acciones').getByRole('button',{name:/Editar/}).click()
      await expect(page.getByRole('spinbutton',{name:/Precio unitario de Paca de Agua/})).toHaveValue('2190.47619')
    }
    await page.goto(`${BASE}/facturas?openFactura=${pedido.factura?.id}`)
    await expect(page.getByText('$138.000,00',{exact:true}).first()).toBeVisible()
    if ((page.viewportSize()?.width ?? 0) >= 640) {
      await expect(page.getByRole('cell',{name:'$2.190,47619',exact:true})).toBeVisible()
    }
  } finally {
    await db.$disconnect()
  }
}

export async function comprobarPrecioOffline(page: Page) {
  const db = new PrismaClient()
  try {
    const nombre = `Precio offline ${randomUUID()}`
    await createCliente(page,{nombre})
    const cliente = await db.cliente.findFirstOrThrow({where:{nombre}})
    await page.goto(`${BASE}/pedidos`)
    await appMain(page).getByTestId('fab-main').click()
    await page.getByTestId('fab-pedido-envio').click()
    await page.getByTestId('cliente-search-input').fill(nombre)
    await page.getByTestId('cliente-search-result').filter({hasText:nombre}).first().click()
    await page.context().setOffline(true)
    await page.getByTestId('workspace-cant-PACA_AGUA').fill('63')
    await page.getByRole('spinbutton',{name:/Precio unitario de Paca de Agua/}).fill('2190.47619')
    await expect(page.getByTestId('workspace-offline-aviso')).toBeVisible()
    await expect(page.getByTestId('workspace-commit')).toContainText(/sin conexión/i)
    await expect(page.getByTestId('workspace-commit')).toBeEnabled()
    await page.getByTestId('workspace-commit').click()
    await expect(page.getByText(/se enviará al recuperar la red/i)).toBeVisible()
    const encolados = await page.evaluate(async () => {
      if (!window.__bambu) throw new Error('Ayudante offline de Playwright no disponible')
      return window.__bambu.getRequestQueue()
    })
    expect(encolados).toHaveLength(1)
    expect(await db.pedido.count({where:{clienteId:cliente.id}})).toBe(0)
    await page.context().setOffline(false)
    const sincronizar = () => page.evaluate(async () => {
      if (!window.__bambu) throw new Error('Ayudante offline de Playwright no disponible')
      return window.__bambu.syncWithServer()
    })
    await sincronizar()
    await expect.poll(()=>db.pedido.count({where:{clienteId:cliente.id}})).toBe(1)
    await sincronizar()
    expect(await db.pedido.count({where:{clienteId:cliente.id}})).toBe(1)
    const pedido = await db.pedido.findFirstOrThrow({where:{clienteId:cliente.id},include:{items:true,factura:true}})
    expect(Number(pedido.total)).toBe(138000)
    expect(Number(pedido.items[0].precio)).toBe(2190.47619)
    expect(Number(pedido.factura?.total)).toBe(138000)
  } finally {
    await page.context().setOffline(false)
    await db.$disconnect()
  }
}
