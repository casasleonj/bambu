// Ayudantes compartidos del asistente «Nuevo Embarque» (flujo pedidos-primero).
// Usados por embarques-nuevo.spec.ts y rutas.spec.ts.
import type { Page } from '@playwright/test'
import { expect, loginAs, apiPost, createCliente, BASE } from './fixtures'

export async function nuevoEmbarqueLogin(page: Page) {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  await page.route('**/api/cierre/last', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cierre: { fecha: yesterday } }) }),
  )
  await loginAs(page, 'admin')
}

export async function crearPedido(page: Page, over: Record<string, unknown> = {}) {
  const c = await createCliente(page)
  const clienteId = c.cliente?.id || c.data?.id
  const res = await apiPost(page, '/api/pedidos', {
    clienteId, canal: 'DOMICILIO', ventaRapida: false,
    items: [{ producto: 'PACA_AGUA', cantidad: 5 }],
    ...over,
  })
  const j = await res.json()
  return { id: j.pedido?.id || j.data?.id, numero: j.pedido?.numero as number, clienteId }
}

export async function abrirWizard(page: Page) {
  await page.goto(`${BASE}/embarques`, { waitUntil: 'domcontentloaded' })
  const boton = page.getByRole('button', { name: /Nuevo Embarque/i }).first()
  const wizard = page.getByTestId('nuevo-embarque-wizard')
  // Con `domcontentloaded` el clic puede llegar antes de que React enganche el
  // handler del botón: no abre y no hay error. Se reintenta solo mientras el modal
  // siga cerrado (un segundo clic con el modal abierto lo cerraría).
  await expect(async () => {
    if (!(await wizard.isVisible())) await boton.click()
    await expect(wizard).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 20000 })
}

/** Paso 1 → paso 2 esperando el stock: antes de que llegue, el botón "Crear" aparece habilitado. */
export async function irAPasoConfirmar(page: Page) {
  const stock = page.waitForResponse((r) => r.url().includes('/api/embarques') && r.url().includes('stock=true'))
  await page.getByTestId('wizard-siguiente').click()
  await stock
}

/**
 * Habilita "Crear" con la carga ya ingresada. Con stock insuficiente (en CI parte de
 * cero y lo consumen los specs anteriores del shard) el wizard exige confirmar el
 * stock físico; con stock suficiente ese bloque no aparece. Los dos estados son
 * válidos: el test cubre el camino, no el inventario.
 */
export async function habilitarCrear(page: Page) {
  const crear = page.getByTestId('wizard-crear')
  const override = page.getByTestId('stock-override')
  await expect.poll(async () => (await crear.isEnabled()) || (await override.isVisible()), { timeout: 15000 }).toBe(true)
  if (!(await crear.isEnabled())) {
    await override.getByRole('checkbox').check()
    const motivo = override.locator('textarea')
    if (await motivo.isVisible()) await motivo.fill('Stock físico verificado (prueba E2E)')
  }
  await expect(crear).toBeEnabled()
}
