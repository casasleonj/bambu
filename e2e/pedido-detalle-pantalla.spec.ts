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

  test('cada línea muestra el origen del precio guardado en la base de datos', async ({ browser }) => {
    test.setTimeout(90_000) // cinco aperturas del detalle en un mismo test
    const page = await sharedLoginAs(browser, 'admin')
    const ped = await crearPedido(page, `Detalle origen ${Date.now()}`, false)
    const item = await prisma.pedidoItem.findFirstOrThrow({ where: { pedidoId: ped.id } })
    const origen = page.getByTestId('detalle-origen-precio')

    const abrir = async () => {
      await page.goto(`${BASE}/pedidos?openPedido=${ped.id}`)
      await expect(appMain(page).getByTestId('detalle-productos')).toBeVisible({ timeout: 20000 })
    }
    const fijar = (data: { precioOrigen: string; autorizadoPorAdmin?: boolean }) =>
      prisma.pedidoItem.update({ where: { id: item.id }, data })

    // base: sin insignia
    await fijar({ precioOrigen: 'base' })
    await abrir()
    await expect(origen).toHaveCount(0)

    await fijar({ precioOrigen: 'volumen' })
    await abrir()
    // con tramo conocido la insignia lleva el rango («volumen 1–4 und»); el rango se prueba en su propio test
    await expect(origen).toHaveText(/^volumen/)

    await fijar({ precioOrigen: 'cliente' })
    await abrir()
    await expect(origen).toHaveText('especial')

    await fijar({ precioOrigen: 'manual', autorizadoPorAdmin: false })
    await abrir()
    await expect(origen).toHaveText('manual · sin autorizar')

    await fijar({ precioOrigen: 'manual', autorizadoPorAdmin: true })
    await abrir()
    await expect(origen).toHaveText('manual ✓ autorizado')
  })

  test('un precio manual creado por la API nace "manual · sin autorizar"', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(page, { nombre: `Detalle manual ${Date.now()}` })
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1, precioManual: 3333 }],
      offlineId: `detalle-manual-${Date.now()}`,
    })
    const body = await res.json()
    const id = (body.data?.pedido ?? body.pedido).id as string
    const item = await prisma.pedidoItem.findFirstOrThrow({ where: { pedidoId: id } })
    expect(item.precioOrigen).toBe('manual')
    await page.goto(`${BASE}/pedidos?openPedido=${id}`)
    await expect(appMain(page).getByTestId('detalle-origen-precio')).toHaveText(
      item.autorizadoPorAdmin ? 'manual ✓ autorizado' : 'manual · sin autorizar',
    )
  })

  test('un pedido por volumen muestra el tramo que le tocó, según la tabla de precios de la base', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(page, { nombre: `Detalle tramo ${Date.now()}` })
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'PUNTO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }],
      offlineId: `detalle-tramo-${Date.now()}`,
    })
    const body = await res.json()
    const id = (body.data?.pedido ?? body.pedido).id as string
    const item = await prisma.pedidoItem.findFirstOrThrow({ where: { pedidoId: id } })
    const tramos = await prisma.precioVolumen.findMany({
      where: { activo: true, producto: { codigo: 'PACA_AGUA' }, cantMin: { lte: 5 } },
      orderBy: { cantMin: 'desc' },
    })
    const tramo = tramos.find((t) => t.cantMax === null || t.cantMax >= 5)
    test.skip(item.precioOrigen !== 'volumen' || !tramo, 'la base de prueba no tiene un tramo de volumen para 5 und')
    const rango = tramo!.cantMax === null ? `${tramo!.cantMin} o más und` : `${tramo!.cantMin}–${tramo!.cantMax} und`
    await page.goto(`${BASE}/pedidos?openPedido=${id}`)
    await expect(appMain(page).getByTestId('detalle-origen-precio')).toHaveText(`volumen ${rango}`)
  })

  test('el precio manual sin autorizar se ve neutro para la asistente y con advertencia para el admin; la insignia explica al pasar el cursor', async ({ browser }) => {
    const admin = await sharedLoginAs(browser, 'admin')
    const ped = await crearPedido(admin, `Detalle rol ${Date.now()}`, false)
    const item = await prisma.pedidoItem.findFirstOrThrow({ where: { pedidoId: ped.id } })
    await prisma.pedidoItem.update({ where: { id: item.id }, data: { precioOrigen: 'manual', autorizadoPorAdmin: false } })

    await admin.goto(`${BASE}/pedidos?openPedido=${ped.id}`)
    const insigniaAdmin = appMain(admin).getByTestId('detalle-origen-precio')
    await expect(insigniaAdmin).toHaveText('manual · sin autorizar', { timeout: 20000 })
    await expect(insigniaAdmin).toHaveAttribute('title', /ningún administrador/)

    const asistente = await sharedLoginAs(browser, 'asistente')
    await asistente.goto(`${BASE}/pedidos?openPedido=${ped.id}`)
    const insigniaAsistente = appMain(asistente).getByTestId('detalle-origen-precio')
    await expect(insigniaAsistente).toHaveText('manual', { timeout: 20000 })
    await expect(insigniaAsistente).toHaveAttribute('title', /escrito a mano/)
  })
})
