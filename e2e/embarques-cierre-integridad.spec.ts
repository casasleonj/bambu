// @tests ADR-CIERRE-002 (épica #447, Fase B) — integridad del cierre por la API real
// (sin flag): cobertura exacta de pedidos, cancelar suelta del embarque, tope de
// valores extremos y venta al paso. Verifica en la BASE, no solo la respuesta HTTP.
import type { Page } from '@playwright/test'
import { test, expect, loginAs, apiPost, createTrabajador, createCliente, BASE } from './fixtures'

async function cierreLogin(page: Page) {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  await page.route('**/api/cierre/last', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ cierre: { fecha: yesterday } }),
    })
  })
  await loginAs(page, 'admin')
}

/** Embarque EN_RUTA con 1 pedido de 3 PACA_AGUA, listo para cerrar por la UI. */
async function seedEmbarqueEnRuta(page: Page, cargadas = 3) {
  const c = await createCliente(page)
  const clienteId = c.cliente?.id || c.data?.id
  const t = await createTrabajador(page)
  const trabajadorId = t.trabajador?.id || t.data?.id
  expect(clienteId, 'cliente creado').toBeTruthy()
  expect(trabajadorId, 'trabajador creado').toBeTruthy()

  const eRes = await apiPost(page, '/api/embarques', {
    trabajadorId,
    horaSalida: '08:00',
    carga: [{ producto: 'PACA_AGUA', cargadas }],
  })
  const eData = await eRes.json()
  const embarqueId = eData.data?.id || eData.embarque?.id
  expect(embarqueId, 'embarque creado').toBeTruthy()

  const pRes = await apiPost(page, '/api/pedidos', {
    clienteId, canal: 'DOMICILIO', ventaRapida: false,
    items: [{ producto: 'PACA_AGUA', cantidad: 3 }],
  })
  const pData = await pRes.json()
  const pedidoId = pData.pedido?.id || pData.data?.id
  expect(pedidoId, 'pedido creado').toBeTruthy()

  await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
  await apiPost(page, `/api/embarques/${embarqueId}/enviar`, {})
  return { embarqueId, pedidoId }
}


test.describe('Cierre — integridad del servidor (ADR-CIERRE-002)', () => {
  test('#449: el preview y el cierre rechazan con 409 un pedido sin resolver; el embarque sigue en ruta', async ({ page }) => {
    await cierreLogin(page)
    const { embarqueId, pedidoId } = await seedEmbarqueEnRuta(page)

    for (const ruta of ['cerrar/preview', 'cerrar']) {
      const res = await apiPost(page, `/api/embarques/${embarqueId}/${ruta}`, {
        pedidos: [], productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }], dineroEntregado: 0,
      })
      expect(res.status(), ruta).toBe(409)
      const body = await res.json()
      expect(body.error?.code, ruta).toBe('PEDIDOS_SIN_RESOLVER')
      expect(JSON.stringify(body)).toContain(pedidoId)
    }

    const e = await (await page.request.get(`${BASE}/api/embarques/${embarqueId}`)).json()
    expect((e.embarque || e.data).estado).not.toBe('CERRADO')
  })

  test('#448: cancelar un pedido lo suelta del embarque y el cierre ya no lo pide', async ({ page }) => {
    await cierreLogin(page)
    const { embarqueId, pedidoId } = await seedEmbarqueEnRuta(page)

    const cancel = await apiPost(page, `/api/pedidos/${pedidoId}/cancelar`, { motivo: 'cliente desistió' })
    expect(cancel.ok()).toBe(true)

    const e = await (await page.request.get(`${BASE}/api/embarques/${embarqueId}?full=true`)).json()
    const pedidos = (e.embarque || e.data).pedidos as Array<{ id: string }>
    expect(pedidos.map((p) => p.id)).not.toContain(pedidoId)

    const res = await apiPost(page, `/api/embarques/${embarqueId}/cerrar/preview`, {
      pedidos: [], productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }], dineroEntregado: 0,
    })
    expect(res.ok()).toBe(true)
  })

  test('#444: un gasto absurdo devuelve 400 con mensaje, no 500', async ({ page }) => {
    await cierreLogin(page)
    const { embarqueId, pedidoId } = await seedEmbarqueEnRuta(page)
    const res = await apiPost(page, `/api/embarques/${embarqueId}/cerrar/preview`, {
      pedidos: [{ pedidoId, entregado: 'COMPLETO', pagado: 'NO_PAGADO', pagos: [] }],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
      gastos: [{ categoria: 'Gasolina', monto: 99_999_999_999 }],
      dineroEntregado: 0,
    })
    expect(res.status()).toBe(400)
  })

  test('#445: venta al paso sin pago completo se rechaza con 422 (DEUDOR_REQUERIDO)', async ({ page }) => {
    await cierreLogin(page)
    const { embarqueId, pedidoId } = await seedEmbarqueEnRuta(page, 10)
    const res = await apiPost(page, `/api/embarques/${embarqueId}/cerrar/preview`, {
      pedidos: [{ pedidoId, entregado: 'NO_ENTREGADO', pagado: 'NO_PAGADO', pagos: [] }],
      ventasLibres: [{ clienteId: 'CONSUMIDOR_FINAL', cPacaAgua: 2, pagos: [] }],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
      dineroEntregado: 0,
    })
    expect(res.status(), await res.text()).toBe(422)
    expect((await res.json()).error?.code).toBe('DEUDOR_REQUERIDO')
  })
})
