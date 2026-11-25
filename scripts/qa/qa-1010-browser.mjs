// #1010 F2A — QA independiente del spec E2E. Solo Chromium + servidor CI y datos sintéticos.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

const url = new URL(process.env.PLAYWRIGHT_TEST_BASE_URL ?? '')
const dbUrl = new URL(process.env.DATABASE_URL ?? '')
if (process.env.CI !== 'true' || url.origin !== 'http://localhost:3001'
  || dbUrl.hostname !== 'localhost' || dbUrl.port !== '5432'
  || dbUrl.pathname !== '/bambu' || !process.env.NEXTAUTH_SECRET) {
  throw new Error('QA #1010 requiere servidor y base desechables de CI')
}
const db = new PrismaClient()
const output = '.qa/artifacts/pr-1013'
await fs.mkdir(output, { recursive: true })
const results = []
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
let browser

async function login(page, usuario, clave) {
  await page.goto(url.origin + '/login')
  await page.getByPlaceholder('Ingrese usuario').fill(usuario)
  await page.getByPlaceholder('Ingrese contraseña').fill(clave)
  await page.locator('button[type=submit]').click()
  await page.waitForURL(/\/(dashboard|repartidor|reportes)/, { timeout: 30000 })
}
async function recorrido(viewport, label) {
  const t = await db.trabajador.create({ data: {
    nombre: 'SINTETICO QA 1010 ' + label, rol: 'SELLADOR', tipoPago: 'COMISION',
    comPacaAgua: 330, comPacaHielo: 330, comBotellon: 330,
  } })
  await db.produccion.create({ data: { trabajadorId: t.id, fecha: new Date(hoy + 'T00:00:00-05:00'),
    turno: 'JORNADA', comSellTotal: 11220, items: { create: [
      { producto: 'PACA_AGUA', producido: 20, comSellador: 6600 },
      { producto: 'PACA_HIELO', producido: 10, comSellador: 3300 },
      { producto: 'BOTELLON', producido: 4, comSellador: 1320 },
    ] } } })
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const errores = []
  page.on('pageerror', err => errores.push(err.message))
  try {
    await login(page, 'admin', 'admin123')
    await page.goto(url.origin + '/cierre?fecha=' + hoy)
    const fila = page.getByTestId('comision-' + t.id)
    await expect(fila).toBeVisible({ timeout: 30000 })
    const skip = page.getByTestId('base-caja-modal-skip')
    if (await skip.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)) {
      await skip.click()
      await expect(skip).toBeHidden()
    }
    const pagar = fila.getByTestId('pagar-comision-' + t.id)
    await expect(fila.getByTestId('comision-pendiente')).toContainText('11.220')
    // Cambiar el medio por Nequi solo en el recorrido móvil; verificar el desembolso real guardado.
    if (label === 'movil') await fila.getByTestId('comision-medio-' + t.id + '-NEQUI').click()
    await pagar.click()
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    assert.equal(await db.pagoComisionRepartidor.count({ where: { trabajadorId: t.id } }), 0)
    await pagar.click()
    await page.screenshot({ path: output + '/' + label + '-confirmacion.png', fullPage: true })
    const respuesta = page.waitForResponse(r => r.url().endsWith('/api/nomina/dia/pagar') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Sí, ya le pagué' }).click()
    assert.equal((await respuesta).status(), 201)
    await expect(fila.getByTestId('comision-pagado')).toContainText('11.220', { timeout: 20000 })
    await page.reload()
    await expect(fila.getByTestId('comision-pagado')).toContainText('11.220', { timeout: 20000 })
    await expect(pagar).toHaveCount(0)
    await page.screenshot({ path: output + '/' + label + '-pagado.png', fullPage: true })
    const pagos = await db.pagoComisionRepartidor.findMany({ where: { trabajadorId: t.id }, include: { evidencia: true } })
    assert.equal(pagos.length, 1)
    assert.equal(Number(pagos[0].monto), 11220)
    assert.equal(pagos[0].metodo, label === 'movil' ? 'NEQUI' : 'EFECTIVO')
    assert.equal(pagos[0].evidencia?.datos.desembolsoCentavos, 1122000)
    // F2A aún no tiene pantalla propia: consultar el contrato de lectura con la misma sesión.
    const ruta = '/api/nomina/comisiones?modo=detalle&trabajadorId=' + t.id + '&fechaTrabajo=' + hoy + '&concepto=PRODUCCION'
    const res = await page.request.get(url.origin + ruta)
    assert.equal(res.status(), 200)
    const { detalle } = await res.json()
    assert.equal(detalle.totalJornada.monto, 11220)
    assert.equal(detalle.evidenciasAlRegistrar.length, 1)
    assert.equal(detalle.evidenciasAlRegistrar[0].estado, 'REGISTRADA')
    const items = detalle.evidenciasAlRegistrar[0].evidencia.detalle.registros[0].items
    assert.deepEqual(Object.fromEntries(items.map(i => [i.producto, [i.unidades, i.tarifaImplicitaCentavos]])),
      { PACA_AGUA: [20, 33000], PACA_HIELO: [10, 33000], BOTELLON: [4, 33000] })
    await page.goto(url.origin + '/nomina')
    await page.waitForURL(/\/nomina(?:\?|$)/, { timeout: 20000 })
    // No debe crearse una nómina periódica ni un gasto adicional por el pago diario.
    assert.equal(await db.nomina.count({ where: { trabajadorId: t.id } }), 0)
    assert.equal(await db.gasto.count({ where: { trabajadorId: t.id, categoria: 'NOMINA' } }), 0)
    await page.screenshot({ path: output + '/' + label + '-nomina.png', fullPage: true })
    assert.equal(errores.length, 0, errores.join('; '))
    results.push({ viewport: label, estado: 'PASO', pagoId: pagos[0].id, monto: 11220, metodo: pagos[0].metodo,
      alcance: 'Cierre UI, cancelar, confirmar, recargar, contrato autenticado de historial, Nómina sin duplicar' })
    console.log('QA #1010 ' + label + ': PASO')
  } finally {
    await context.close()
  }
}
try {
  browser = await chromium.launch({ headless: true })
  await recorrido({ width: 1280, height: 850 }, 'escritorio')
  await recorrido({ width: 390, height: 844 }, 'movil')
  const ctx = await browser.newContext()
  try {
    const sinSesion = await ctx.request.get(url.origin + '/api/nomina/comisiones')
    assert.equal(sinSesion.status(), 401)
    const page = await ctx.newPage()
    await login(page, 'asistente', 'asist123')
    assert.equal((await page.request.get(url.origin + '/api/nomina/comisiones')).status(), 403)
    results.push({ rol: 'ASISTENTE', estado: 'PASO', alcance: 'historial financiero no autorizado' })
  } finally { await ctx.close() }
} catch (error) {
  results.push({ estado: 'FALLO', error: error instanceof Error ? error.message : String(error) })
  throw error
} finally {
  await fs.writeFile(output + '/resumen.json', JSON.stringify({ issue: 1010, pr: 1013, sha: process.env.GITHUB_SHA, resultados: results }, null, 2))
  if (browser) await browser.close()
  await db.$disconnect()
}
