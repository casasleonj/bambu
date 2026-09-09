// @tests Fase 8 F8-i/ii/iii (docs/pedidos/fase8-recurrentes-flujo-plan.md):
// "Recurrente" no es nav; "Solo habituales" = origen RECURRENTE; "esto se
// repite" post-commit; "Ajustar" desde el peek. API + UI (gated).
//
//   NEXT_PUBLIC_PEDIDOS_V2=true PW_WORKERS=1 npx playwright test e2e/pedidos-hub-recurrentes.spec.ts

import { test, expect, apiPost, apiGet, apiPut, createCliente, BASE, sharedLoginAs } from './fixtures'

const HUB_ON = process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true'

test.describe('F8 — recurrentes en el Hub (API)', () => {
  test('F8-0/Q1: ASISTENTE puede crear y ajustar un pedido habitual', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'asistente')
    const { cliente } = await createCliente(page, { nombre: `Habitual API ${Date.now()}` })

    const crear = await apiPost(page, '/api/recurrentes', {
      clienteId: cliente.id, canal: 'DOMICILIO', cadaNDias: 7,
      productos: { pacaAgua: 20, botellon: 4 },
    })
    expect(crear.status()).toBe(201)
    const rec = (await crear.json()).recurrente

    const ajustar = await apiPut(page, `/api/recurrentes?id=${rec.id}`, { cadaNDias: 14, activo: false })
    expect(ajustar.status()).toBeLessThan(300)
    const list = await (await apiGet(page, `/api/recurrentes?clienteId=${cliente.id}`)).json()
    // pausada → activo:false; GET solo trae activas → lista vacía
    expect(list.recurrentes).toHaveLength(0)
  })

  test('F8-0/Q4: XOR cliente/negocio — ambos → 400; ninguno → 400', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(page, { nombre: `XOR ${Date.now()}` })
    const ambos = await apiPost(page, '/api/recurrentes', { clienteId: cliente.id, negocioId: 'x', productos: { pacaAgua: 3 } })
    expect(ambos.status()).toBe(400)
    const ninguno = await apiPost(page, '/api/recurrentes', { productos: { pacaAgua: 3 } })
    expect(ninguno.status()).toBe(400)
  })

  test('F8-0/Q5: segunda recurrencia para el mismo cliente → 409 (no se auto-actualiza)', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(page, { nombre: `Dup ${Date.now()}` })
    await apiPost(page, '/api/recurrentes', { clienteId: cliente.id, canal: 'DOMICILIO', cadaNDias: 7, productos: { pacaAgua: 5 } })
    const dup = await apiPost(page, '/api/recurrentes', { clienteId: cliente.id, canal: 'DOMICILIO', cadaNDias: 30, productos: { pacaAgua: 10 } })
    expect(dup.status()).toBe(409)
  })

  test('F8-i: "Solo habituales" (?conRecurrencia) trae solo pedidos origen RECURRENTE', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(page, { nombre: `Solo hab ${Date.now()}` })
    await apiPost(page, '/api/recurrentes', { clienteId: cliente.id, canal: 'DOMICILIO', cadaNDias: 7, productos: { pacaAgua: 5 } })
    // pedido normal para el cliente con recurrencia
    const normal = await (await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: [{ producto: 'PACA_AGUA', cantidad: 5 }],
      offlineId: `f8i-normal-${Date.now()}`,
    })).json()

    const res = await (await apiGet(page, `/api/pedidos?all=true&conRecurrencia=true&clienteId=${cliente.id}`)).json()
    const ids = (res.pedidos ?? res.data ?? []).map((p: { id: string }) => p.id)
    expect(ids).not.toContain(normal.pedido?.id ?? normal.id)
  })
})

test.describe('F8 — recurrentes en el Hub (UI, NEXT_PUBLIC_PEDIDOS_V2)', () => {
  test.skip(!HUB_ON, 'requiere NEXT_PUBLIC_PEDIDOS_V2=true + webServer fresco')

  test('el nav no tiene "Recurrentes" como sub-sección de Pedidos', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await page.goto(`${BASE}/pedidos`)
    await expect(page.getByRole('link', { name: 'Únicos' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Recurrentes' })).toHaveCount(0)
  })

  test('faceta "Solo habituales" visible en el Hub', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await page.goto(`${BASE}/pedidos?all=true`)
    await expect(page.getByTestId('faceta-habituales')).toBeVisible()
    await page.getByTestId('faceta-habituales').click()
    await expect(page).toHaveURL(/conRecurrencia=true/)
  })

  test('F8-iv: "Generar habituales de hoy" — CTA solo si hay pendientes; genera con decisión', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(page, { nombre: `Gen hoy ${Date.now()}` })
    // recurrencia con proxGeneracion en el pasado → aparece en el preview de hoy
    const rec = await apiPost(page, '/api/recurrentes', {
      clienteId: cliente.id, canal: 'DOMICILIO', cadaNDias: 7, productos: { pacaAgua: 20 },
      proxGeneracion: new Date(Date.now() - 86400000).toISOString(),
    })
    expect(rec.status()).toBe(201)

    await page.goto(`${BASE}/pedidos?all=true`)
    const cta = page.getByTestId('recurrentes-del-dia-cta')
    await expect(cta).toBeVisible({ timeout: 6000 })
    await cta.click()
    await expect(page.getByTestId('recurrentes-del-dia-panel')).toBeVisible()
    await page.getByTestId('recurrentes-del-dia-generar').click()
    // un pedido origen RECURRENTE queda para ese cliente
    await expect(async () => {
      const r = await (await apiGet(page, `/api/pedidos?all=true&conRecurrencia=true&clienteId=${cliente.id}`)).json()
      expect((r.pedidos ?? r.data ?? []).length).toBeGreaterThan(0)
    }).toPass({ timeout: 10000 })
  })
})
