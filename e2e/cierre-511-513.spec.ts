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
    const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente sintético cierre', telefono: randomUUID(), direccion: 'Prueba' } })
    const pedido = await prisma.pedido.create({ data: {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: instante,
      estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO', estadoPago: 'PARCIAL',
      total: 20000, totalPagado: 10000, saldo: 10000,
    } })
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
      estado: 'ANULADO', estadoEntrega: 'ANULADO', estadoPago: 'ANULADO', total: 5000, saldo: 0,
    } })
    await prisma.notaCredito.create({ data: { numero: `NC-${randomUUID()}`, pedidoId: anulado.id, monto: 5000, motivo: 'Prueba sintética', fecha: instante } })
  }

  test('revisa, confirma una vez, conserva el resultado y permite imprimirlo', async ({ page }, testInfo) => {
    await preparar()
    await loginAs(page, 'admin')
    await goto(page, `/cierre?fecha=${fecha}`)
    await expect(page.getByTestId('cierre-kpi-ventas')).toContainText('20.000')
    await expect(page.getByTestId('cierre-kpi-cobros')).toContainText('10.000')
    await page.getByLabel('Base de Caja', { exact: true }).fill('10000')
    await page.getByLabel('Salarios', { exact: true }).fill('5000')
    await expect(page.getByTestId('cierre-kpi-neto')).toContainText('15.000')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await capturar(page, testInfo, 'revision')

    await page.getByRole('button', { name: 'Contar Efectivo Físico' }).click()
    await page.getByRole('button', { name: 'Sumar 1 a $10.000', exact: true }).click()
    await page.getByRole('button', { name: /Terminar conteo/ }).click()
    await page.getByRole('button', { name: 'Cerrar Día', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Confirmar cierre del día' })
    await expect(dialog.getByRole('button', { name: 'Confirmar cierre', exact: true })).toBeDisabled()
    await expect(dialog.getByText(/incluye pagos digitales/)).toBeVisible()
    await expect(dialog.locator('dl > div').filter({ hasText: 'Salarios' })).toContainText('5.000')
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
    expect(Number(guardado.netoCaja)).toBe(15000)
    expect(guardado.reporte).toMatchObject({ _version: '2.1', cobroVentasHoy: 5000, cobroCartera: 5000, salarios: 5000, totalContado: 10000, netoCaja: 15000 })
    await page.reload()
    await expect(page.getByTestId('cierre-kpi-neto')).toContainText('15.000')
    await capturar(page, testInfo, 'registrado')
    expect(await prisma.cierreDia.count()).toBe(1)
    await goto(page, `/cierre/reporte?fecha=${fecha}`)
    await expect(page.getByRole('button', { name: 'Imprimir / Guardar como PDF' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'Total cobros de la fecha' })).toContainText('10.000')
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
