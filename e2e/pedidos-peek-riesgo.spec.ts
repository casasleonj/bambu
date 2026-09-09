// @tests Fase 7 — riesgo/excepciones + entrega en el peek (docs/pedidos/fase7-peek-riesgo-flujo-plan.md).
// Detrás de NEXT_PUBLIC_PEDIDOS_V2. La lógica de los componentes está en unit;
// acá se verifica el flujo real: peek → bloque de riesgo con guía → cross-link
// a /casos (navega, no abre modal); pedido entregado → bloque de entrega.
//
//   NEXT_PUBLIC_PEDIDOS_V2=true PW_WORKERS=1 npx playwright test e2e/pedidos-peek-riesgo.spec.ts

import { test, expect, apiPost, createCliente, BASE, sharedLoginAs, appMain } from './fixtures'

const HUB_ON = process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true'

test.describe('Fase 7 — riesgo en el peek (NEXT_PUBLIC_PEDIDOS_V2)', () => {
  test.skip(!HUB_ON, 'requiere NEXT_PUBLIC_PEDIDOS_V2=true + webServer fresco')

  test('un Caso abierto del pedido aparece en el peek con su guía y cross-link a /casos', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(page, { nombre: 'Peek Riesgo E2E' })
    const pRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 4 }],
      offlineId: `peek-riesgo-${Date.now()}`,
    })
    const pedido = (await pRes.json()).pedido

    const casoRes = await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO', severidad: 'ALTA',
      titulo: 'Monto anómalo (E2E)', pedidoId: pedido.id,
    })
    expect(casoRes.status()).toBeLessThan(300)

    await page.goto(`${BASE}/pedidos?all=true`)
    await appMain(page).locator(`[data-testid="operacion-row-${pedido.id}"]`).click()
    await expect(page.getByTestId('peek-desktop')).toBeVisible()

    const bloque = page.getByTestId('peek-rel-casos')
    await expect(bloque).toBeVisible()
    await expect(bloque).toContainText('Requiere revisión')
    await expect(bloque).toContainText(/monto anómalo/i)
    await expect(bloque).toContainText(/señal para revisión.*no una acusación/i)

    // expandir la explicación (viene de GUIA_ALERTAS, no texto propio)
    await bloque.getByText('Qué significa').first().click()
    await expect(bloque).toContainText(/Qué se puede hacer/i)

    // cross-link navega a /casos (no abre un modal en el peek)
    await expect(page.getByTestId('peek-caso-ver-casos')).toHaveAttribute('href', '/casos')
    await page.getByTestId('peek-caso-ver-casos').click()
    await expect(page).toHaveURL(/\/casos/)
  })

  test('pedido sin casos → el peek no muestra el bloque de riesgo', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(page, { nombre: 'Peek Sin Riesgo E2E' })
    const pRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      offlineId: `peek-sinriesgo-${Date.now()}`,
    })
    const pedido = (await pRes.json()).pedido

    await page.goto(`${BASE}/pedidos?all=true`)
    await appMain(page).locator(`[data-testid="operacion-row-${pedido.id}"]`).click()
    await expect(page.getByTestId('peek-desktop')).toBeVisible()
    await expect(page.getByTestId('peek-rel-casos')).toHaveCount(0)
  })
})
