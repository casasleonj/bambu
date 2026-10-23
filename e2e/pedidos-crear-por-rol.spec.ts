// @tests B-17 (#434): Pedidos solo ofrece crear a quien puede (ADMIN/ASISTENTE).
// Independiente del flag NEXT_PUBLIC_PEDIDOS_V2: el botón «+» y el enlace ?new=1
// viven en pedidos-client (compartido por el Hub y la UI de tabs). El menú de
// comandos sólo existe con el Hub, y se prueba únicamente con el flag ON.
import { test, expect, createCliente, BASE, sharedLoginAs, appMain } from './fixtures'
import type { Page } from '@playwright/test'

const HUB_ON = process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true'

/**
 * Entra a Pedidos y deja pasar la ventana en la que la sesión del cliente
 * resuelve el rol. Las pruebas negativas («no aparece») son válidas porque cada
 * una tiene su control positivo (el asistente SÍ lo ve) en este mismo archivo.
 */
async function irAPedidos(page: Page, query = '') {
  await page.goto(`${BASE}/pedidos${query}`)
  await expect(appMain(page)).toBeVisible({ timeout: 20000 })
  await page.waitForTimeout(2500)
}

test.describe('Pedidos: crear solo para quien puede (B-17, #434)', () => {
  test('un CONTADOR no ve el botón «+»; un ASISTENTE sí', async ({ browser }) => {
    const contador = await sharedLoginAs(browser, 'contador')
    await irAPedidos(contador)
    await expect(appMain(contador)).toBeVisible()
    await expect(contador.getByTestId('fab-container')).toHaveCount(0)
    await expect(contador.getByTestId('fab-main')).toHaveCount(0)

    const asistente = await sharedLoginAs(browser, 'asistente')
    await irAPedidos(asistente)
    await expect(asistente.getByTestId('fab-main')).toBeVisible({ timeout: 20000 })
  })

  test('un CONTADOR con ?new=1&clienteId= ve la lista: no se abre el formulario y se limpia el enlace', async ({ browser }) => {
    const admin = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(admin, { nombre: `Cliente Rol ${Date.now()}` })

    const contador = await sharedLoginAs(browser, 'contador')
    await irAPedidos(contador, `?new=1&clienteId=${cliente.id}`)
    await expect(appMain(contador)).toBeVisible()
    await expect.poll(() => new URL(contador.url()).searchParams.get('new'), { timeout: 10000 }).toBeNull()
    await expect(contador.getByText('📦 Nuevo Pedido')).toHaveCount(0)
    await expect(contador.getByTestId('fab-container')).toHaveCount(0)
  })

  test('el mismo enlace sí abre el formulario a un ASISTENTE', async ({ browser }) => {
    const admin = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(admin, { nombre: `Cliente Rol Ok ${Date.now()}` })

    const asistente = await sharedLoginAs(browser, 'asistente')
    await irAPedidos(asistente, `?new=1&clienteId=${cliente.id}`)
    await expect(asistente.getByText('📦 Nuevo Pedido')).toBeVisible({ timeout: 15000 })
  })

  test('menú de comandos (Hub): «Nueva operación» solo para quien puede crear', async ({ browser }) => {
    test.skip(!HUB_ON, 'el menú de comandos existe sólo con NEXT_PUBLIC_PEDIDOS_V2=true')
    const contador = await sharedLoginAs(browser, 'contador')
    await irAPedidos(contador)
    await expect(appMain(contador)).toBeVisible()
    await contador.keyboard.press('Control+k')
    await expect(contador.getByTestId('command-menu')).toBeVisible()
    await expect(contador.getByTestId('command-cartera')).toBeVisible()
    await expect(contador.getByTestId('command-nueva')).toHaveCount(0)

    const asistente = await sharedLoginAs(browser, 'asistente')
    await irAPedidos(asistente)
    await expect(appMain(asistente)).toBeVisible()
    await asistente.keyboard.press('Control+k')
    await expect(asistente.getByTestId('command-nueva')).toBeVisible()
  })
})
