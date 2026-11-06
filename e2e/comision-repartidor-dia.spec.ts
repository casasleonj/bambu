// @tests #499 — comisión del repartidor por día: se ve en el cierre de caja, se paga con un toque
// confirmado y queda en la base de datos. Cada prueba mira la BASE (no solo la pantalla).
import { test, expect, apiPost, createCliente, sharedLoginAs, goto, resetTestDatabase } from './fixtures'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const TARIFA = 400

type PaginaAdmin = Parameters<typeof createCliente>[0]

test.describe.configure({ mode: 'serial' })

async function repartidorConEntrega(page: PaginaAdmin, nombre: string, pacas: number) {
  const repartidor = await prisma.trabajador.create({
    data: { nombre, rol: 'REPARTIDOR', usaMoto: true, tipoPago: 'COMISION', comRepartAgua: TARIFA, comRepartHielo: TARIFA },
  })
  const telefono = `3${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`
  const { cliente } = await createCliente(page, { nombre: `Cliente ${nombre}`, telefono })
  const res = await apiPost(page, '/api/pedidos', {
    clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad: pacas }],
    offlineId: `cd-${Date.now()}-${Math.random()}`,
  })
  const body = await res.json()
  const pedido = body.data?.pedido ?? body.pedido
  await prisma.pedido.update({
    where: { id: pedido.id as string },
    data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', cPacaAguaEnt: pacas, entregadoAt: new Date(), entregadoPorId: repartidor.id },
  })
  return repartidor
}

test.describe('Comisión del repartidor en el cierre (#499)', () => {
  test.beforeAll(() => { resetTestDatabase() })
  test.afterAll(async () => { await prisma.$disconnect() })

  test('el ADMIN ve la comisión del día, la paga con un toque confirmado y la base lo registra', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const r = await repartidorConEntrega(page, `Pago E2E ${Date.now()}`, 2)

    await goto(page, '/cierre')
    const fila = page.getByTestId(`comision-${r.id}`)
    await expect(fila).toBeVisible({ timeout: 30000 })
    await expect(fila.getByTestId('comision-pendiente')).toContainText('800')
    await fila.getByText('Ver entregas y cálculo').click()
    await expect(fila).toContainText('2 unidades ×')
    const fuente = fila.getByRole('link', { name: /Ver pedido sin embarque/ })
    await expect(fuente).toHaveAttribute('href', /\/pedidos\/[^/]+$/)
    const enlace = await fuente.getAttribute('href')
    const detalle = await page.request.get(enlace!)
    expect(detalle.status()).toBe(200)
    const ancho = await page.evaluate(() => ({ ventana: innerWidth, contenido: document.documentElement.scrollWidth }))
    expect(ancho.contenido).toBeLessThanOrEqual(ancho.ventana + 1)
    await fila.screenshot({ path: test.info().outputPath('comision-detalle.png') })

    // Cancelar no paga nada.
    await fila.getByTestId(`pagar-comision-${r.id}`).click()
    await page.getByRole('button', { name: /cancelar/i }).click()
    expect(await prisma.pagoComisionRepartidor.count({ where: { trabajadorId: r.id } })).toBe(0)

    // Confirmar paga lo pendiente (el monto lo pone el servidor).
    await fila.getByTestId(`pagar-comision-${r.id}`).click()
    await page.getByRole('button', { name: 'Sí, ya le pagué' }).click()
    await expect(fila.getByTestId('comision-pagado')).toContainText('800', { timeout: 20000 })
    await expect(fila.getByTestId('comision-pendiente')).toHaveCount(0)
    await expect(fila.getByTestId(`pagar-comision-${r.id}`)).toHaveCount(0)

    const pagos = await prisma.pagoComisionRepartidor.findMany({ where: { trabajadorId: r.id } })
    expect(pagos).toHaveLength(1)
    expect(Number(pagos[0].monto)).toBe(2 * TARIFA)

    // La caja del cierre resta lo pagado, sin que nadie teclee nada.
    await expect(page.getByTestId('cierre-efectivo-esperado')).toContainText('800')
    await page.reload()
    await expect(page.getByTestId(`comision-${r.id}`).getByTestId('comision-pagado')).toContainText('800', { timeout: 30000 })
  })

  test('el CONTADOR también ve y puede pagar; la ASISTENTE recibe 403 por la API y no se registra nada', async ({ browser }) => {
    const admin = await sharedLoginAs(browser, 'admin')
    const r = await repartidorConEntrega(admin, `Roles E2E ${Date.now()}`, 1)

    const contador = await sharedLoginAs(browser, 'contador')
    await goto(contador, '/cierre')
    const fila = contador.getByTestId(`comision-${r.id}`)
    await expect(fila).toBeVisible({ timeout: 30000 })
    await expect(fila.getByTestId('comision-pendiente')).toContainText('400')
    await expect(fila.getByTestId(`pagar-comision-${r.id}`)).toBeVisible()

    // La ASISTENTE no paga comisiones: la API lo rechaza (el servidor decide, no la pantalla).
    const asistente = await sharedLoginAs(browser, 'asistente')
    const res = await apiPost(asistente, '/api/nomina/dia/pagar', {
      trabajadorId: r.id, fecha: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }), offlineId: `a-${Date.now()}-xxxx`,
    })
    expect(res.status()).toBe(403)
    expect(await prisma.pagoComisionRepartidor.count({ where: { trabajadorId: r.id } })).toBe(0)
  })

  test('#669: muestra 206 con una entrega parcial, abre el pedido y paga solo las 3 unidades nuevas', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await prisma.config.upsert({ where: { clave: 'GESTION_ADMIN_SIN_EMBARQUE' },
      create: { clave: 'GESTION_ADMIN_SIN_EMBARQUE', valor: 'true' }, update: { valor: 'true' } })
    const r = await repartidorConEntrega(page, `Parciales E2E ${Date.now()}`, 203)
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const previo = await apiPost(page, '/api/nomina/dia/pagar', { trabajadorId: r.id, fecha,
      offlineId: `cp669-previo-${Date.now()}`, montoEsperado: 203 * TARIFA })
    expect(previo.status()).toBe(201)

    const { cliente } = await createCliente(page, { nombre: 'Cliente parcial sintético', telefono: `3${String(Date.now()).slice(-9)}` })
    const creado = await apiPost(page, '/api/pedidos', { clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }], offlineId: `cp669-pedido-${Date.now()}` })
    expect(creado.ok()).toBe(true)
    const cuerpo = await creado.json()
    const p = cuerpo.data?.pedido ?? cuerpo.pedido
    const entregado = await apiPost(page, `/api/pedidos/${p.id}/gestion-admin/entrega`, {
      repartidorId: r.id, itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 3 }],
      promesaPagoFecha: new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
      offlineId: `cp669-entrega-${Date.now()}`,
    })
    expect(entregado.status()).toBe(200)
    expect((await prisma.pedido.findUniqueOrThrow({ where: { id: p.id } })).estadoEntrega).toBe('PENDIENTE')

    await goto(page, '/cierre')
    const fila = page.getByTestId(`comision-${r.id}`)
    await expect(fila.getByTestId('comision-pagado')).toContainText('81.200')
    await expect(fila.getByTestId('comision-pendiente')).toContainText('1.200')
    await fila.getByText('Ver entregas y cálculo').click()
    await expect(fila).toContainText('206 unidades ×')
    const enlace = fila.getByRole('link').filter({ hasText: `#${p.numero}` })
    await expect(enlace).toHaveAttribute('href', `/pedidos/${p.id}`)
    await expect(enlace).toContainText('Agua 3')
    await enlace.click()
    await expect(page).toHaveURL(new RegExp(`/pedidos/${p.id}$`))
    await page.goBack()
    await expect(fila.getByTestId('comision-pendiente')).toContainText('1.200')

    await fila.getByTestId(`pagar-comision-${r.id}`).click()
    await page.getByRole('button', { name: 'Sí, ya le pagué' }).click()
    await expect(fila.getByTestId('comision-pagado')).toContainText('82.400')
    await expect(fila.getByTestId('comision-pendiente')).toHaveCount(0)
    const pagos = await prisma.pagoComisionRepartidor.findMany({ where: { trabajadorId: r.id } })
    expect(pagos).toHaveLength(2)
    expect(pagos.reduce((s, p) => s + Number(p.monto), 0)).toBe(206 * TARIFA)
  })
  test('las entregas por conciliar se explican, enlazan al embarque y no permiten pagar', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const r = await repartidorConEntrega(page, `Conciliación E2E ${Date.now()}`, 1)
    const e = await prisma.embarque.create({ data: { trabajadorId: r.id, fecha: new Date(), estado: 'CERRADO' } })
    await prisma.embarqueMovimiento.createMany({ data: [
      { embarqueId: e.id, tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 1, metadata: { captura: 'CIERRE' } },
      { embarqueId: e.id, tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 1 },
    ] })
    await goto(page, '/cierre')
    const fila = page.getByTestId(`comision-${r.id}`)
    await expect(fila).toContainText('Por conciliar')
    await expect(fila.getByTestId(`pagar-comision-${r.id}`)).toHaveCount(0)
    await fila.getByText('Ver entregas y cálculo').click()
    await expect(fila).toContainText('sin identidad verificable')
    await expect(fila.getByRole('link', { name: 'Revisar embarque' })).toHaveAttribute('href', `/embarques/${e.id}`)
    const res = await apiPost(page, '/api/nomina/dia/pagar', { trabajadorId: r.id, fecha: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }), offlineId: `no-pagar-${Date.now()}` })
    expect(res.status()).toBe(409)
    expect(await prisma.pagoComisionRepartidor.count({ where: { trabajadorId: r.id } })).toBe(0)
    await fila.screenshot({ path: test.info().outputPath('comision-conciliacion.png') })
  })

})
