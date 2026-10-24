// @tests /facturas — recorrido de usuario normal: búsqueda de cliente con sus
// totales, orden (escritorio y móvil), filtro Parcial, interruptor de anuladas
// y resumen consolidado sin límite de meses (historial completo o por rango).
//
// Datos: Sandra León con 24 facturas repartidas en ~8 meses (4 anuladas) y otro
// cliente con 60 facturas más recientes, de modo que las de Sandra quedan
// DESPUÉS de la primera página de 50 (el caso que antes impedía hasta
// encontrarla en el buscador).
import { PrismaClient } from '@prisma/client'
import { test, expect, loginAs, goto, apiGet, resetDatabase, responsiveContainer } from './fixtures'

const prisma = new PrismaClient()
const DAY = 86_400_000
const money = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })
    .format(n)
    .replace(/\s/g, ' ')
const norm = (s: string) => s.replace(/\s/g, ' ')

type Exp = { count: number; facturado: number; cobrado: number; porCobrar: number; parciales: number; anuladas: number; pendientes: number; pagadas: number; mayorSaldo: number }
let sandra: Exp
let general: Exp
let sandraId: string

async function crearFactura(clienteId: string, numero: string, fecha: Date, total: number, modo: 'PAGADA' | 'PARCIAL' | 'EMITIDA' | 'ANULADA') {
  const pagado = modo === 'PAGADA' ? total : modo === 'PARCIAL' ? total / 2 : 0
  const saldo = modo === 'ANULADA' ? 0 : total - pagado
  const pedido = await prisma.pedido.create({
    data: {
      clienteId,
      fecha,
      total,
      saldo: modo === 'ANULADA' ? total : saldo,
      totalPagado: modo === 'ANULADA' ? 0 : pagado,
      estado: modo === 'ANULADA' ? 'ANULADO' : 'ENTREGADO',
      estadoEntrega: modo === 'ANULADA' ? 'ANULADO' : 'ENTREGADO',
      estadoPago: modo === 'ANULADA' ? 'ANULADO' : modo === 'PAGADA' ? 'PAGADO' : modo === 'PARCIAL' ? 'PARCIAL' : 'PENDIENTE',
    },
  })
  await prisma.factura.create({
    data: { numero, clienteId, pedidoId: pedido.id, fecha, subtotal: total, total, montoPagado: pagado, saldo, estado: modo },
  })
  return { total, pagado, saldo }
}

test.describe('Facturas — experiencia de usuario', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(async () => {
    resetDatabase()
    const c = await prisma.cliente.create({ data: { nombre: 'sandra', apellido: 'leon', telefono: '573163887163', direccion: 'Calle 1' } })
    sandraId = c.id
    const otro = await prisma.cliente.create({ data: { nombre: 'Pedro', apellido: 'Gómez', telefono: '573001112233', direccion: 'Calle 2' } })

    const modos = ['PAGADA', 'PARCIAL', 'EMITIDA', 'EMITIDA', 'ANULADA'] as const
    sandra = { count: 0, facturado: 0, cobrado: 0, porCobrar: 0, parciales: 0, anuladas: 0, pendientes: 0, pagadas: 0, mayorSaldo: 0 }
    for (let i = 0; i < 24; i++) {
      const modo = modos[i % 5]
      const total = (1 + (i % 6)) * 10_000
      const fecha = new Date(Date.now() - (2 + i * 10) * DAY)
      const r = await crearFactura(sandraId, `FAC-U${String(i + 1).padStart(4, '0')}`, fecha, total, modo)
      if (modo === 'ANULADA') { sandra.anuladas++; continue }
      sandra.count++
      sandra.facturado += r.total
      sandra.cobrado += r.pagado
      sandra.porCobrar += r.saldo
      sandra.mayorSaldo = Math.max(sandra.mayorSaldo, r.saldo)
      if (modo === 'PARCIAL') sandra.parciales++
      if (modo === 'PAGADA') sandra.pagadas++
      else sandra.pendientes++
    }
    // 60 facturas pagadas, más recientes que cualquiera de Sandra.
    let extra = 0
    for (let i = 0; i < 60; i++) {
      await crearFactura(otro.id, `FAC-P${String(i + 1).padStart(4, '0')}`, new Date(Date.now() - i * 60_000), 5_000, 'PAGADA')
      extra += 5_000
    }
    general = { ...sandra, count: sandra.count + 60, facturado: sandra.facturado + extra, cobrado: sandra.cobrado + extra, pagadas: sandra.pagadas + 60 }
  })

  test.afterAll(async () => {
    await prisma.$disconnect()
  })

  async function abrirFacturas(page: import('@playwright/test').Page) {
    await loginAs(page, 'admin')
    await goto(page, '/facturas')
    await expect(page.getByTestId('facturas-kpis')).toBeVisible()
  }

  const kpis = (page: import('@playwright/test').Page) => page.getByTestId('facturas-kpis')

  async function elegirSandra(page: import('@playwright/test').Page) {
    const buscar = page.getByPlaceholder('Buscar cliente o factura...')
    await buscar.click()
    await buscar.fill('sandra')
    await page.getByRole('button', { name: /sandra leon/i }).first().click()
    await expect(page.getByTestId('kpi-alcance')).toContainText('sandra leon')
  }

  test('sin cliente seleccionado, el resumen es el general (sin anuladas)', async ({ page }) => {
    await abrirFacturas(page)
    const t = norm(await kpis(page).innerText())
    expect(t).toContain(money(general.facturado))
    expect(t).toContain(`${general.count} facturas`)
  })

  test('buscar a Sandra aunque sus facturas estén después de la primera página', async ({ page }) => {
    await abrirFacturas(page)
    // Hay más de 50 facturas: la lista solo trae la primera página.
    await expect(page.getByText(/Mostrando 50 de/)).toBeVisible()
    await elegirSandra(page)
  })

  test('los totales siguen al cliente: facturado, cobrado, por cobrar y desde cuándo debe', async ({ page }) => {
    await abrirFacturas(page)
    await elegirSandra(page)
    await expect(kpis(page)).toContainText(`${sandra.count} facturas`)
    const t = norm(await kpis(page).innerText())
    expect(t).toContain(money(sandra.facturado))
    expect(t).toContain(money(sandra.cobrado))
    expect(t).toContain(money(sandra.porCobrar))
    expect(t).toContain(`${sandra.pagadas} pagada`)
    expect(t).toContain(`${sandra.pendientes} pendiente`)
    expect(t).toMatch(/desde \d{2} de/)
    // Y al quitar el cliente vuelve el general.
    await page.getByRole('button', { name: /Limpiar selecci/ }).click()
    await expect(kpis(page)).toContainText(`${general.count} facturas`)
  })

  test('el filtro Parciales existe y muestra solo parciales', async ({ page }) => {
    await abrirFacturas(page)
    await elegirSandra(page)
    const tab = page.getByTestId('estado-PARCIAL')
    await expect(tab).toContainText(`(${sandra.parciales})`)
    await tab.click()
    const lista = responsiveContainer(page, 'facturas-mobile', 'facturas-desktop')
    await expect(lista.getByText('PARCIAL').first()).toBeVisible()
    await expect(lista.getByText('EMITIDA')).toHaveCount(0)
    // La pestaña no cambia los totales del cliente.
    await expect(kpis(page)).toContainText(money(sandra.facturado))
  })

  test('el interruptor de anuladas las muestra y las suma solo cuando se activa', async ({ page }) => {
    await abrirFacturas(page)
    await elegirSandra(page)
    const lista = responsiveContainer(page, 'facturas-mobile', 'facturas-desktop')
    await expect(page.getByTestId('estado-ANULADA')).toContainText(`(${sandra.anuladas})`)
    await expect(lista.getByText('ANULADA')).toHaveCount(0)
    await expect(kpis(page)).toContainText(`${sandra.count} facturas`)

    await page.getByTestId('switch-anuladas').click()
    await expect(lista.getByText('ANULADA').first()).toBeVisible()
    await expect(kpis(page)).toContainText(`${sandra.count + sandra.anuladas} facturas`)
  })

  test('se puede ordenar por saldo en escritorio y en móvil', async ({ page }) => {
    await abrirFacturas(page)
    await elegirSandra(page)
    const lista = responsiveContainer(page, 'facturas-mobile', 'facturas-desktop')
    if ((page.viewportSize()?.width ?? 1280) < 768) {
      await page.getByTestId('orden-select').selectOption('saldo:desc')
      await expect(lista.getByText(`Saldo: ${money(sandra.mayorSaldo)}`).first()).toBeVisible()
      await page.getByTestId('orden-select').selectOption('fecha:asc')
      await expect(page.getByTestId('orden-select')).toHaveValue('fecha:asc')
    } else {
      await page.getByTestId('sort-saldo').click() // primer clic: mayor saldo primero
      await expect(page.locator('th[aria-sort="descending"]')).toContainText('Saldo')
      await expect(lista.locator('tbody tr').first()).toContainText(money(sandra.mayorSaldo))
      await page.getByTestId('sort-saldo').click()
      await expect(page.locator('th[aria-sort="ascending"]')).toContainText('Saldo')
      // Cliente y Estado también se ordenan.
      await page.getByTestId('sort-estado').click()
      await expect(page.locator('th[aria-sort="ascending"]')).toContainText('Estado')
      await page.getByTestId('sort-fecha').click()
      await expect(page.locator('th[aria-sort="descending"]')).toContainText('Fecha')
    }
  })

  test('el resumen consolidado acepta más de 3 meses y también el historial completo', async ({ page }) => {
    await abrirFacturas(page)
    await elegirSandra(page)

    // Rango de ~8 meses (antes: "El período no puede exceder 3 meses").
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const desde = new Date(Date.now() - 250 * DAY).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    await page.locator('input[type="date"]').nth(0).fill(desde)
    await page.locator('input[type="date"]').nth(1).fill(hoy)
    await page.getByTestId('btn-resumen-consolidado').click()
    await expect(page.getByText('Resumen Consolidado de Cuenta')).toBeVisible()
    await expect(page.getByText('No se pudo cargar el resumen')).toHaveCount(0)
    await expect(page.getByText('El período no puede exceder')).toHaveCount(0)

    // Sin fechas: historial completo.
    await page.goto(`/resumen-facturas?clienteId=${sandraId}`)
    await expect(page.getByText('Resumen Consolidado de Cuenta')).toBeVisible()
    await expect(page.getByText('Historial completo').first()).toBeVisible()
    await expect(page.getByText('No se pudo cargar el resumen')).toHaveCount(0)
  })

  test('un repartidor no puede leer el resumen consolidado', async ({ page }) => {
    await loginAs(page, 'repartidor')
    const res = await apiGet(page, `/api/clientes/${sandraId}/resumen-facturas`)
    expect(res.status()).toBe(403)
  })
})
