// @tests #696 — saldo a favor del cliente y de dónde viene: etiqueta en la lista, tarjeta y movimientos en el detalle,
// recuadro del pedido y estados de error. Datos reales en PostgreSQL; el cobro con sobrante se hace con pagar-fiado.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { test, expect, loginAs, goto, appMain, resetTestDatabase, apiPost } from './fixtures'

const db = new PrismaClient()
test.beforeEach(() => resetTestDatabase())
test.afterAll(async () => db.$disconnect())

async function clienteConDeuda() {
  const nombre = `Saldo696 ${randomUUID().slice(0, 6)}`
  const cliente = await db.cliente.create({ data: { nombre, apellido: 'Gómez', telefono: randomUUID() } })
  const total = 10000
  const p = await db.pedido.create({
    data: {
      clienteId: cliente.id,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      fecha: new Date(),
      estado: 'ENTREGADO',
      estadoEntrega: 'ENTREGADO',
      estadoPago: 'PENDIENTE',
      total,
      totalPagado: 0,
      saldo: total,
      cPacaAguaPed: 1,
      cPacaAguaEnt: 1,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: 1, cantEntrega: 1, precio: total, subtotal: total }] },
    },
  })
  const factura = await db.factura.create({
    data: { numero: `F696-${randomUUID().slice(0, 6)}`, pedidoId: p.id, clienteId: cliente.id, subtotal: total, total, montoPagado: 0, saldo: total },
  })
  return { cliente, nombre, p, factura }
}

test('con sobrante: etiqueta en la lista, tarjeta con el saldo y el origen de cada movimiento', async ({ page }) => {
  test.setTimeout(120000)
  const { cliente, nombre, p, factura } = await clienteConDeuda()
  await loginAs(page, 'admin')
  const cobro = await apiPost(page, '/api/pedidos/pagar-fiado', { clienteId: cliente.id, monto: 14000, metodo: 'EFECTIVO', offlineId: randomUUID() })
  expect(cobro.status()).toBe(200)

  // Lista: la etiqueta «A favor $4.000» (escritorio o móvil, según el proyecto).
  await goto(page, `/clientes?search=${encodeURIComponent(nombre)}`)
  const fila = page.getByTestId(`cliente-row-${cliente.id}`)
  await expect(fila).toBeVisible()
  await expect(fila.locator('[data-testid^="chip-saldo-favor"]:visible').first()).toContainText('4.000')

  // Detalle: tarjeta con el saldo.
  await goto(page, `/clientes?openCliente=${cliente.id}`)
  await expect(appMain(page).getByTestId('saldo-favor-monto')).toContainText('4.000')

  // Una línea corta por movimiento, con quién y cuándo, y el detalle cerrado.
  const mov = appMain(page).getByTestId('saldo-favor-movimiento').first()
  await expect(mov).toContainText('Entregó de más al pagar fiados')
  await expect(mov).toContainText('Lo registró')
  await expect(mov.getByTestId('saldo-favor-detalle')).toBeHidden()

  // Recuadro del pedido: pedido y factura, sin abrir el detalle.
  await mov.getByRole('button', { name: `Pedido #${p.numero}` }).click()
  const recuadro = page.getByRole('tooltip')
  await expect(recuadro).toContainText(`Factura ${factura.numero}`)
  await expect(mov.getByTestId('saldo-favor-detalle')).toBeHidden()
  // El recuadro cabe en la pantalla (no se corta en el borde del panel).
  const caja = await recuadro.boundingBox()
  const pantalla = page.viewportSize()
  expect(caja).not.toBeNull()
  expect(caja!.x).toBeGreaterThanOrEqual(0)
  expect(caja!.x + caja!.width).toBeLessThanOrEqual(pantalla!.width)
  // Escape cierra solo el recuadro: el panel del cliente sigue abierto.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await expect(appMain(page).getByTestId('saldo-favor-monto')).toBeVisible()

  // Detalle completo: cobro, pedidos pagados y quién lo registró.
  await mov.getByText('Ver detalle').click()
  const detalle = mov.getByTestId('saldo-favor-detalle')
  await expect(detalle).toBeVisible()
  await expect(detalle).toContainText('Se recibieron')
  await expect(detalle).toContainText(`#${p.numero} · Factura ${factura.numero}`)
  await expect(detalle).toContainText('Lo registró')

  // La pantalla solo lee: el saldo en la base sigue siendo el mismo.
  expect(Number((await db.cliente.findUniqueOrThrow({ where: { id: cliente.id } })).saldoFavor)).toBe(4000)
})

test('un cliente sin saldo no muestra etiqueta y su detalle lo dice sin una tarjeta en cero', async ({ page }) => {
  test.setTimeout(90000)
  const { cliente, nombre } = await clienteConDeuda()
  await loginAs(page, 'admin')
  await goto(page, `/clientes?search=${encodeURIComponent(nombre)}`)
  await expect(page.getByTestId(`cliente-row-${cliente.id}`)).toBeVisible()
  await expect(page.locator('[data-testid^="chip-saldo-favor"]')).toHaveCount(0)
  await goto(page, `/clientes?openCliente=${cliente.id}`)
  await expect(appMain(page).getByTestId('saldo-favor-vacio')).toContainText('no tiene')
  await expect(appMain(page).getByTestId('saldo-favor-card')).toHaveCount(0)
})

test('si el servidor falla dice que NO es cero y Reintentar lo recupera', async ({ page }) => {
  test.setTimeout(120000)
  const { cliente } = await clienteConDeuda()
  await db.cliente.update({ where: { id: cliente.id }, data: { saldoFavor: 2500 } })
  await loginAs(page, 'admin')
  let fallar = true
  await page.route('**/api/clientes/*/saldo-favor', (ruta) =>
    fallar ? ruta.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'x' } }) }) : ruta.continue(),
  )
  await goto(page, `/clientes?openCliente=${cliente.id}`)
  const aviso = appMain(page).getByTestId('saldo-favor-error')
  await expect(aviso).toContainText('No es cero')
  await expect(appMain(page).getByTestId('saldo-favor-vacio')).toHaveCount(0)
  fallar = false
  await aviso.getByRole('button', { name: 'Reintentar' }).click()
  await expect(appMain(page).getByTestId('saldo-favor-monto')).toContainText('2.500')
})

test('el filtro «Con saldo a favor» deja solo a quienes lo tienen y se limpia', async ({ page }) => {
  test.setTimeout(120000)
  const con = await clienteConDeuda()
  await db.cliente.update({ where: { id: con.cliente.id }, data: { saldoFavor: 3000 } })
  const sin = await clienteConDeuda()
  await loginAs(page, 'admin')
  await goto(page, '/clientes')
  await page.getByTestId('filtro-saldo-favor').click()
  await expect(page.getByTestId('filtro-saldo-favor')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId(`cliente-row-${con.cliente.id}`)).toBeVisible()
  await expect(page.getByTestId(`cliente-row-${sin.cliente.id}`)).toHaveCount(0)
  await page.getByTestId('filtro-saldo-favor').click()
  await expect(page.getByTestId('filtro-saldo-favor')).toHaveAttribute('aria-pressed', 'false')
})

test('el Historial del cliente muestra los movimientos del saldo a favor con su detalle', async ({ page }) => {
  test.setTimeout(120000)
  const { cliente, p } = await clienteConDeuda()
  await loginAs(page, 'admin')
  const cobro = await apiPost(page, '/api/pedidos/pagar-fiado', { clienteId: cliente.id, monto: 14000, metodo: 'EFECTIVO', offlineId: randomUUID() })
  expect(cobro.status()).toBe(200)
  await goto(page, `/clientes?openCliente=${cliente.id}`)
  await expect(appMain(page).getByTestId('saldo-favor-monto')).toBeVisible()
  // El clic en la pestaña puede perderse si la página aún se está hidratando: se repite hasta que abre.
  const filtro = appMain(page).getByRole('button', { name: 'Saldo a favor', exact: true })
  await expect(async () => {
    await appMain(page).getByRole('button', { name: 'Historial', exact: true }).locator('visible=true').first().click()
    await expect(filtro).toBeVisible({ timeout: 3000 })
  }).toPass({ timeout: 30000 })
  await filtro.click()
  const mov = appMain(page).getByTestId('saldo-favor-movimiento').first()
  await expect(mov).toContainText('Entregó de más al pagar fiados')
  await expect(mov).toContainText('4.000')
  await mov.getByRole('button', { name: `Pedido #${p.numero}` }).click()
  await expect(page.getByRole('tooltip')).toContainText('Factura')
})
