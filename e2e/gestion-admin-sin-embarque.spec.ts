// @tests #472 — TEMPORAL-SIN-EMBARQUE: el ADMIN registra la entrega de un pedido sin
// embarque, desde la ficha del pedido, con un navegador real. Cada prueba mira la
// BASE DE DATOS (no solo la pantalla): el incidente P0 de ventas anónimas mostró
// que una prueba de venta que no mira la base pasa con el bug activo.
import { test, expect, apiPost, createCliente, BASE, sharedLoginAs, appMain, resetTestDatabase, responsiveContainer } from './fixtures'
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
  return { id: p.id as string, numero: p.numero as number, total: Number(fila.total), clienteId: fila.clienteId }
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
    await dialogo.getByLabel('Monto recibido').fill(String(ped.total))

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

  test('#498 ENCENDIDO: cobro con dos medios (efectivo + transferencia): un pago por medio en la base', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await interruptor(page, 'true')
    const repartidor = await prisma.trabajador.create({ data: { nombre: `Mixto E2E ${Date.now()}`, rol: 'REPARTIDOR', usaMoto: true } })
    const ped = await crearPedidoPendiente(page, `GE mixto ${Date.now()}`)
    const efectivo = 1000
    const transferencia = ped.total - efectivo

    await page.goto(`${BASE}/pedidos?openPedido=${ped.id}`)
    await appMain(page).getByTestId('detalle-acciones').getByRole('button', { name: 'Registrar entrega' }).click({ timeout: 20000 })
    const dialogo = page.getByTestId('registrar-entrega')
    await expect(dialogo).toBeVisible()
    await dialogo.getByTestId('alcance-todo').check()
    await dialogo.getByLabel(/¿Quién lo entregó/).selectOption({ label: repartidor.nombre })

    await dialogo.locator('#re-monto-0').fill(String(efectivo))
    await dialogo.getByTestId('re-agregar-medio').click()
    await dialogo.locator('#re-monto-1').fill(String(transferencia))
    await expect(dialogo.getByTestId('re-linea-1')).toBeVisible()
    await expect(dialogo.locator('#re-metodo-1')).toHaveValue('TRANSFERENCIA')
    await expect(dialogo.getByTestId('re-recibido')).toContainText('pagado completo')
    await dialogo.getByTestId('recibio-oficina').check()

    await dialogo.getByTestId('re-revisar').click()
    await expect(dialogo.getByTestId('re-resumen')).toContainText('en efectivo y')
    await expect(dialogo.getByTestId('re-resumen')).toContainText('por transferencia')
    await dialogo.getByTestId('re-guardar').click()
    await expect(page.getByText(new RegExp(`Entrega del pedido #${ped.numero} registrada`))).toBeVisible({ timeout: 20000 })

    const p = await prisma.pedido.findUniqueOrThrow({ where: { id: ped.id } })
    expect(p.estadoEntrega).toBe('ENTREGADO')
    expect(p.estadoPago).toBe('PAGADO')
    expect(Number(p.saldo)).toBe(0)
    const pagos = await prisma.pago.findMany({ where: { pedidoId: ped.id } })
    expect(pagos).toHaveLength(2)
    expect(Number(pagos.find((x) => x.metodo === 'EFECTIVO')!.monto)).toBe(efectivo)
    expect(Number(pagos.find((x) => x.metodo === 'TRANSFERENCIA')!.monto)).toBe(transferencia)
    expect(pagos.every((x) => x.recibidoPorId === null)).toBe(true) // se pagó en la oficina
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

  test('ENCENDIDO: cobrar un fiado pide quién recibió el dinero y lo deja guardado en el pago', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await interruptor(page, 'true')
    const repartidor = await prisma.trabajador.create({ data: { nombre: `Dario E2E ${Date.now()}`, rol: 'REPARTIDOR', usaMoto: true } })
    const ped = await crearPedidoPendiente(page, `GE cobro ${Date.now()}`)
    // Se entrega y queda debiendo (fiado) por la ruta de oficina.
    const promesa = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const entrega = await apiPost(page, `/api/pedidos/${ped.id}/gestion-admin/entrega`, {
      offlineId: `ge-fiado-${Date.now()}-${Math.random()}`,
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      repartidorId: repartidor.id,
      promesaPagoFecha: promesa,
    })
    expect(entrega.ok()).toBeTruthy()

    await page.goto(`${BASE}/pedidos?tab=fiados&fiadosCliente=${encodeURIComponent(ped.clienteId)}`)
    const fiados = responsiveContainer(page, 'fiados-mobile', 'fiados-desktop')
    const fila = fiados.getByText(/GE cobro/).first()
    await expect(fila).toBeVisible({ timeout: 20000 })
    await fiados.getByRole('button', { name: 'Registrar pago', exact: true }).last().click()
    const cobro = page.getByTestId('cobro-fiado-dialog')
    await cobro.getByLabel('Medio 1', { exact: true }).selectOption('EFECTIVO')
    await cobro.getByLabel('Monto 1', { exact: true }).fill(String(ped.total))

    // Sin decir quién recibió NO se cobra.
    await cobro.getByRole('button', { name: 'Revisar reparto', exact: true }).click()
    await expect(cobro.getByText('Indica quién recibió el dinero.')).toBeVisible()
    expect(await prisma.pago.count({ where: { pedidoId: ped.id } })).toBe(0)

    await cobro.getByTestId('cobro-recibio-repartidor').check()
    await cobro.getByLabel(/¿Qué repartidor\?/).selectOption({ label: repartidor.nombre })
    await cobro.getByRole('button', { name: 'Revisar reparto', exact: true }).click()
    await cobro.getByRole('button', { name: /^Registrar \$/ }).click()
    await expect(cobro.getByRole('heading', { name: 'Pago registrado', exact: true })).toBeVisible({ timeout: 20000 })

    const pagos = await prisma.pago.findMany({ where: { pedidoId: ped.id } })
    expect(pagos).toHaveLength(1)
    expect(pagos[0].recibidoPorId).toBe(repartidor.id)
    expect(Number(pagos[0].monto)).toBe(ped.total)
    const p = await prisma.pedido.findUniqueOrThrow({ where: { id: ped.id } })
    expect(p.estadoPago).toBe('PAGADO')
    expect(Number(p.saldo)).toBe(0)
  })

  test('ENCENDIDO: el ADMIN corrige el canal de un pedido abierto y queda registrado con su motivo', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await interruptor(page, 'true')
    const ped = await crearPedidoPendiente(page, `GE canal ${Date.now()}`) // nace como DOMICILIO
    expect((await prisma.pedido.findUniqueOrThrow({ where: { id: ped.id } })).canal).toBe('DOMICILIO')

    await page.goto(`${BASE}/pedidos?openPedido=${ped.id}`)
    const acciones = appMain(page).getByTestId('detalle-acciones')
    await expect(acciones.getByRole('button', { name: 'Corregir canal' })).toBeVisible({ timeout: 20000 })
    await acciones.getByRole('button', { name: 'Corregir canal' }).click()

    const dialogo = page.getByTestId('corregir-canal')
    await expect(dialogo.getByTestId('cc-canales')).toContainText('Hoy es de Domicilio. Pasará a Punto de venta.')
    // Sin motivo NO se puede continuar.
    await dialogo.getByTestId('cc-revisar').click()
    await expect(dialogo.getByText(/Escribe el motivo de la corrección/)).toBeVisible()
    expect((await prisma.pedido.findUniqueOrThrow({ where: { id: ped.id } })).canal).toBe('DOMICILIO')

    await dialogo.getByLabel(/Motivo/).fill('Se registró como domicilio por error')
    await dialogo.getByTestId('cc-revisar').click()
    const resumen = dialogo.getByTestId('cc-resumen')
    await expect(resumen).toContainText('pasa de Domicilio a Punto de venta')
    await expect(resumen).toContainText('Los precios no cambian')
    // La vista previa no escribe nada.
    expect((await prisma.pedido.findUniqueOrThrow({ where: { id: ped.id } })).canal).toBe('DOMICILIO')

    await dialogo.getByTestId('cc-guardar').click()
    await expect(page.getByText(new RegExp(`Pedido #${ped.numero} corregido a punto de venta`))).toBeVisible({ timeout: 20000 })

    const p = await prisma.pedido.findUniqueOrThrow({ where: { id: ped.id } })
    expect(p.canal).toBe('PUNTO')
    expect(Number(p.total)).toBe(ped.total)
    expect(p.estadoEntrega).toBe('PENDIENTE')
    const auditorias = await prisma.historial.findMany({ where: { entidad: 'Pedido', registroId: ped.id, datos: { contains: '"correccionCanal":true' } } })
    expect(auditorias).toHaveLength(1)
    expect(JSON.parse(auditorias[0].datos).motivo).toBe('Se registró como domicilio por error')
  })

  test('el ADMIN enciende y apaga el interruptor desde Configuración (apagar pide confirmación) y el CONTADOR no puede', async ({ browser }) => {
    const admin = await sharedLoginAs(browser, 'admin')
    await interruptor(admin, 'true')
    const valorEnBase = async () => (await prisma.config.findUnique({ where: { clave: CLAVE } }))?.valor

    await admin.goto(`${BASE}/configuracion`)
    const tarjeta = admin.getByTestId('gestion-sin-embarques')
    await expect(tarjeta).toBeVisible({ timeout: 20000 })
    await expect(tarjeta.getByTestId('gse-estado')).toHaveText('Encendido')

    // Apagar pide confirmación y no cambia nada hasta confirmar.
    await tarjeta.getByTestId('gse-interruptor').click()
    const confirmar = admin.getByTestId('gse-confirmar')
    await expect(confirmar).toBeVisible()
    await expect(confirmar).toContainText('Se conserva todo lo ya registrado')
    expect(await valorEnBase()).toBe('true')
    await confirmar.getByText('Cancelar').click()
    await expect(confirmar).toHaveCount(0)
    expect(await valorEnBase()).toBe('true')

    await tarjeta.getByTestId('gse-interruptor').click()
    await admin.getByTestId('gse-confirmar-apagar').click()
    await expect(tarjeta.getByTestId('gse-estado')).toHaveText('Apagado', { timeout: 20000 })
    expect(await valorEnBase()).toBe('false')

    // Con la función apagada la ficha de un pedido no ofrece las acciones temporales.
    const ped = await crearPedidoPendiente(admin, `GE interruptor ${Date.now()}`)
    await admin.goto(`${BASE}/pedidos?openPedido=${ped.id}`)
    const acciones = appMain(admin).getByTestId('detalle-acciones')
    await expect(acciones.getByRole('button', { name: /Enviar/ })).toBeVisible({ timeout: 20000 })
    await expect(acciones.getByRole('button', { name: 'Corregir canal' })).toHaveCount(0)

    // Encender no pide confirmación.
    await admin.goto(`${BASE}/configuracion`)
    await admin.getByTestId('gestion-sin-embarques').getByTestId('gse-interruptor').click()
    await expect(admin.getByTestId('gestion-sin-embarques').getByTestId('gse-estado')).toHaveText('Encendido', { timeout: 20000 })
    expect(await valorEnBase()).toBe('true')
    await expect(admin.getByTestId('gse-confirmar')).toHaveCount(0)

    // Un CONTADOR no ve la tarjeta ni puede cambiarlo por la API.
    const contador = await sharedLoginAs(browser, 'contador')
    await contador.goto(`${BASE}/configuracion`)
    await expect(contador.getByTestId('gestion-sin-embarques')).toHaveCount(0)
    const res = await apiPost(contador, '/api/config', { clave: CLAVE, valor: 'false' })
    expect(res.status()).toBe(403)
    expect(await valorEnBase()).toBe('true')
    await interruptor(admin, 'false') // deja el interruptor como se encontró
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
    await expect(acciones.getByRole('button', { name: 'Corregir canal' })).toHaveCount(0)
    const res = await page.request.post(`${BASE}/api/pedidos/${ped.id}/gestion-admin/entrega`, {
      data: { offlineId: `ge-asis-${Date.now()}`, itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 2 }] },
    })
    expect(res.status()).toBe(403)
    const canal = await page.request.post(`${BASE}/api/pedidos/${ped.id}/gestion-admin/canal`, {
      data: { offlineId: `ge-canal-${Date.now()}`, canal: 'PUNTO', motivo: 'Prueba de permisos' },
    })
    expect(canal.status()).toBe(403)
    expect((await prisma.pedido.findUniqueOrThrow({ where: { id: ped.id } })).canal).toBe('DOMICILIO')
    expect((await prisma.pedido.findUniqueOrThrow({ where: { id: ped.id } })).estadoEntrega).toBe('PENDIENTE')
    await interruptor(admin, 'false') // deja el interruptor como se encontró
  })
})
