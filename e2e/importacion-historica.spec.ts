import { test, expect, goto, BASE } from './fixtures'
import type { Page } from '@playwright/test'
import ExcelJS from 'exceljs'

async function fullLoginWarm(page: Page, user = 'admin', pass = 'admin123') {
  // El primer login en un server frío puede tardar >15s por compilación de /login/redirect y la página destino.
  await page.goto(`${BASE}/login`)
  await page.fill('input[placeholder="Ingrese usuario"]', user)
  await page.fill('input[placeholder="Ingrese contraseña"]', pass)
  await page.click('button[type="submit"]')
  await page.waitForURL(/.*\/(dashboard|repartidor|reportes)/, { timeout: 60000 })
}

async function buildImportBuffer(): Promise<Buffer> {
  const uniquePhone = `300${Date.now().toString().slice(-7)}`
  const uniqueNit = `900${Date.now().toString().slice(-7)}`
  const workbook = new ExcelJS.Workbook()

  const clientes = workbook.addWorksheet('Clientes')
  clientes.addRow(['nombre', 'telefono', 'barrio'])
  clientes.addRow(['E2E Import Cliente', uniquePhone, 'Centro'])

  const pedidos = workbook.addWorksheet('Pedidos')
  pedidos.addRow(['fecha', 'cliente_telefono', 'paca_agua_ped'])
  pedidos.addRow(['15/03/2024', uniquePhone, 2])

  const pagos = workbook.addWorksheet('Pagos')
  pagos.addRow(['fecha', 'cliente_telefono', 'monto', 'metodo'])
  pagos.addRow(['15/03/2024', uniquePhone, 24000, 'EFECTIVO'])

  const gastos = workbook.addWorksheet('Gastos')
  gastos.addRow(['fecha', 'descripcion', 'monto'])
  gastos.addRow(['15/03/2024', 'Gasolina moto', 35000])

  const proveedores = workbook.addWorksheet('Proveedores')
  proveedores.addRow(['nombre', 'nit', 'telefono'])
  proveedores.addRow(['E2E Import Proveedor', uniqueNit, '3209999000'])

  const insumos = workbook.addWorksheet('Insumos')
  insumos.addRow(['nombre', 'unidad', 'stock'])
  insumos.addRow(['E2E Import Insumo', 'UNIDAD', 50])

  const compras = workbook.addWorksheet('Compras')
  compras.addRow(['fecha', 'proveedor', 'insumo', 'cantidad', 'costo_unitario'])
  compras.addRow(['15/03/2024', 'E2E Import Proveedor', 'E2E Import Insumo', 10, 100])

  return workbook.xlsx.writeBuffer() as unknown as Buffer
}

test.describe('Importación histórica', () => {
  test('flujo completo desde el wizard', async ({ page }) => {
    test.setTimeout(120000)
    await fullLoginWarm(page)
    await goto(page, '/dashboard/importar')

    await expect(page.locator('h1:has-text("Importación histórica")')).toBeVisible()

    const buffer = await buildImportBuffer()

    // Subir archivo
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('text=Arrastrá un archivo o hacé clic para seleccionar').click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles({
      name: 'importacion-e2e.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    })

    await page.locator('button:has-text("Analizar archivo")').click()

    // Esperar el paso de análisis y ejecutarlo
    await expect(page.locator('button:has-text("Revisar duplicados")')).toBeVisible({ timeout: 15000 })
    await page.locator('button:has-text("Revisar duplicados")').click()

    // Esperar a que termine el análisis y aparezca el paso de revisión
    await expect(page.locator('button:has-text("Confirmar importación")')).toBeVisible({ timeout: 60000 })

    // Si hay filas pendientes, marcarlas todas como nuevas
    const crearTodos = page.locator('button:has-text("Crear todos")')
    if (await crearTodos.isVisible().catch(() => false)) {
      await crearTodos.click()
      await expect(page.locator('button:has-text("Confirmar importación")')).toBeEnabled({ timeout: 10000 })
    }

    // Confirmar importación
    await page.locator('button:has-text("Confirmar importación")').click()

    // Esperar resultado
    await expect(page.locator('h3:has-text("Importación completada")')).toBeVisible({ timeout: 30000 })

    const bodyText = await page.locator('body').innerText()
    expect(bodyText.toLowerCase()).toContain('creados')
  })

  test('acceso denegado para repartidor', async ({ page }) => {
    test.setTimeout(120000)
    await fullLoginWarm(page, 'repartidor', 'rep123')
    await goto(page, '/dashboard/importar')

    // El repartidor no debería ver el wizard de importación
    await expect(page.locator('h1:has-text("Importación histórica")')).not.toBeVisible()
  })
})
