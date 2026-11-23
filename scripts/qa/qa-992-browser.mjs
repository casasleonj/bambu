// #992 · independent browser QA, NOT an E2E spec.
// Runs ONLY against disposable CI Postgres and the locally launched Next.js build.
// Browser steps are the same actions an administrator performs in Cierre.
// Separate report and screenshots uploaded as QA evidence.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

const url = process.env.PLAYWRIGHT_TEST_BASE_URL
const dbUrl = process.env.DATABASE_URL ?? ''
if (
  process.env.CI !== 'true' ||
  !url?.startsWith('http://localhost:3001') ||
  !dbUrl.includes('@localhost:5432/') ||
  !process.env.NEXTAUTH_SECRET
) {
  throw new Error('QA #992: refuse to run without isolated CI DB, localhost app and auth secret')
}

const db = new PrismaClient()
const output = '.qa/artifacts/pr-993'
await fs.mkdir(output, { recursive: true })
const results = []
let browser

async function recorrido(viewport, label) {
  const trabajador = await db.trabajador.create({
    data: {
      nombre: 'SINTETICO QA 992 ' + label,
      rol: 'ADMIN',
      tipoPago: 'FIJO',
      salarioFijo: 400000,
      frecuenciaPago: 'QUINCENAL',
      frecuenciaDesde: new Date('2026-11-14T12:00:00Z'),
      pagoFueraDeCaja: true,
    },
  })
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const errores = []
  page.on('pageerror', err => errores.push(err.message))

  const fechaSueldo = '2026-11-15'
  const fechaReal = '2026-11-16'
  const tarjeta = page.getByTestId('sueldo-' + trabajador.id + '-' + fechaSueldo)
  try {
    await page.goto(url + '/login')
    await page.getByPlaceholder('Ingrese usuario').fill('admin')
    await page.getByPlaceholder('Ingrese contraseña').fill('admin123')
    await page.locator('button[type=submit]').click()
    await page.waitForURL(/\/(dashboard|repartidor|reportes)/, { timeout: 20000 })
    await page.goto(url + '/cierre?fecha=' + fechaSueldo)
    await tarjeta.waitFor({ state: 'visible', timeout: 20000 })
    assert.ok((await tarjeta.textContent())?.includes(trabajador.nombre))

    await page.getByTestId('sueldo-otro-dia-' + trabajador.id + '-' + fechaSueldo).click()
    await page.getByTestId('sueldo-fecha-' + trabajador.id + '-' + fechaSueldo).fill(fechaReal)
    await page.getByTestId('sueldo-motivo-' + trabajador.id + '-' + fechaSueldo)
      .fill('QA independiente: fecha real diferente')
    await page.getByTestId('pagar-sueldo-' + trabajador.id).click()

    // Adversarial: cancelling must not pay anything.
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()
    assert.equal(await db.nomina.count({ where: { trabajadorId: trabajador.id } }), 0)

    await page.getByTestId('pagar-sueldo-' + trabajador.id).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Sí, pagar' }).waitFor()
    const respuesta = page.waitForResponse(
      res => res.url().endsWith('/api/nomina/sueldo/pagar') &&
             res.request().method() === 'POST',
    )
    await page.getByRole('dialog').getByRole('button', { name: 'Sí, pagar' }).click()
    assert.equal((await respuesta).status(), 201, 'Pago desde Cierre debe devolver 201')

    await tarjeta.waitFor({ state: 'detached', timeout: 20000 })
    await page.screenshot({ path: output + '/' + label + '-pago.png', fullPage: true })
    await page.reload()
    assert.equal(await tarjeta.count(), 0, 'Recarga no debe ofrecer sueldo ya pagado')

    const nominas = await db.nomina.findMany({ where: { trabajadorId: trabajador.id } })
    assert.equal(nominas.length, 1)
    assert.equal(nominas[0].estado, 'PAGADA')
    assert.equal(nominas[0].pagoFueraDeCaja, true)
    assert.equal(nominas[0].fechaPago?.toISOString().slice(0, 10), fechaReal)
    assert.equal(await db.gasto.count({ where: { trabajadorId: trabajador.id, categoria: 'NOMINA' } }), 0)
    assert.equal(errores.length, 0, 'No debe haber errores JS durante recorrido')
    results.push({ viewport: label, resultado: 'PASO', via: 'Chromium, acciones UI, cancelacion, confirmacion, recarga, persistencia', capturas: label + '-pago.png' })
    process.stdout.write('QA #992 ' + label + ': PASO\n')
  } finally {
    await context.close()
  }
}

try {
  browser = await chromium.launch({ headless: true })
  await recorrido({ width: 1280, height: 850 }, 'escritorio')
  await recorrido({ width: 390, height: 844 }, 'movil')
} catch (error) {
  results.push({ resultado: 'FALLO', error: error instanceof Error ? error.message : String(error) })
  throw error
} finally {
  await fs.writeFile(output + '/resumen.json', JSON.stringify({ issue: 992, pr: 993, sha: process.env.GITHUB_SHA, resultados: results }, null, 2))
  if (browser) await browser.close()
  await db.$disconnect()
}
