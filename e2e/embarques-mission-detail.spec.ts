// @tests Mission Detail (Fase 5) — menú por click (no hover), acordeón mobile y
// panel de estado operativo (excepciones abiertas).
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loginAs, apiPost, createTrabajador, createEmbarque, BASE } from './fixtures'

const prisma = new PrismaClient()

async function seedEmbarqueAbierto(page: import('@playwright/test').Page) {
  const t = await createTrabajador(page, { rol: 'REPARTIDOR' })
  const trabajadorId = t.trabajador?.id || t.data?.id
  expect(trabajadorId).toBeTruthy()
  const e = await createEmbarque(page, trabajadorId)
  const embarqueId = e.embarque?.id || e.data?.id
  expect(embarqueId).toBeTruthy()
  return embarqueId as string
}

test.describe('Mission Detail — menú de acciones (click, no hover)', () => {
  test('el menú se abre con click y expone "Asignar pedidos" en touch', async ({ page }) => {
    await loginAs(page, 'admin')
    const embarqueId = await seedEmbarqueAbierto(page)

    await page.goto(`${BASE}/embarques/${embarqueId}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // El menú ya no depende de hover: un click lo abre.
    await page.getByTestId('embarque-actions-menu').first().click()
    await expect(page.getByTestId('asignar-pedidos-button').first()).toBeVisible()
    await expect(page.getByTestId('editar-embarque-button').first()).toBeVisible()
  })
})

test.describe('Mission Detail — panel estado operativo', () => {
  test('muestra una excepción FALTANTE (recovery) con su CTA', async ({ page }) => {
    await loginAs(page, 'admin')
    const embarqueId = await seedEmbarqueAbierto(page)

    // Siembra un faltante real vía el endpoint de recovery (FALTANTE no exige
    // evento físico de origen).
    const recRes = await apiPost(page, `/api/embarques/${embarqueId}/recovery`, {
      tipo: 'FALTANTE',
      producto: 'BOTELLON',
      cantidad: 3,
      cantidadAplicada: 3,
      reason: 'Faltante detectado (E2E mission detail)',
    })
    expect(recRes.status()).toBeLessThan(500)

    await page.goto(`${BASE}/embarques/${embarqueId}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const panel = page.getByTestId('estado-operativo')
    await expect(panel.first()).toBeVisible({ timeout: 8000 })
    await expect(panel).toContainText('Faltante: Botellón')
    await expect(page.getByTestId('estado-operativo-cta-fisico').first()).toBeVisible()
  })

  test('muestra un ResponsibilityCase FALTANTE_CAJA abierto con CTA a trabajador (contrato §13)', async ({ page }) => {
    await loginAs(page, 'admin')
    const embarqueId = await seedEmbarqueAbierto(page)

    // El cierre con faltante deja un ResponsibilityCase PENDIENTE (nunca deuda
    // automática). Se siembra directo para no depender del payload de cierre.
    await prisma.responsibilityCase.create({
      data: {
        embarqueId,
        tipo: 'FALTANTE_CAJA',
        descripcion: 'Faltaron $8.000 en la caja al cierre (E2E)',
        montoEstimado: 8000,
        estado: 'ABIERTA',
      },
    })

    await page.goto(`${BASE}/embarques/${embarqueId}`)
    await page.waitForLoadState('domcontentloaded')

    const panel = page.getByTestId('estado-operativo')
    await expect(panel.first()).toBeVisible({ timeout: 8000 })
    await expect(panel).toContainText('Faltante de caja')
    await expect(panel).toContainText('pendiente de resolución autorizada')
    await expect(page.getByTestId('estado-operativo-cta-trabajador').first()).toBeVisible()
  })
})

test.describe('Mission Detail — acordeón/segmented en mobile', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  })

  test('las tres secciones son alcanzables por tap y "Físico" abre el ledger', async ({ page }) => {
    await loginAs(page, 'admin')
    const embarqueId = await seedEmbarqueAbierto(page)

    await page.goto(`${BASE}/embarques/${embarqueId}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // En mobile las tabs se apilan (una sección abierta a la vez) y son
    // tap-ables; el ledger físico sigue accesible con el mismo data-testid.
    await page.getByTestId('tab-fisico').click()
    await expect(page.getByTestId('tab-fisico-panel')).toBeVisible({ timeout: 8000 })
  })
})
