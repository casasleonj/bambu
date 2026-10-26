// @tests pedidos-client/alertas-table (Ignorar / Crear caso) — issue #503
import { test, expect, resetDatabase, sharedPageLogin, goto, createCliente, createPedido } from './fixtures'
import type { Page } from '@playwright/test'

// El componente renderiza vista desktop y mobile a la vez; solo una es visible.
const visibles = (page: Page, testId: string) => page.locator(`[data-testid="${testId}"]:visible`)

test.describe('Pedidos > Alertas: ignorar y crear caso', () => {
  test.describe.configure({ mode: 'serial' })

  let p: Page
  let nombre: string

  test.beforeAll(async ({ browser }) => {
    resetDatabase()
    p = await sharedPageLogin(browser)
    nombre = `Cliente Alerta ${Date.now() % 100000}`
    const c = await createCliente(p, { nombre, telefono: `3${String(Date.now()).slice(-9)}` })
    const clienteId = c.cliente?.id ?? c.id
    // 2 pedidos el mismo día → alerta 2DO_PEDIDO (BAJA)
    await createPedido(p, { clienteId, canal: 'DOMICILIO', pagoMetodo: 'EFECTIVO', pagoMonto: 5000 })
    await createPedido(p, { clienteId, canal: 'DOMICILIO', pagoMetodo: 'EFECTIVO', pagoMonto: 5000 })
  })

  test.afterAll(async () => {
    await p?.close()
  })

  async function abrirAlertas() {
    await goto(p, '/pedidos?tab=alertas')
    const fila = p.getByText(nombre).locator('visible=true').first()
    await expect(fila).toBeVisible({ timeout: 30000 })
    return fila
  }

  async function expandir() {
    await p.getByRole('button', { name: 'Ver detalle' }).locator('visible=true').first().click()
  }

  test('Ignorar oculta la alerta al instante, sin recargar, y deja de contar al cliente', async () => {
    await abrirAlertas()
    await expandir()
    const ignorar = visibles(p, 'alerta-ignorar').first()
    await expect(ignorar).toBeVisible()

    // Marca para detectar un reload de página
    await p.evaluate(() => { (window as unknown as { __noReload: boolean }).__noReload = true })
    const antes = await visibles(p, 'alerta-ignorar').count()
    expect(antes).toBeGreaterThan(1) // adversarial: el cliente acumula varias alertas
    await ignorar.click()
    // Una alerta menos de inmediato; el cliente sigue mientras queden otras
    await expect(visibles(p, 'alerta-ignorar')).toHaveCount(antes - 1)

    // Ignora el resto una por una hasta que el cliente desaparece
    while ((await visibles(p, 'alerta-ignorar').count()) > 0) {
      await visibles(p, 'alerta-ignorar').first().click()
    }
    await expect(p.getByText(nombre)).toHaveCount(0)
    // El contador de la pestaña no debe quedarse en 1 con la lista vacía
    await expect(p.getByTestId('tab-alertas')).not.toContainText('1')
    expect(await p.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
    await expect(p.getByText('Alerta ignorada por 24 horas').first()).toBeVisible()
  })

  test('la alerta ignorada sigue oculta tras recargar (24h)', async () => {
    await goto(p, '/pedidos?tab=alertas')
    await p.waitForTimeout(1500)
    await expect(p.getByText(nombre)).toHaveCount(0)
  })

  test('adversarial: pasadas 24h la alerta vuelve a aparecer', async () => {
    await p.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith('alerta_ignorada_')) localStorage.setItem(k, String(Date.now() - 25 * 3600 * 1000))
      }
    })
    await goto(p, '/pedidos?tab=alertas')
    await expect(p.getByText(nombre).locator('visible=true').first()).toBeVisible({ timeout: 30000 })
  })

  test('adversarial: doble clic en Ignorar todas no rompe ni deja la fila fantasma', async () => {
    await abrirAlertas()
    await expandir()
    await visibles(p, 'alertas-ignorar-todas').first().dblclick().catch(() => undefined)
    await expect(p.getByText(nombre)).toHaveCount(0)
  })

  test('Crear caso muestra error (no falla en silencio) cuando el API rechaza', async () => {
    await p.evaluate(() => {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (k?.startsWith('alerta_ignorada_')) localStorage.removeItem(k)
      }
    })
    await abrirAlertas()
    await expandir()
    await p.route('**/api/casos', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'boom' }) })
        : route.continue(),
    )
    await p.getByRole('button', { name: /Crear caso|^Caso$/ }).locator('visible=true').first().click()
    await expect(p.getByText('boom')).toBeVisible()
    await expect(p.getByRole('button', { name: /Crear caso|^Caso$/ }).locator('visible=true').first()).toBeEnabled()
    await p.unroute('**/api/casos')
  })

  test('Crear caso funciona y la alerta sigue ignorable después', async () => {
    await p.getByRole('button', { name: /Crear caso|^Caso$/ }).locator('visible=true').first().click()
    await expect(p.getByText('Pasos sugeridos')).toBeVisible()
  })
})
