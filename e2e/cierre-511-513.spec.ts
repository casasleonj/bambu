// @tests #511 #513 — pantalla → API → snapshot y columnas de PostgreSQL.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import type { Page, TestInfo } from '@playwright/test'
import { test, expect, goto, loginAs, resetTestDatabase } from './fixtures'

const prisma = new PrismaClient()
const fecha = '2001-01-07'
const instante = new Date(`${fecha}T12:00:00-05:00`)

async function capturar(page: Page, info: TestInfo, nombre: string) {
  await info.attach(nombre, { body: await page.screenshot({ fullPage: nombre !== 'confirmacion' }), contentType: 'image/png' })
}

test.describe('Cierre diario: identidad y recuperación #511/#513', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(() => { resetTestDatabase() })
  test.afterAll(async () => { await prisma.$disconnect() })
  test.afterEach(async ({}, info) => {
    console.info('CIERRE_511_513_E2E', JSON.stringify({ project: info.project.name, title: info.title, status: info.status, expectedStatus: info.expectedStatus }))
  })

  async function preparar(legado = false) {
    // #666: el efectivo inicial ya no se escribe en la sección 2; viene de la base de caja del día (Config BASE_DIA_<fecha>)
    await prisma.config.upsert({ where: { clave: `BASE_DIA_${fecha}` }, update: { valor: '10000' }, create: { clave: `BASE_DIA_${fecha}`, valor: '10000' } })
    const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente sintético cierre', telefono: randomUUID(), direccion: 'Prueba' } })
    const pedido = await prisma.pedido.create({ data: {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: instante,
      estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO', estadoPago: 'PARCIAL',
      entregadoAt: instante, cPacaAguaPed: 8, cPacaAguaEnt: 8,
      items: { create: { producto: 'PACA_AGUA', cantPedido: 8, cantEntrega: 8, precio: 2500, subtotal: 20000 } },
      total: 20000, totalPagado: 10000, saldo: 10000,
    } })
    const entrega = async (id: string, cantidad: number) => prisma.historial.create({ data: {
      entidad: 'Pedido', registroId: id, accion: 'UPDATE', usuarioId: 'sistema', fecha: instante,
      datos: JSON.stringify({ accion: 'ENTREGA', consultaEntrega: { version: 1, fecha: instante.toISOString(),
        eventoEntregaId: randomUUID(), precisionFecha: 'INSTANTE', repartidorId: null,
        cantidades: [{ producto: 'PACA_AGUA', cantidad }] } }),
    } })
    await entrega(pedido.id, 8)
    const factura = await prisma.factura.create({ data: {
      numero: `FAC-${randomUUID()}`, pedidoId: pedido.id, clienteId: cliente.id,
      subtotal: 20000, total: 20000, montoPagado: 10000, saldo: 10000, fecha: instante,
    } })
    const pago = await prisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: 5000, createdAt: instante } })
    const abono = { facturaId: factura.id, pedidoId: pedido.id, clienteId: cliente.id, monto: 5000, metodoPago: 'EFECTIVO', fecha: instante, createdAt: instante }
    await prisma.abono.create({ data: { ...abono, numero: 'AB-INDEPENDIENTE', origenCobro: legado ? null : 'INDEPENDIENTE' } })
    await prisma.abono.create({ data: { ...abono, numero: 'AB-ESPEJO', origenCobro: 'ESPEJO_PAGO', pagoOrigenId: pago.id } })
    const anulado = await prisma.pedido.create({ data: {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: instante,
      estado: 'ANULADO', estadoEntrega: 'ANULADO', estadoPago: 'ANULADO', total: 0, saldo: 0,
      entregadoAt: instante, cPacaAguaPed: 2, cPacaAguaEnt: 2,
      items: { create: { producto: 'PACA_AGUA', cantPedido: 2, cantEntrega: 2, precio: 2500, subtotal: 5000 } },
    } })
    await entrega(anulado.id, 2)
    await prisma.historial.create({ data: { entidad: 'Pedido', registroId: anulado.id, accion: 'UPDATE', usuarioId: 'sistema',
      fecha: new Date(+instante + 3600000), datos: JSON.stringify({ modo: 'ANULAR', notaCredito: true, reversion: 0 }),
    } })
    await prisma.notaCredito.create({ data: { numero: `NC-${randomUUID()}`, pedidoId: anulado.id, monto: 5000, motivo: 'Prueba sintética', fecha: instante } })
  }

  test('revisa, confirma una vez, conserva el resultado y permite imprimirlo', async ({ page }, testInfo) => {
    await preparar()
    await loginAs(page, 'admin')
    await goto(page, `/cierre?fecha=${fecha}`)
    await expect(page.getByTestId('cierre-kpi-ventas')).toContainText('20.000')
    await expect(page.getByTestId('cierre-ventas-por-conciliar')).toHaveCount(0)
    await expect(page.getByTestId('cierre-kpi-cobros')).toContainText('10.000')
    await expect(page.getByTestId('cierre-efectivo-esperado')).toContainText('Empezó con $ 10.000')
    await expect(page.getByLabel('Efectivo con el que empezó el día', { exact: true })).toHaveCount(0) // #666: un solo lugar
    // #644: el campo manual «Salarios» ya no existe
    await expect(page.getByLabel('Salarios', { exact: true })).toHaveCount(0)
    // #646: la respuesta es el efectivo que debe haber (10.000 + 5.000 de pago + 5.000 de abono); el «neto» ya no se muestra
    await expect(page.getByTestId('efectivo-debe-haber')).toContainText('20.000')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await capturar(page, testInfo, 'revision')

    await page.getByRole('button', { name: 'Contar Efectivo Físico' }).click()
    await page.getByRole('button', { name: 'Sumar 1 a $10.000', exact: true }).click()
    // #624: la moneda de $1.000 se cuenta y suma al total físico (10.000 + 3 × 1.000 = 13.000)
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Sumar 1 a $1.000', exact: true }).click()
    await expect(page.getByText(/^\$3[.,]000$/)).toBeVisible() // el separador depende del idioma del navegador
    await page.getByRole('button', { name: /Terminar conteo/ }).click()
    await page.getByRole('button', { name: 'Cerrar Día', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Confirmar cierre del día' })
    await expect(dialog.getByRole('button', { name: 'Confirmar cierre', exact: true })).toBeDisabled()
    // #601: se confirma el conteo del efectivo contra el efectivo que debe haber (base 10.000 + Pago 5.000
    // + abono 5.000 = 20.000); se contaron 13.000 (un billete de 10.000 y 3 monedas de 1.000), así que faltan 7.000.
    await expect(dialog.getByText(/Después de cerrar no podrás cambiar/)).toBeVisible()
    await expect(dialog.locator('dl > div').filter({ hasText: 'Efectivo que debe haber' })).toContainText('20.000')
    await expect(dialog.locator('dl > div').filter({ hasText: 'Efectivo contado' })).toContainText('13.000')
    await expect(dialog.locator('dl > div').filter({ hasText: 'Diferencia' })).toContainText(/Falta\s*\$\s*7\.000/)
    // El backdrop debe interceptar también la barra fija inferior, sin dejar
    // controles de la página por encima de una confirmación financiera.
    const cobertura = await page.evaluate(() => {
      const overlay = document.querySelector('[role="dialog"]')
      const hit = document.elementFromPoint(5, innerHeight - 5)
      return {
        intercepta: !!hit?.closest('[role="dialog"]'),
        hit: hit?.outerHTML.slice(0, 350),
        viewport: { width: innerWidth, height: innerHeight },
        overlay: overlay ? { clase: overlay.className, rect: overlay.getBoundingClientRect().toJSON(), z: getComputedStyle(overlay).zIndex } : null,
      }
    })
    expect(cobertura).toEqual(expect.objectContaining({ intercepta: true }))
    await capturar(page, testInfo, 'confirmacion')
    await dialog.getByRole('checkbox').check()
    const respuesta = page.waitForResponse(r => r.url().endsWith('/api/cierre') && r.request().method() === 'POST')
    await dialog.getByRole('button', { name: 'Confirmar cierre', exact: true }).click()
    expect((await respuesta).status()).toBe(201)
    await expect(page.getByRole('heading', { name: 'Día cerrado', exact: true })).toBeVisible()

    const guardado = await prisma.cierreDia.findUniqueOrThrow({ where: { fecha: new Date(`${fecha}T00:00:00-05:00`) } })
    expect(Number(guardado.totalVentas)).toBe(20000)
    expect(Number(guardado.netoCaja)).toBe(20000)
    expect(guardado.reporte).toMatchObject({ _version: '2.3', cobroVentasHoy: 5000, cobroCartera: 5000, salarios: 0, totalContado: 13000, netoCaja: 20000, efectivoEsperado: 20000, diferenciaArqueo: -7000, arqueo: { 10000: 1, 1000: 3 } })
    await page.reload()
    await expect(page.getByTestId('cierre-kpi-cobros')).toContainText('10.000')
    await capturar(page, testInfo, 'registrado')
    expect(await prisma.cierreDia.count()).toBe(1)
    await goto(page, `/cierre/reporte?fecha=${fecha}`)
    await expect(page.getByRole('button', { name: 'Imprimir / Guardar como PDF' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'Dinero cobrado hoy' })).toContainText('10.000')
  })

  test('#885: reversa sin evidencia permite caja provisional y regularización posterior', async ({ page }, testInfo) => {
    await preparar()
    const terminal = await prisma.pedido.findFirstOrThrow({ where: { estadoEntrega: 'ANULADO', fecha: instante } })
    await prisma.historial.deleteMany({ where: { registroId: terminal.id } })
    await loginAs(page, 'admin')
    await goto(page, `/cierre?fecha=${fecha}`)
    await expect(page.getByTestId('cierre-ventas-por-conciliar')).toBeVisible()
    await expect(page.getByTestId('cierre-kpi-ventas')).toContainText('Por conciliar')
    await expect(page.getByRole('button', { name: 'Cerrar caja provisional', exact: true })).toBeDisabled()
    await capturar(page, testInfo, 'ventas-por-conciliar')
    await goto(page, `/cierre/reporte?fecha=${fecha}`)
    await expect(page.getByText('Ventas por conciliar', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Imprimir / Guardar como PDF' })).toBeDisabled()
    expect(await prisma.cierreDia.count()).toBe(0)
    await goto(page,`/cierre?fecha=${fecha}`)
    await page.getByRole('button',{name:'Contar Efectivo Físico'}).click()
    await page.getByRole('button',{name:'Sumar 1 a $10.000',exact:true}).click()
    await page.getByRole('button',{name:/Terminar conteo/}).click()
    await page.getByRole('button',{name:'Cerrar caja provisional',exact:true}).click()
    const dialog=page.getByRole('dialog',{name:'Confirmar cierre del día'})
    await dialog.getByLabel('Revisé el efectivo y acepto que las ventas quedan provisionales.').check()
    await capturar(page,testInfo,'confirmacion-provisional')
    await dialog.getByRole('button',{name:'Confirmar cierre provisional',exact:true}).click()
    const panel=page.getByTestId('regularizacion-ventas')
    await expect(panel).toBeVisible()
    const original=await prisma.cierreDia.findUniqueOrThrow({where:{fecha:new Date(`${fecha}T00:00:00-05:00`)}})
    await expect(page.getByTestId('lista-ventas-provisionales')).toContainText(fecha)
    await goto(page,`/cierre/reporte?fecha=${fecha}`)
    await expect(page.getByText('CIERRE DE CAJA PROVISIONAL · VENTAS NO DEFINITIVAS',{exact:true})).toBeVisible()
    await expect(page.getByRole('button',{name:'Imprimir / Guardar como PDF'})).toBeEnabled()
    await goto(page,`/cierre?fecha=${fecha}`)
    await panel.getByText('Regularizar venta',{exact:true}).click()
    await panel.getByLabel('Ajuste pendiente de restar').fill('0')
    await panel.getByLabel('Referencia documental y explicación').fill('Reporte original confirma que no fue venta reconocida')
    await panel.getByLabel('Verifiqué la evidencia y el importe que faltaba ajustar.').check()
    await panel.getByRole('button',{name:'Registrar regularización'}).click()
    await expect(panel).toContainText('Ventas regularizadas')
    await expect(page.getByTestId('cierre-kpi-ventas')).toContainText('20.000')
    expect(await prisma.cierreDia.findUnique({where:{id:original.id}})).toEqual(original)
    await capturar(page,testInfo,'ventas-regularizadas')
  })

  test('#885: administrador concilia y retira una venta histórica sin alterar el cierre anterior', async ({ page }, testInfo) => {
    await preparar()
    const anterior = '2001-01-06'
    const terminal = await prisma.pedido.findFirstOrThrow({ where: { estadoEntrega: 'ANULADO', fecha: instante } })
    const diaAnterior = new Date(`${anterior}T12:00:00-05:00`)
    await prisma.pedido.update({ where: { id: terminal.id }, data: { fecha: diaAnterior, entregadoAt: diaAnterior } })
    const entrega = await prisma.historial.findFirstOrThrow({ where: { registroId: terminal.id, datos: { contains: 'consultaEntrega' } } })
    const datos = JSON.parse(entrega.datos)
    datos.consultaEntrega.fecha = diaAnterior.toISOString()
    await prisma.historial.update({ where: { id: entrega.id }, data: { fecha: diaAnterior, datos: JSON.stringify(datos) } })
    const previo = await prisma.cierreDia.create({ data: {
      fecha: new Date(`${anterior}T00:00:00-05:00`), horaCierre: new Date(`${anterior}T22:00:00-05:00`),
      totalVentas: 5000, reporte: { totalVentas: 5000 },
    } })
    await loginAs(page, 'admin')
    await goto(page, `/cierre?fecha=${fecha}`)
    await page.getByText('Conciliar venta anterior', { exact: true }).click()
    await page.getByLabel(`Valor reconocido (${anterior})`, { exact: true }).fill('5000')
    await page.getByLabel(`Referencia documental (${anterior})`, { exact: true }).fill('Reporte original del día 06, fila de venta 2')
    const boton = page.getByRole('button', { name: 'Registrar conciliación', exact: true })
    await expect(boton).toBeDisabled()
    await page.getByLabel('Verifiqué los importes y sus referencias documentales.').check()
    await capturar(page, testInfo, 'conciliacion-ventas-formulario')
    await boton.click()
    await expect(page.getByTestId('cierre-kpi-ventas')).toContainText('15.000')
    await expect(page.getByTestId('cierre-ventas-por-conciliar')).toHaveCount(0)
    await expect(page.getByTestId('cierre-conciliaciones-aplicadas')).toBeVisible()
    await page.getByText('Retirar conciliación', { exact: true }).click()
    await page.getByLabel('Confirmo que quiero volver a dejar pendiente esta revisión.').check()
    await page.getByRole('button', { name: 'Retirar y dejar pendiente', exact: true }).click()
    await expect(page.getByTestId('cierre-ventas-por-conciliar')).toBeVisible()
    expect(await prisma.cierreDia.findUnique({ where: { id: previo.id } })).toEqual(previo)
  })

  test('legado sin evidencia muestra referencias y bloquea solo la fecha afectada', async ({ page }, testInfo) => {
    await preparar(true)
    await loginAs(page, 'admin')
    await goto(page, `/cierre?fecha=${fecha}`)
    await expect(page.getByText('AB-INDEPENDIENTE', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirmar cierre' })).toBeDisabled()
    await expect(page.getByTestId('cierre-kpi-neto')).toHaveCount(0)
    await capturar(page, testInfo, 'conciliacion')
    await page.getByLabel('Fecha del cierre').fill('2001-01-08')
    await expect(page.getByTestId('cierre-kpi-cobros')).toBeVisible()
    expect(await prisma.cierreDia.count()).toBe(0)
    expect((await prisma.abono.findFirstOrThrow({ where: { numero: 'AB-INDEPENDIENTE' } })).origenCobro).toBeNull()
  })

  test('un error HTTP no se presenta como un cierre con importes cero', async ({ page }, testInfo) => {
    await loginAs(page, 'admin')
    await page.route('**/api/cierre?*', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Fallo sintético de consulta' } }) }))
    await goto(page, `/cierre?fecha=${fecha}`)
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
    await expect(page.getByTestId('cierre-kpi-neto')).toHaveCount(0)
    await capturar(page, testInfo, 'error')
    await page.unroute('**/api/cierre?*')
    await page.getByRole('button', { name: 'Reintentar' }).click()
    await expect(page.getByTestId('cierre-kpi-cobros')).toBeVisible()
  })
})
