// @tests F-ENTREGA (docs/pedidos/entrega-suficiencia-plan.md): para un Pedido
// DOMICILIO el sistema exige información SUFICIENTE, no dirección+barrio
// universal. La matriz fina está en los unit + integración; acá se verifica
// el contrato de API (422) y el flujo real del workspace.
//
//   NEXT_PUBLIC_PEDIDOS_V2=true PW_WORKERS=1 npx playwright test e2e/pedidos-entrega-suficiencia.spec.ts

import { test, expect, apiPost, apiGet, createClienteFull, BASE, sharedLoginAs, appMain } from './fixtures'

const HUB_ON = process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true'
const ITEMS = [{ producto: 'PACA_AGUA', cantidad: 3 }]

async function cliente(page: import('@playwright/test').Page, over: Record<string, unknown>) {
  const r = await createClienteFull(page, {
    nombre: `Entrega ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    telefono: `3${String(Date.now()).slice(-9)}`,
    ...over,
  } as never)
  return r.cliente ?? r
}

test.describe('F-ENTREGA — suficiencia de información de entrega (API)', () => {
  test('DOMICILIO con solo barrio → preview INSUFICIENTE y POST /api/pedidos → 422', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const c = await cliente(page, { barrio: 'Kennedy' }) // sin direccion, sin link

    const prev = await (await apiPost(page, '/api/pedidos/preview', {
      clienteId: c.id, canal: 'DOMICILIO', items: ITEMS,
    })).json()
    expect(prev.entrega.estado).toBe('INSUFICIENTE')
    expect(prev.permissions.canCreate).toBe(false)

    const res = await apiPost(page, '/api/pedidos', {
      clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: ITEMS,
      offlineId: `entrega-block-${Date.now()}`,
    })
    expect(res.status()).toBe(422)
    expect((await res.json()).error?.code).toBe('ENTREGA_INSUFICIENTE')
  })

  test('DOMICILIO con dirección (sin barrio) → preview permite crear y POST 201', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const c = await cliente(page, { direccion: 'Cra 15 # 30-20' }) // sin barrio

    const prev = await (await apiPost(page, '/api/pedidos/preview', {
      clienteId: c.id, canal: 'DOMICILIO', items: ITEMS,
    })).json()
    expect(prev.entrega.via).toBe('TEXTO')
    expect(prev.permissions.canCreate).toBe(true)

    const res = await apiPost(page, '/api/pedidos', {
      clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: ITEMS,
      offlineId: `entrega-txt-${Date.now()}`,
    })
    expect(res.status()).toBe(201)
  })

  test('DOMICILIO con solo ubicación geográfica (link → geocode) → COMPLEMENTARIA, deja crear', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const c = await cliente(page, { linkUbicacion: 'https://www.google.com/maps/@4.6510,-74.0540,17z' })

    // backfill de coords desde el link
    const geo = await apiPost(page, `/api/clientes/${c.id}/geocode`, {})
    expect(geo.status()).toBeLessThan(300)
    const check = await (await apiGet(page, `/api/clientes/${c.id}`)).json()
    const cliRow = check.cliente ?? check
    test.skip(cliRow.lat == null, 'el geocode del link no resolvió coords en este entorno')

    const prev = await (await apiPost(page, '/api/pedidos/preview', {
      clienteId: c.id, canal: 'DOMICILIO', items: ITEMS,
    })).json()
    expect(prev.entrega.via).toBe('GEO')
    expect(prev.entrega.estado).toBe('SUFICIENTE_COMPLEMENTARIA_FALTANTE')
    expect(prev.permissions.canCreate).toBe(true)

    const res = await apiPost(page, '/api/pedidos', {
      clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: ITEMS,
      offlineId: `entrega-geo-${Date.now()}`,
    })
    expect(res.status()).toBe(201)
  })

  test('PUNTO nunca bloquea aunque falte todo', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const c = await cliente(page, {}) // sin nada

    const prev = await (await apiPost(page, '/api/pedidos/preview', {
      clienteId: c.id, canal: 'PUNTO', items: ITEMS,
    })).json()
    expect(prev.entrega.estado).toBe('SUFICIENTE')
    expect(prev.permissions.canCreate).toBe(true)
  })
})

test.describe('F-ENTREGA — workspace adaptativo (NEXT_PUBLIC_PEDIDOS_V2)', () => {
  test.skip(!HUB_ON, 'requiere NEXT_PUBLIC_PEDIDOS_V2=true + webServer fresco')

  test('cliente con solo barrio → zona INSUFICIENTE, inputs visibles, commit deshabilitado', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await cliente(page, { barrio: 'Kennedy', nombre: 'Entrega Insuf UI' })

    await page.goto(`${BASE}/pedidos`)
    await appMain(page).getByTestId('fab-main').click()
    await page.getByTestId('fab-pedido-envio').click()
    await expect(page.getByTestId('pedidos-workspace')).toBeVisible()
    await page.getByTestId('cliente-search-input').fill('Entrega Insuf UI')
    await page.getByTestId('cliente-search-result').first().click()
    await page.getByTestId('workspace-inc-PACA_AGUA').click()

    await expect(page.getByTestId('workspace-entrega-insuficiente')).toBeVisible({ timeout: 6000 })
    await expect(page.getByTestId('workspace-entrega-direccion')).toBeVisible()
    await expect(page.getByTestId('workspace-commit')).toBeDisabled()
    // el panel legacy ya no pide "Dirección *"
    await expect(page.getByPlaceholder('Dirección *')).toHaveCount(0)
  })

  test('cliente con dirección → zona SUFICIENTE compacta, commit habilitado', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await cliente(page, { direccion: 'Cra 7 # 40-15', barrio: 'Centro', nombre: 'Entrega OK UI' })

    await page.goto(`${BASE}/pedidos`)
    await appMain(page).getByTestId('fab-main').click()
    await page.getByTestId('fab-pedido-envio').click()
    await page.getByTestId('cliente-search-input').fill('Entrega OK UI')
    await page.getByTestId('cliente-search-result').first().click()
    await page.getByTestId('workspace-inc-PACA_AGUA').click()

    await expect(page.getByTestId('workspace-entrega')).toHaveAttribute('data-estado', 'SUFICIENTE', { timeout: 6000 })
    await expect(page.getByTestId('workspace-entrega-direccion')).toHaveCount(0)
    await expect(page.getByTestId('workspace-commit')).toBeEnabled()
  })
})
