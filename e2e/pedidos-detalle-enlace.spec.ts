// @tests P1-1 PR A (#377): el detalle del pedido se abre por enlace.
// Independiente del flag NEXT_PUBLIC_PEDIDOS_V2: el arreglo vive en pedidos-client (compartido).
import { test, expect, apiPost, createCliente, BASE, sharedLoginAs, appMain } from './fixtures'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function crearPedido(page: Parameters<typeof createCliente>[0], nombre: string) {
  const { cliente } = await createCliente(page, { nombre })
  const res = await apiPost(page, '/api/pedidos', {
    clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad: 2 }], offlineId: `enlace-${Date.now()}-${Math.random()}`,
  })
  const body = await res.json()
  return { id: (body.data?.pedido ?? body.pedido).id as string, numero: (body.data?.pedido ?? body.pedido).numero as number, nombre }
}

/** cambia la URL como lo hace el resto de la app (sin recargar) y avisa a useShallowSearchParams. */
async function irSinRecargar(page: Parameters<typeof createCliente>[0], url: string) {
  await page.evaluate((u) => {
    window.history.pushState(null, '', u)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, url)
}

test.describe('Detalle del pedido por enlace (P1-1 PR A)', () => {
  test('/pedidos/<id> ya no da 404: redirige a la lista y abre el detalle', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const ped = await crearPedido(page, `Enlace ruta ${Date.now()}`)
    const respuesta = await page.goto(`${BASE}/pedidos/${ped.id}`)
    expect(respuesta?.status()).toBeLessThan(400)
    await expect(appMain(page).getByText('Total Pedido', { exact: true })).toBeVisible({ timeout: 20000 })
    await expect(page).toHaveURL(/\/pedidos(\?|$)/)
    await expect(page).not.toHaveURL(/openPedido/)
  })

  test('?openPedido= abre un pedido que NO está en la lista cargada (se busca por id)', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await page.goto(`${BASE}/pedidos`)
    await expect(appMain(page).getByTestId('fab-main')).toBeVisible({ timeout: 20000 })
    // el pedido nace DESPUÉS de cargar la lista: no está en ella
    const ped = await crearPedido(page, `Enlace fuera de lista ${Date.now()}`)
    await irSinRecargar(page, `/pedidos?openPedido=${ped.id}`)
    await expect(appMain(page).getByText('Total Pedido', { exact: true })).toBeVisible({ timeout: 15000 })
    await expect(appMain(page).getByTestId('pedido-detalle').getByText(ped.nombre)).toBeVisible()
    await expect(page).not.toHaveURL(/openPedido/)
    const enBD = await prisma.pedido.findUniqueOrThrow({ where: { id: ped.id } })
    expect(enBD.numero).toBe(ped.numero)
  })

  test('un enlace a un pedido que no existe avisa y limpia la URL', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await page.goto(`${BASE}/pedidos?openPedido=pedido-que-no-existe`)
    await expect(page.getByText('Ese pedido no existe o ya no está disponible.').first()).toBeVisible({ timeout: 20000 })
    await expect(page).not.toHaveURL(/openPedido/)
    await expect(appMain(page).getByText('Total Pedido', { exact: true })).toHaveCount(0)
  })

  test('sin conexión avisa que no se pudo abrir el pedido', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await page.goto(`${BASE}/pedidos`)
    await expect(appMain(page).getByTestId('fab-main')).toBeVisible({ timeout: 20000 })
    const ped = await crearPedido(page, `Enlace offline ${Date.now()}`)
    await page.context().setOffline(true)
    await irSinRecargar(page, `/pedidos?openPedido=${ped.id}`)
    await expect(page.getByText('Sin conexión. No se pudo abrir el pedido.').first()).toBeVisible({ timeout: 15000 })
    await page.context().setOffline(false)
    await expect(page).not.toHaveURL(/openPedido/)
  })
})
