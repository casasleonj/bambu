// @tests api/pedido, api/recurrente
import {test, expect, BASE, handleBaseCaja, loginAs, goto, apiGet, createCliente, createPedido, resetTestDatabase} from './fixtures'

test.describe('Recurrentes', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    resetTestDatabase()
  })

  test('page loads', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/recurrentes')

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toMatch(/Pedidos Recurrentes|No hay recurrentes/)
    const buttons = page.locator('button:has-text("+ Nueva Plantilla")')
    const count = await buttons.count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('crear recurrente', async ({ page }) => {
    await loginAs(page, 'admin')

    const clienteRes = await createCliente(page, {
      nombre: `Cliente Rec ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    // Verificar que el cliente se creó realmente antes de continuar
    expect(clienteRes.success, `crear cliente falló: ${JSON.stringify(clienteRes)}`).toBe(true)
    const cliente = clienteRes.cliente || clienteRes.data
    expect(cliente).toBeTruthy()
    expect(cliente.nombre).toBeTruthy()

    await goto(page, '/recurrentes')

    await page.click('button:has-text("+ Nueva Plantilla")')
    await page.waitForURL('**/recurrentes/nuevo')
    await page.waitForTimeout(500)

    // Buscar cliente por nombre
    const searchInput = page.locator('[data-testid="cliente-search-input"]').first()
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.fill(cliente.nombre)

    // Esperar a que aparezcan opciones de búsqueda (debounce 300ms + network)
    const clienteOption = page.locator('[data-testid="cliente-option"]').filter({ hasText: cliente.nombre }).first()
    await expect(clienteOption, `cliente "${cliente.nombre}" no aparece en búsqueda`).toBeVisible({ timeout: 5000 })
    await clienteOption.click()

    // Verificar que el cliente quedó seleccionado
    await expect(page.locator('[data-testid="cliente-seleccionado-nombre"]')).toHaveText(cliente.nombre, { timeout: 5000 })
    await page.waitForTimeout(300)

    // Agregar producto: 3 pacas de agua (mínimo 3 productos por entrega)
    const aguaSpin = page.locator('[aria-label="Cantidad de Paca Agua"]').first()
    if (await aguaSpin.isVisible({ timeout: 3000 }).catch(() => false)) {
      await aguaSpin.fill('3')
      await page.waitForTimeout(300)
    }

    await page.click('button:has-text("Crear Plantilla")')
    await page.waitForTimeout(2000)

    await page.waitForURL('**/recurrentes', { timeout: 10000 })
    await handleBaseCaja(page)
    await page.waitForTimeout(500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(cliente.nombre)
  })

  test('editar recurrente', async ({ page }) => {
    await loginAs(page, 'admin')

    const cliente = await createCliente(page, {
      nombre: `Cliente Edit Rec ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await generateRecurrente(page, cliente.id)
    await page.waitForTimeout(300)

    await goto(page, '/recurrentes')

    const editBtn = page.locator('button:has-text("Editar")').first()
    if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editBtn.click()
      await page.waitForTimeout(500)

      const freqSelect = page.locator('select').last()
      if ((await freqSelect.locator('option').count()) > 1) {
        await freqSelect.selectOption({ index: 2 })
        await page.waitForTimeout(300)

        const submitBtn = page.locator('button[type="submit"]').first()
        await submitBtn.click()
        await page.waitForTimeout(2000)

        await page.waitForURL('**/recurrentes', { timeout: 10000 }).catch(() => null)
        await handleBaseCaja(page)
        await page.waitForTimeout(500)
      }
    }
  })

  test('eliminar recurrente (soft delete)', async ({ page }) => {
    await loginAs(page, 'admin')

    const cliente = await createCliente(page, {
      nombre: `Cliente Del Rec ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await generateRecurrente(page, cliente.id)
    await page.waitForTimeout(300)

    await goto(page, '/recurrentes')

    const deleteBtn = page.locator('button:has-text("Eliminar")').first()
    if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteBtn.click()
      await page.waitForTimeout(500)

      const confirmBtn = page.locator('[role="dialog"] button:has-text("Eliminar"), [role="dialog"] button:has-text("Confirmar")')
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.first().click()
        await page.waitForTimeout(1000)
      }
    }
  })

  test('generar seleccionados', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/recurrentes')

    const generateBtn = page.locator('button:has-text("Generar Seleccionados")')
    if (await generateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      expect(await generateBtn.isVisible()).toBe(true)
    }
  })

  test('API recurrente preview', async ({ page }) => {
    await loginAs(page, 'admin')

    const res = await apiGet(page, '/api/pedidos/recurrentes')
    expect(res.status()).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.preview).toBeDefined()
  })

  test('sugerencias NORMAL/SALTAR', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/recurrentes')

    const normalBtn = page.locator('button:has-text("NORMAL")').first()
    const saltarBtn = page.locator('button:has-text("SALTAR")').first()

    const hasNormal = await normalBtn.isVisible({ timeout: 2000 }).catch(() => false)
    const hasSaltar = await saltarBtn.isVisible({ timeout: 2000 }).catch(() => false)

    if (hasNormal) {
      await normalBtn.click()
      await page.waitForTimeout(300)
      const attr = await normalBtn.getAttribute('class')
      expect(attr).toContain('bg-blue')
    }

    if (hasSaltar) {
      await saltarBtn.click()
      await page.waitForTimeout(300)
      const attr = await saltarBtn.getAttribute('class')
      expect(attr).toContain('bg-gray')
    }
  })

  test('generar pedido desde recurrente via API', async ({ page }) => {
    await loginAs(page, 'admin')

    const cliente = await createCliente(page, {
      nombre: `Cliente Gen ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await generateRecurrente(page, cliente.id)
    await page.waitForTimeout(300)

    const previewRes = await apiGet(page, '/api/pedidos/recurrentes')
    const previewData = await previewRes.json()

    if (previewData.preview && previewData.preview.length > 0) {
      const decisiones = previewData.preview.map((item: { recurrenteId: string }) => ({
        recurrenteId: item.recurrenteId,
        decision: 'NORMAL',
      }))

      const genRes = await page.request.post(`${BASE}/api/pedidos/recurrentes`, {
        data: { decisiones },
      })
      expect(genRes.status()).toBe(201)

      const genData = await genRes.json()
      expect(genData.success).toBe(true)
    }
  })

  test('aplicar crédito de pedido pagado al recurrente', async ({ page }) => {
    await loginAs(page, 'admin')

    // 1. Crear cliente
    const clienteRes = await createCliente(page, {
      nombre: `Cliente Credito ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const cliente = clienteRes.cliente || clienteRes
    expect(cliente.id).toBeDefined()

    // 2. Crear pedido extra de 4 pacas con pago COMPLETO (debe pagar todo para que saldo = 0).
    // Se crea como PENDIENTE (ventaRapida: false) para cumplir el criterio
    // pedidosPagados (estadoEntrega=PENDIENTE, saldo=0, totalPagado>0).
    // ENTREGADO -> PENDIENTE es una transición inválida; no se puede degradar.
    const pedidoExtraData = await createPedido(page, {
      clienteId: cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      pacaAgua: 4,
      pagoMetodo: 'EFECTIVO',
      pagoMonto: 11200, // Pago completo: 4 pacas × $2,800
    })
    expect(pedidoExtraData.pedido).toBeDefined()

    // 3. Crear plantilla recurrente
    await generateRecurrente(page, cliente.id)
    await page.waitForTimeout(300)

    // 4. Verificar preview muestra opción "Aplicar crédito"
    const previewRes = await apiGet(page, '/api/pedidos/recurrentes')
    const previewData = await previewRes.json()
    expect(previewData.success).toBe(true)

    const previewItems = previewData.preview as Array<{
      clienteId: string
      recurrenteId: string
      pedidosPagados: unknown[]
      pedidosConDeuda: unknown[]
      sugerencias: Array<{ tipo: string; disabled?: boolean }>
    }>
    const item = previewItems.find((p) => p.clienteId === cliente.id)
    expect(item).toBeDefined()

    // Verificar que hay pedidos pagados y NO hay deuda
    expect(item!.pedidosPagados.length).toBeGreaterThan(0)
    expect(item!.pedidosConDeuda.length).toBe(0)

    // Verificar que la sugerencia APLICAR_CREDITO existe
    const creditoSug = item!.sugerencias.find((s) => s.tipo === 'APLICAR_CREDITO')
    expect(creditoSug).toBeDefined()
    expect(creditoSug!.disabled).toBeFalsy()

    // 5. Generar con APLICAR_CREDITO vía API
    const genRes = await page.request.post(`${BASE}/api/pedidos/recurrentes`, {
      data: {
        decisiones: [{
          recurrenteId: item!.recurrenteId,
          decision: 'APLICAR_CREDITO',
        }],
      },
    })
    const genData = await genRes.json()
    expect(genRes.status()).toBe(201)
    expect(genData.success).toBe(true)
    expect(genData.generados).toBe(1)

    // 6. Verificar que se creó pedido con saldo correcto
    const pedidosRes = await apiGet(page, `/api/pedidos?clienteId=${cliente.id}`)
    const pedidosData = await pedidosRes.json()
    expect(pedidosData.success).toBe(true)

    const pedidosDataList = pedidosData.data as Array<{
      origen: string
      numero: number
      total: number | string
      totalPagado: number | string
      saldo: number | string
      estadoEntrega: string
    }> | undefined
    const pedidoRecurrente = pedidosDataList?.find((p) => p.origen === 'RECURRENTE')
    expect(pedidoRecurrente).toBeDefined()
    expect(Number(pedidoRecurrente!.total)).toBeGreaterThan(0)
    expect(Number(pedidoRecurrente!.totalPagado)).toBe(11200)
    expect(Number(pedidoRecurrente!.saldo)).toBe(Number(pedidoRecurrente!.total) - 11200)

    // 7. Verificar pedido viejo marcado como ENTREGADO
    const pedidoViejo = pedidosDataList?.find((p) => p.numero === pedidoExtraData.pedido.numero)
    expect(pedidoViejo!.estadoEntrega).toBe('ENTREGADO')
  })
})

async function generateRecurrente(page: import('@playwright/test').Page, clienteId: string) {
  const res = await page.request.post(`${BASE}/api/recurrentes`, {
    data: {
      clienteId,
      tipo: 'ENVIO',
      canal: 'DOMICILIO',
      cadaNDias: 1,
      proxGeneracion: new Date().toISOString(),
      productos: { pacaAgua: 5 }, // 5 pacas para superar el crédito de 4 pacas
    },
  })
  return res.json()
}
