// @tests #472 — TEMPORAL-SIN-EMBARQUE: el ADMIN registra la entrega de un pedido sin
// embarque, desde la ficha del pedido, con un navegador real. Cada prueba mira la
// BASE DE DATOS (no solo la pantalla): el incidente P0 de ventas anónimas mostró
// que una prueba de venta que no mira la base pasa con el bug activo.
import { test, expect, apiPost, createCliente, BASE, sharedLoginAs, appMain, resetTestDatabase } from './fixtures'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const CLAVE = 'GESTION_ADMIN_SIN_EMBARQUE'

type PaginaAdmin = Parameters<typeof createCliente>[0]

// El interruptor es global (Config): las pruebas de este archivo van en serie.
test.describe.configure({ mode: 'serial' })

async function interruptor(page: PaginaAdmin, valor: 'true' | 'false') {
  // Por la API de Config (la misma que usaría el administrador): también invalida el caché de 60 s.
  const res = await apiPost(page, '/api/config', { clave: CLAVE, valor })
  expect(res.ok()).toBeTruthy()
}

async function crearPedidoPendiente(page: PaginaAdmin, nombre: string) {
  const telefono = `3${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`
  const { cliente } = await createCliente(page, { nombre, telefono })
  const res = await apiPost(page, '/api/pedidos', {
    clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
    offlineId: `ge-${Date.now()}-${Math.random()}`,
  })
  const body = await res.json()
  const p = body.data?.pedido ?? body.pedido
  const fila = await prisma.pedido.findUniqueOrThrow({ where: { id: p.id as string } })
  return { id: p.id as string, numero: p.numero as number, total: Number(fila.total) }
}

test.describe('Gestión temporal sin embarque (#472)', () => {
  test.beforeAll(() => { resetTestDatabase() })
  test.afterAll(async () => { await prisma.$disconnect() })

  test('con el interruptor APAGADO la ficha no ofrece «Registrar entrega» (todo como antes)', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await interruptor(page, 'false')
    const ped = await crearPedidoPendiente(page, `GE apagado ${Date.now()}`)
    await page.goto(`${BASE}/pedidos?openPedido=${ped.id}`)
    const acciones = appMain(page).getByTestId('detalle-acciones')
    await expect(acciones.getByRole('button', { name: /Enviar/ })).toBeVisible({ timeout: 20000 })
    await expect(acciones.getByRole('button', { name: /Editar/ })).toBeVisible()
    await expect(acciones.getByRole('button', { name: 'Registrar entrega' })).toHaveCount(0)
  })

  test('ENCENDIDO: el ADMIN registra la entrega con cobro y la base de datos queda coherente', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await interruptor(page, 'true')
    const repartidor = await prisma.trabajador.create({ data: { nombre: `Andrés E2E ${Date.now()}`, rol: 'REPARTIDOR', usaMoto: true } })
    const ped = await crearPedidoPendiente(page, `GE entrega ${Date.now()}`)

    await page.goto(`${BASE}/pedidos?openPedido=${ped.id}`)
    const acciones = appMain(page).getByTestId('detalle-acciones')
    await expect(acciones.getByRole('button', { name: 'Registrar entrega' })).toBeVisible({ timeout: 20000 })
    // «Enviar» sigue disponible: no se quita ninguna capacidad existente.
    await expect(acciones.getByRole('button', { name: /Enviar/ })).toBeVisible()
    await acciones.getByRole('button', { name: 'Registrar entrega' }).click()

    const dialogo = page.getByTestId('registrar-entrega')
    await expect(dialogo).toBeVisible()
    await dialogo.getByTestId('alcance-todo').check()
    await dialogo.getByLabel(/¿Quién lo entregó/).selectOption({ label: repartidor.nombre })
    await dialogo.getByLabel('¿Cuánto dinero se recibió?').fill(String(ped.total))

    // Sin elegir quién recibió el dinero NO se puede continuar.
    await dialogo.getByTestId('re-revisar').click()
    await expect(dialogo.getByText('Indica quién recibió el dinero.')).toBeVisible()
    await expect(dialogo.getByTestId('re-resumen')).toHaveCount(0)

    await dialogo.getByTestId('recibio-repartidor').check()
    await dialogo.getByTestId('re-revisar').click()
    const resumen = dialogo.getByTestId('re-resumen')
    await expect(resumen).toContainText('ENTREGADO')
    await expect(resumen).toContainText(repartidor.nombre)
    await expect(resumen).toContainText('El pedido queda pagado completo.')
    await page.screenshot({ path: 'test-results/gestion-admin-revisar.png' })

    await dialogo.getByTestId('re-guardar').click()
    await expect(page.getByText(new RegExp(`Entrega del pedido #${ped.numero} registrada`))).toBeVisible({ timeout: 20000 })

    const p = await prisma.pedido.findUniqueOrThrow({ where: { id: ped.id }, include: { factura: true, items: true } })
    expect(p.estadoEntrega).toBe('ENTREGADO')
    expect(p.estadoPago).toBe('PAGADO')
    expect(Number(p.saldo)).toBe(0)
    expect(p.entregadoPorId).toBe(repartidor.id)
    expect(p.embarqueId).toBeNull()
    expect(p.items[0].cantEntrega).toBe(2)
    expect(p.factura?.estado).toBe('PAGADA')
    const pagos = await prisma.pago.findMany({ where: { pedidoId: ped.id } })
    expect(pagos).toHaveLength(1)
    expect(pagos[0].recibidoPorId).toBe(repartidor.id)
    expect(pagos[0].embarqueId).toBeNull()
    expect(Number(pagos[0].monto)).toBe(ped.total)

    // La ficha muestra quién entregó.
    await page.goto(`${BASE}/pedidos?openPedido=${ped.id}`)
    await expect(appMain(page).getByTestId('detalle-repartidor')).toContainText(repartidor.nombre, { timeout: 20000 })
  })

  test('ENCENDIDO: un fiado sin promesa de pago no se puede guardar y no deja nada a medias', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await interruptor(page, 'true')
    const repartidor = await prisma.trabajador.create({ data: { nombre: `Camilo E2E ${Date.now()}`, rol: 'REPARTIDOR', usaMoto: true } })
    const ped = await crearPedidoPendiente(page, `GE fiado ${Date.now()}`)

    await page.goto(`${BASE}/pedidos?openPedido=${ped.id}`)
    await appMain(page).getByTestId('detalle-acciones').getByRole('button', { name: 'Registrar entrega' }).click({ timeout: 20000 })
    const dialogo = page.getByTestId('registrar-entrega')
    await dialogo.getByTestId('alcance-todo').check()
    await dialogo.getByLabel(/¿Quién lo entregó/).selectOption({ label: repartidor.nombre })
    await expect(dialogo.getByText(/Quedan debiendo/)).toBeVisible()
    await dialogo.getByTestId('re-revisar').click()
    await expect(dialogo.getByText('Si queda debiendo, necesitamos hasta cuándo promete pagar.')).toBeVisible()

    const p = await prisma.pedido.findUniqueOrThrow({ where: { id: ped.id } })
    expect(p.estadoEntrega).toBe('PENDIENTE')
    expect(p.entregadoPorId).toBeNull()
    expect(await prisma.pago.count({ where: { pedidoId: ped.id } })).toBe(0)
  })

  test('ENCENDIDO pero no es ADMIN (ASISTENTE): no ve la acción ni la API responde', async ({ browser }) => {
    const admin = await sharedLoginAs(browser, 'admin')
    await interruptor(admin, 'true')
    const ped = await crearPedidoPendiente(admin, `GE asistente ${Date.now()}`)
    const page = await sharedLoginAs(browser, 'asistente')
    await page.goto(`${BASE}/pedidos?openPedido=${ped.id}`)
    const acciones = appMain(page).getByTestId('detalle-acciones')
    await expect(acciones.getByRole('button', { name: /Enviar/ })).toBeVisible({ timeout: 20000 })
    await expect(acciones.getByRole('button', { name: 'Registrar entrega' })).toHaveCount(0)
    const res = await page.request.post(`${BASE}/api/pedidos/${ped.id}/gestion-admin/entrega`, {
      data: { offlineId: `ge-asis-${Date.now()}`, itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 2 }] },
    })
    expect(res.status()).toBe(403)
    expect((await prisma.pedido.findUniqueOrThrow({ where: { id: ped.id } })).estadoEntrega).toBe('PENDIENTE')
    await interruptor(admin, 'false') // deja el interruptor como se encontró
  })
})
