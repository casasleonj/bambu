// @tests #526 — interfaz aprobada y lectura financiera real; PostgreSQL local/CI.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import {
  test,
  expect,
  loginAs,
  goto,
  appMain,
  resetTestDatabase,
  apiPost,
} from './fixtures'
const db = new PrismaClient()
const hoy = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const fecha = (dia: string) => new Date(`${dia}T12:00:00-05:00`)
test.beforeEach(() => resetTestDatabase())
test.afterAll(async () => db.$disconnect())
async function pedido(
  opts: {
    dia?: string
    canal?: 'PUNTO' | 'DOMICILIO'
    producto?: 'PACA_AGUA' | 'PACA_HIELO' | 'BOTELLON'
    cantidad?: number
    precio?: number
    pagado?: number
  } = {},
) {
  const cliente = await db.cliente.create({
    data: {
      nombre: `Sintético 526 ${randomUUID().slice(0, 6)}`,
      telefono: randomUUID(),
    },
  })
  const producto = opts.producto ?? 'PACA_AGUA',
    cantidad = opts.cantidad ?? 10,
    precio = opts.precio ?? 10000,
    total = cantidad * precio,
    pagado = opts.pagado ?? 0
  const p = await db.pedido.create({
    data: {
      clienteId: cliente.id,
      canal: opts.canal ?? 'DOMICILIO',
      origen: 'PEDIDO',
      fecha: fecha(opts.dia ?? hoy()),
      estado: 'ENTREGADO',
      estadoEntrega: 'ENTREGADO',
      estadoPago:
        pagado >= total ? 'PAGADO' : pagado > 0 ? 'PARCIAL' : 'PENDIENTE',
      total,
      totalPagado: pagado,
      saldo: total - pagado,
      cPacaAguaPed: producto === 'PACA_AGUA' ? cantidad : 0,
      cPacaAguaEnt: producto === 'PACA_AGUA' ? cantidad : 0,
      cPacaHieloPed: producto === 'PACA_HIELO' ? cantidad : 0,
      cPacaHieloEnt: producto === 'PACA_HIELO' ? cantidad : 0,
      cBotellonFabPed: producto === 'BOTELLON' ? cantidad : 0,
      cBotellonFabEnt: producto === 'BOTELLON' ? cantidad : 0,
      items: {
        create: [
          {
            producto,
            cantPedido: cantidad,
            cantEntrega: cantidad,
            precio,
            subtotal: total,
          },
        ],
      },
    },
  })
  const factura = await db.factura.create({
    data: {
      numero: `F526-${randomUUID().slice(0, 6)}`,
      pedidoId: p.id,
      clienteId: cliente.id,
      subtotal: total,
      total,
      montoPagado: pagado,
      saldo: total - pagado,
    },
  })
  return { p, cliente, factura }
}
async function pago(
  pedidoId: string,
  monto: number,
  metodo: 'EFECTIVO' | 'NEQUI' | 'BONO' = 'EFECTIVO',
  confirmacion: 'CONFIRMADO' | 'REPORTADO' | 'DISCREPANTE' = 'CONFIRMADO',
) {
  return db.pago.create({ data: { pedidoId, monto, metodo, confirmacion } })
}
async function normal() {
  const aguaP = await pedido({
      canal: 'PUNTO',
      cantidad: 6,
      precio: 3000,
      pagado: 18000,
    }),
    hieloP = await pedido({
      canal: 'PUNTO',
      producto: 'PACA_HIELO',
      cantidad: 4,
      precio: 5000,
      pagado: 20000,
    }),
    bot = await pedido({
      canal: 'PUNTO',
      producto: 'BOTELLON',
      cantidad: 2,
      precio: 10000,
      pagado: 20000,
    }),
    aguaD = await pedido({ cantidad: 4, precio: 3000, pagado: 7000 }),
    hieloD = await pedido({ producto: 'PACA_HIELO', cantidad: 6, precio: 5000 })
  await pago(aguaP.p.id, 10000)
  await pago(aguaP.p.id, 8000, 'NEQUI')
  await pago(hieloP.p.id, 3000)
  await pago(hieloP.p.id, 7000, 'NEQUI')
  await pago(hieloP.p.id, 10000, 'NEQUI', 'REPORTADO')
  await pago(bot.p.id, 20000)
  await pago(aguaD.p.id, 7000)
  const viejo = await pedido({
      dia: '2020-01-01',
      cantidad: 2,
      precio: 10000,
      pagado: 20000,
    }),
    cobro = await pago(viejo.p.id, 20000)
  await db.abono.create({
    data: {
      numero: `A526-${randomUUID().slice(0, 6)}`,
      facturaId: viejo.factura.id,
      clienteId: viejo.cliente.id,
      pedidoId: viejo.p.id,
      monto: 20000,
      metodoPago: 'EFECTIVO',
      origenCobro: 'ESPEJO_PAGO',
      pagoOrigenId: cobro.id,
    },
  })
  await db.config.upsert({
    where: { clave: `BASE_DIA_${hoy()}` },
    create: { clave: `BASE_DIA_${hoy()}`, valor: '50000' },
    update: { valor: '50000' },
  })
  await db.gasto.create({
    data: {
      categoria: 'OTROS',
      descripcion: 'Sintético dashboard',
      monto: 10000,
    },
  })
  return { viejo, hieloD }
}
const card = (page: Parameters<typeof appMain>[0], titulo: string) =>
  appMain(page).getByText(titulo, { exact: true }).locator('..')
test('ventas100000, efectivo60000 y Nequi25000 se distinguen; precio/producto separan Punto y Domicilio', async ({
  page,
}, info) => {
  test.setTimeout(90000)
  const { viejo } = await normal()
  await loginAs(page, 'admin')
  await goto(page, '/dashboard')
  await expect(card(page, 'Ventas del Día')).toContainText('100.000')
  await expect(card(page, 'Efectivo Cobrado')).toContainText('60.000')
  await expect(appMain(page).getByTestId('medio-NEQUI')).toContainText('25.000')
  await expect(appMain(page).getByTestId('medio-NEQUI')).toContainText('15.000')
  await expect(appMain(page).getByTestId('medio-NEQUI')).toContainText('10.000')
  await expect(appMain(page).getByTestId('medio-DAVIPLATA')).toHaveCount(0)
  await expect(appMain(page).getByTestId('medio-TRANSFERENCIA')).toHaveCount(0)
  const filas = appMain(page).getByTestId('venta-precio-fila')
  await expect(filas).toHaveCount(5)
  for (const canal of ['Punto', 'Domicilio'])
    await expect(
      appMain(page)
        .getByTestId('producto-PACA_AGUA')
        .getByText(new RegExp(canal)),
    ).toBeVisible()
  await expect(appMain(page).getByTestId('producto-PACA_AGUA')).toHaveCount(1)
  const nequiBox = await appMain(page).getByTestId('medio-NEQUI').boundingBox()
  const deudaBox = await appMain(page)
    .getByRole('heading', { name: 'Fiados pendientes', exact: true })
    .locator('..')
    .boundingBox()
  expect(nequiBox).not.toBeNull()
  expect(deudaBox).not.toBeNull()
  expect(Math.abs(nequiBox!.y - deudaBox!.y)).toBeLessThan(2)
  const aguaBox = await appMain(page)
    .getByTestId('producto-PACA_AGUA')
    .boundingBox()
  const hieloBox = await appMain(page)
    .getByTestId('producto-PACA_HIELO')
    .boundingBox()
  expect(Math.abs(aguaBox!.y - hieloBox!.y)).toBeLessThan(2)

  await expect(appMain(page)).toContainText(
    'Disponible en oficina: por conciliar',
  )
  await expect(appMain(page)).not.toContainText('Efectivo esperado')
  await appMain(page)
    .getByRole('button', { name: 'Ver cobros', exact: true })
    .click()
  const detalle = page.getByTestId('dashboard-cobros-detalle')
  await expect(detalle).toContainText('Cobro de pedido anterior')
  await expect(
    detalle.getByRole('link', {
      name: `Ver pedido #${viejo.p.numero}`,
      exact: true,
    }),
  ).toBeVisible()
  await detalle
    .getByRole('button', { name: 'Volver al dashboard', exact: true })
    .click()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await info.attach('dashboard-526-normal', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
  if (info.project.name.includes('mobile')) {
    await page.setViewportSize({ width: 320, height: 844 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await info.attach('dashboard-526-320', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  }
})
test('un cobro de deuda anterior entra hoy aunque no haya ventas nuevas y no inventa digitales', async ({
  page,
}) => {
  const viejo = await pedido({ dia: '2020-01-01', pagado: 20000 })
  await pago(viejo.p.id, 20000)
  await loginAs(page, 'admin')
  await goto(page, '/dashboard')
  await expect(card(page, 'Ventas del Día')).toContainText(/\$\s*0/)
  await expect(card(page, 'Efectivo Cobrado')).toContainText('20.000')
  await expect(appMain(page).getByTestId('medio-NEQUI')).toHaveCount(0)
})
test('un prepago con BONO no reaparece como efectivo ni como digital confirmado', async ({
  page,
}) => {
  const { p } = await pedido({ pagado: 100000 })
  await pago(p.id, 100000, 'BONO')
  await loginAs(page, 'admin')
  await goto(page, '/dashboard')
  await expect(card(page, 'Ventas del Día')).toContainText('100.000')
  await expect(card(page, 'Efectivo Cobrado')).toContainText(/\$\s*0/)
  await expect(appMain(page)).toContainText('No es dinero nuevo recibido hoy')
  await expect(appMain(page).getByTestId('medio-NEQUI')).toHaveCount(0)
})
test('fallo de actualización y desconexión conservan cifras y hora de lectura, luego permiten reintentar', async ({
  page,
  context,
}) => {
  await normal()
  await loginAs(page, 'admin')
  await goto(page, '/dashboard')
  const momento = await appMain(page).locator('time').getAttribute('datetime')
  await page.route('**/api/dashboard', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ success: false }),
    }),
  )
  await appMain(page)
    .getByRole('button', { name: 'Actualizar dashboard', exact: true })
    .click()
  await expect(appMain(page).getByRole('alert')).toContainText('Conservamos')
  await expect(card(page, 'Efectivo Cobrado')).toContainText('60.000')
  expect(await appMain(page).locator('time').getAttribute('datetime')).toBe(
    momento,
  )
  await context.setOffline(true)
  await expect(appMain(page)).toContainText('Sin conexión')
  await expect(
    appMain(page).getByRole('button', {
      name: 'Actualizar dashboard',
      exact: true,
    }),
  ).toBeDisabled()
  await expect(card(page, 'Efectivo Cobrado')).toContainText('60.000')
  await context.setOffline(false)
  await page.unroute('**/api/dashboard')
  await appMain(page)
    .getByRole('button', { name: 'Actualizar dashboard', exact: true })
    .click()
  await expect(appMain(page).getByRole('alert')).toHaveCount(0)
  await expect(card(page, 'Efectivo Cobrado')).toContainText('60.000')
})
test('un abono ambiguo mantiene subtotal, avisa conciliación y no duplica un pago del mismo importe', async ({
  page,
}) => {
  const { p, cliente, factura } = await pedido({ pagado: 10000 })
  await pago(p.id, 10000)
  await db.abono.create({
    data: {
      numero: `A526-${randomUUID().slice(0, 6)}`,
      pedidoId: p.id,
      facturaId: factura.id,
      clienteId: cliente.id,
      monto: 10000,
      metodoPago: 'EFECTIVO',
    },
  })
  await loginAs(page, 'admin')
  await goto(page, '/dashboard')
  await expect(card(page, 'Efectivo Cobrado')).toContainText('Por conciliar')
  await expect(card(page, 'Efectivo Cobrado')).toContainText(
    'Subtotal identificado',
  )
  await expect(card(page, 'Efectivo Cobrado')).toContainText('10.000')
  await appMain(page)
    .getByRole('button', { name: 'Ver diferencia', exact: true })
    .click()
  await expect(page.getByTestId('dashboard-cobros-detalle')).toContainText(
    'Evidencia de origen incompleta',
  )
})

test('editar base actualiza una lectura completa; un valor local sin confirmar no sustituye al servidor', async ({
  page,
}) => {
  await normal()
  await loginAs(page, 'admin')
  await goto(page, '/dashboard')
  const base = () =>
    appMain(page).getByText('Base del día', { exact: true }).locator('..')
  await expect(base()).toContainText('50.000')
  async function evento(valor: string) {
    const respuesta = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/dashboard') && r.request().method() === 'GET',
    )
    await page.evaluate(
      ({ valor, dia }) => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: `baseDia_${dia}`,
            newValue: valor,
          }),
        )
      },
      { valor, dia: hoy() },
    )
    expect((await respuesta).status()).toBe(200)
  }
  await evento('999999')
  await expect(base()).toContainText('50.000')
  await expect(base()).not.toContainText('999.999')
  await db.config.update({
    where: { clave: `BASE_DIA_${hoy()}` },
    data: { valor: '70000' },
  })
  await evento('70000')
  await expect(base()).toContainText('70.000')
})

test('el permiso de dashboard no concede datos individuales de Pedidos y una sesión ausente no recibe cifras', async ({
  page,
  context,
}) => {
  test.setTimeout(90000)
  const { viejo } = await normal()
  await page.addInitScript(() =>
    localStorage.setItem('pwa-install-banner-dismissed', 'true'),
  )
  await page.goto('/login')
  await page.locator('#login-username').fill('sellador')
  await page.locator('#login-password').fill('sell123')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await expect(
    appMain(page).getByRole('heading', { name: 'Dashboard', exact: true }),
  ).toBeVisible()
  const r = await page.request.get('/api/dashboard')
  expect(r.status()).toBe(200)
  const data = await r.json()
  expect(data.dashboard.cobros.movimientos).toEqual([])
  expect(JSON.stringify(data.dashboard.cobros)).not.toContain(viejo.p.id)
  expect(await page.content()).not.toContain(viejo.p.id)
  await appMain(page)
    .getByRole('button', { name: 'Ver cobros', exact: true })
    .click()
  await expect(page.getByTestId('dashboard-cobros-detalle')).toContainText(
    'requiere acceso a Pedidos',
  )
  await expect(
    page
      .getByTestId('dashboard-cobros-detalle')
      .getByRole('link', { name: /Ver pedido/ }),
  ).toHaveCount(0)
  await context.clearCookies()
  const anonimo = await page.request.get('/api/dashboard')
  expect(anonimo.status()).toBe(401)
  expect(await anonimo.text()).not.toContain('subtotalRegistrado')
})

test('#524: cobrar con sobrante conserva la alerta de crédito sin fabricar el ingreso que falta', async ({
  page,
}) => {
  test.setTimeout(90000)
  const { cliente, p } = await pedido({ cantidad: 1, precio: 10000 })
  await loginAs(page, 'admin')
  const respuesta = await apiPost(page, '/api/pedidos/pagar-fiado', {
    clienteId: cliente.id,
    monto: 14000,
    metodo: 'EFECTIVO',
    offlineId: randomUUID(),
  })
  expect(respuesta.status()).toBe(200)
  await goto(page, '/dashboard')
  await expect(card(page, 'Efectivo Cobrado')).toContainText('Por conciliar')
  await expect(card(page, 'Efectivo Cobrado')).toContainText('10.000')
  await appMain(page)
    .getByRole('button', { name: 'Ver diferencia', exact: true })
    .click()
  await expect(page.getByTestId('dashboard-cobros-detalle')).toContainText(
    'Sobrante a saldo a favor sin registro canónico de ingreso (#524)',
  )
  await expect(page.getByTestId('dashboard-cobros-detalle')).toContainText(
    '4.000',
  )
  expect(
    Number(
      (await db.cliente.findUniqueOrThrow({ where: { id: cliente.id } }))
        .saldoFavor,
    ),
  ).toBe(4000)
  expect(
    Number(
      (
        await db.pago.aggregate({
          where: { pedidoId: p.id },
          _sum: { monto: true },
        })
      )._sum.monto,
    ),
  ).toBe(10000)
})
