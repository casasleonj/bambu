import { test, type Page } from '@playwright/test'
import { fullLogin, prisma, createEmbarque } from '../../fixtures-paranoid'

export const TEST_PHOTO = '/tmp/opencode/1x1.jpg'

export async function getRepartidorTrabajadorId() {
  const repartidorUser = await prisma.user.findUnique({ where: { username: 'repartidor' } })
  const trabajador = await prisma.trabajador.findFirst({ where: { userId: repartidorUser?.id } })
  if (!trabajador) throw new Error('No se encontró trabajador para el usuario repartidor')
  return trabajador.id
}

export async function setupEmbarque(page: Page) {
  await fullLogin(page, 'admin', 'admin123')
  const trabajadorId = await getRepartidorTrabajadorId()
  // Limpiar embarques abiertos previos del repartidor para evitar datos acumulados.
  await prisma.embarque.deleteMany({
    where: { trabajadorId, estado: { in: ['ABIERTO', 'EN_RUTA'] } },
  })
  await createEmbarque(page, trabajadorId)
}

export async function clearOfflineDb(page: Page) {
  await page.evaluate(async () => {
    const req = indexedDB.deleteDatabase('BambuOfflineDB')
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
      req.onblocked = () => resolve()
    })
  })
}

export async function mockGeolocation(page: Page) {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (success) => {
      success({
        coords: { latitude: 4.711, longitude: -74.0721, accuracy: 10 },
        timestamp: Date.now(),
      } as GeolocationPosition)
    }
  })
}

export async function loginRepartidor(page: Page) {
  const { loginAs } = await import('../../fixtures-paranoid')
  await loginAs(page, 'repartidor')
}

export async function abrirRepartidor(page: Page) {
  await mockGeolocation(page)
  await loginRepartidor(page)
  await page.goto('/repartidor')
  await page.waitForSelector('[data-testid="btn-venta-libre"]', { state: 'visible' })
}

export async function guardarVentaLibreOffline(page: Page, monto = '2800') {
  await page.context().setOffline(true)
  // Esperar a que el estado de red se propague y el DOM se estabilice
  await page.waitForTimeout(300)

  await page.getByTestId('btn-venta-libre').first().click()
  await page.getByTestId('producto-PACA_AGUA-mas').click()

  await page.getByRole('button', { name: '+ EFECTIVO' }).click()
  await page.fill('#pago-monto', monto)
  await page.getByRole('button', { name: 'Agregar' }).click()

  await page.setInputFiles('input[type="file"][accept="image/*"]', TEST_PHOTO)
  await page.getByRole('button', { name: 'Capturar GPS' }).click()
  await page.waitForSelector('text=/\\-74\\.07/', { state: 'visible' })

  await page.getByTestId('btn-guardar-venta-libre').click()
  await page.waitForSelector('text=Venta guardada offline', { state: 'visible' })
}

export async function sincronizar(page: Page) {
  await page.context().setOffline(false)
  await page.waitForTimeout(300)
  await page.getByTestId('btn-sync-repartidor').first().click()
  await page.waitForSelector('text=Sincronizado:', { state: 'visible' })
}
