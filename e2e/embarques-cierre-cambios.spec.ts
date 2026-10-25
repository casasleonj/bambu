// @tests #446 (épica #447, Fase C) — «cambios» del cierre = Σ sustituciones, por la API real
// (sin flag: el cliente V2 manda `cambiosDesdeSustituciones`).
import type { Page } from '@playwright/test'
import { test, expect, loginAs, apiPost, createTrabajador, createCliente } from './fixtures'

async function cierreLogin(page: Page) {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  await page.route('**/api/cierre/last', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cierre: { fecha: yesterday } }) })
  })
  await loginAs(page, 'admin')
}

async function seedEmbarqueEnRuta(page: Page) {
  const c = await createCliente(page)
  const clienteId = c.cliente?.id || c.data?.id
  const t = await createTrabajador(page)
  const trabajadorId = t.trabajador?.id || t.data?.id
  expect(clienteId && trabajadorId).toBeTruthy()
  const eRes = await apiPost(page, '/api/embarques', { trabajadorId, horaSalida: '08:00', carga: [{ producto: 'PACA_AGUA', cargadas: 5 }] })
  const eData = await eRes.json()
  const embarqueId = eData.data?.id || eData.embarque?.id
  const pRes = await apiPost(page, '/api/pedidos', { clienteId, canal: 'DOMICILIO', ventaRapida: false, items: [{ producto: 'PACA_AGUA', cantidad: 3 }] })
  const pData = await pRes.json()
  const pedidoId = pData.pedido?.id || pData.data?.id
  await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
  await apiPost(page, `/api/embarques/${embarqueId}/enviar`, {})
  return { embarqueId, pedidoId, clienteId }
}

const cuerpo = (pedidoId: string, cambios: number) => ({
  pedidos: [{ pedidoId, entregado: 'NO_ENTREGADO', pagado: 'NO_PAGADO', pagos: [] }],
  productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios, rotas: 0 }],
  cambiosDesdeSustituciones: true,
  dineroEntregado: 0,
})

test.describe('Cierre — cambios = Σ sustituciones (#446)', () => {
  test('cambios tecleados sin sustitución registrada → 409 CAMBIOS_NO_COINCIDEN (preview y cierre)', async ({ page }) => {
    await cierreLogin(page)
    const { embarqueId, pedidoId } = await seedEmbarqueEnRuta(page)
    for (const ruta of ['cerrar/preview', 'cerrar']) {
      const res = await apiPost(page, `/api/embarques/${embarqueId}/${ruta}`, cuerpo(pedidoId, 3))
      expect(res.status(), ruta + ' ' + (await res.text())).toBe(409)
      expect((await res.json()).error?.code, ruta).toBe('CAMBIOS_NO_COINCIDEN')
    }
  })

  test('una sustitución a un cliente sin pedido exige motivo; con motivo cuenta y el preview la acepta con señal', async ({ page }) => {
    await cierreLogin(page)
    const { embarqueId, pedidoId, clienteId } = await seedEmbarqueEnRuta(page)

    const sinMotivo = await apiPost(page, `/api/embarques/${embarqueId}/sustituciones`, { producto: 'PACA_AGUA', cantidad: 1, clienteId })
    expect(sinMotivo.status()).toBe(400)

    const ok = await apiPost(page, `/api/embarques/${embarqueId}/sustituciones`, {
      producto: 'PACA_AGUA', cantidad: 1, clienteId, motivo: 'botella con fuga',
    })
    expect(ok.status()).toBe(201)

    const preview = await apiPost(page, `/api/embarques/${embarqueId}/cerrar/preview`, cuerpo(pedidoId, 1))
    expect(preview.ok()).toBe(true)
    const body = await preview.json()
    const senales = (body.senales ?? body.data?.senales ?? []) as Array<{ codigo: string }>
    expect(senales.map((s) => s.codigo)).toContain('CAMBIO_A_CLIENTE_SIN_PEDIDO')
  })
})
