// @tests P1-1 PR B (#379): pantalla de detalle del pedido (cajón en escritorio, pantalla completa en móvil).
// Independiente del flag NEXT_PUBLIC_PEDIDOS_V2: vive en pedidos-client (compartido).
import { test, expect, apiPost, createCliente, BASE, sharedLoginAs, appMain } from './fixtures'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function crearPedido(page: Parameters<typeof createCliente>[0], nombre: string, conPago: boolean) {
  const telefono = `3${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`
  const { cliente } = await createCliente(page, { nombre, telefono })
  const res = await apiPost(page, '/api/pedidos', {
    clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', obs: 'Dejar con el portero',
    items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
    ...(conPago ? { pagos: [{ metodo: 'EFECTIVO', monto: 1000 }] } : {}),
    offlineId: `detalle-${Date.now()}-${Math.random()}`,
  })
  const body = await res.json()
  const p = body.data?.pedido ?? body.pedido
  return { id: p.id as string, numero: p.numero as number, nombre, telefono }
}

test.describe('Pantalla de detalle del pedido (P1-1 PR B)', () => {
  test('muestra dinero, entrega, productos, pagos, observaciones y contacto con datos reales', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const ped = await crearPedido(page, `Detalle pantalla ${Date.now()}`, true)
    await page.goto(`${BASE}/pedidos?openPedido=${ped.id}`)
    const detalle = appMain(page).getByTestId('pedido-detalle')
    await expect(detalle).toBeVisible({ timeout: 20000 })

    await expect(detalle.getByTestId('detalle-dinero').getByText('Total Pedido', { exact: true })).toBeVisible()
    await expect(detalle.getByTestId('detalle-productos')).toContainText('2 und')
    await expect(detalle.getByTestId('detalle-obs')).toContainText('Dejar con el portero')
    await expect(detalle.getByTestId('detalle-contacto').getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', `https://wa.me/57${ped.telefono}`)
    await expect(detalle.getByTestId('detalle-contacto').getByRole('link', { name: /Llamar/ })).toHaveAttribute('href', new RegExp(`^tel:(57)?${ped.telefono}$`))
    await expect(detalle.getByTestId('detalle-entrega').locator('li[data-estado="actual"]')).toContainText('Creado')

    // los pagos mostrados son los de la base de datos
    const enBD = await prisma.pago.findMany({ where: { pedidoId: ped.id } })
    await expect(detalle.getByTestId('detalle-pago')).toHaveCount(enBD.length)
    if (enBD.length > 0) await expect(detalle.getByTestId('detalle-pago').first()).toContainText('Efectivo')
  })

  test('PENDIENTE ofrece Enviar, Editar y Cancelar; Cancelar queda en la base de datos', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const ped = await crearPedido(page, `Detalle cancelar ${Date.now()}`, false)
    await page.goto(`${BASE}/pedidos?openPedido=${ped.id}`)
    const acciones = appMain(page).getByTestId('detalle-acciones')
    await expect(acciones).toBeVisible({ timeout: 20000 })
    await expect(acciones.getByRole('button', { name: /Enviar/ })).toBeVisible()
    await expect(acciones.getByRole('button', { name: /Editar/ })).toBeVisible()
    await acciones.getByRole('button', { name: 'Cancelar' }).click()
    await page.getByRole('button', { name: 'Sí, cancelar' }).click()
    await expect.poll(async () => (await prisma.pedido.findUniqueOrThrow({ where: { id: ped.id } })).estadoEntrega, { timeout: 15000 }).toBe('CANCELADO')
  })

  test('EN_RUTA ofrece Marcar Entregado y Volver a Pendiente; ENTREGADO solo Anular Pedido', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const enRuta = await crearPedido(page, `Detalle ruta ${Date.now()}`, false)
    await prisma.pedido.update({ where: { id: enRuta.id }, data: { estadoEntrega: 'EN_RUTA' } })
    await page.goto(`${BASE}/pedidos?openPedido=${enRuta.id}`)
    const acciones = appMain(page).getByTestId('detalle-acciones')
    await expect(acciones.getByRole('button', { name: /Marcar Entregado/ })).toBeVisible({ timeout: 20000 })
    await expect(acciones.getByRole('button', { name: /Volver a Pendiente/ })).toBeVisible()

    const entregado = await crearPedido(page, `Detalle entregado ${Date.now()}`, false)
    await prisma.pedido.update({ where: { id: entregado.id }, data: { estadoEntrega: 'ENTREGADO' } })
    await page.goto(`${BASE}/pedidos?openPedido=${entregado.id}`)
    const acciones2 = appMain(page).getByTestId('detalle-acciones')
    await expect(acciones2.getByRole('button', { name: 'Anular Pedido' })).toBeVisible({ timeout: 20000 })
    await expect(acciones2.getByRole('button')).toHaveCount(1)
    // entregado con saldo: alerta de fiado y acceso a la cartera
    await expect(appMain(page).getByTestId('detalle-alerta-fiado')).toBeVisible()
    await expect(appMain(page).getByTestId('detalle-ver-cartera')).toBeVisible()
  })

  test('el cierre vuelve a la lista y el botón Cerrar funciona', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const ped = await crearPedido(page, `Detalle cerrar ${Date.now()}`, false)
    await page.goto(`${BASE}/pedidos?openPedido=${ped.id}`)
    await expect(appMain(page).getByTestId('pedido-detalle')).toBeVisible({ timeout: 20000 })
    await appMain(page).getByTestId('pedido-detalle').getByRole('button', { name: 'Cerrar' }).click()
    await expect(appMain(page).getByTestId('pedido-detalle')).toHaveCount(0)
  })
})
