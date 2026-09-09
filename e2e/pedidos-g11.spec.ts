// @tests Fase 6 — G11: corrección vs nueva demanda (docs/pedidos/fase6-g11-flujo-plan.md).
//
// La mayoría de los casos se prueban a nivel API (los endpoints funcionan con
// o sin NEXT_PUBLIC_PEDIDOS_V2). El smoke de UI del punto de decisión va
// detrás del flag:
//
//   NEXT_PUBLIC_PEDIDOS_V2=true PW_WORKERS=1 npx playwright test e2e/pedidos-g11.spec.ts
//
// Casos NO cubiertos acá (ya cubiertos por integración/unit):
//   G11-02 (corrección sobre cantidad ya entregada) — ajuste-pedido.test.ts
//   G11-07 (concurrencia: preview obsoleto no dirige la mutación) — ajuste-pedido.test.ts
//   G11-08 (Venta Libre no se crea desde el Hub) — hub-accion-frontera.test.ts

import { test, expect, apiPost, apiGet, createCliente, BASE, sharedLoginAs, appMain } from './fixtures'

const HUB_ON = process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true'

async function crearPedido(page: import('@playwright/test').Page, clienteId: string, cantidad: number, pagos: Array<{ metodo: string; monto: number }> = []) {
  const res = await apiPost(page, '/api/pedidos', {
    clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad }],
    pagos,
    offlineId: `g11-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  })
  expect(res.status()).toBe(201)
  const body = await res.json()
  return body.pedido ?? body
}

test.describe('G11 — corrección (rama A)', () => {
  test('G11-01: corrección válida antes de entrega — proyección coincide con el commit', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(page, { nombre: 'G11-01' })
    const pedido = await crearPedido(page, cliente.id, 12)
    const totalOriginal = Number(pedido.total)

    // proyección read-only
    const prevRes = await apiPost(page, `/api/pedidos/${pedido.id}/ajustar-cantidad/preview`, { producto: 'PACA_AGUA', cantidadNueva: 10 })
    expect(prevRes.status()).toBe(200)
    const prev = await prevRes.json()
    expect(prev.puedeCorregir).toBe(true)
    expect(prev.bloqueadoPor).toBeNull()
    expect(prev.cantidadOriginal).toBe(12)

    // el pedido NO cambió por la proyección
    const midRes = await apiGet(page, `/api/pedidos/${pedido.id}`)
    const mid = (await midRes.json()).pedido
    expect(Number(mid.total)).toBe(totalOriginal)

    // commit
    const commitRes = await apiPost(page, `/api/pedidos/${pedido.id}/ajustar-cantidad`, {
      producto: 'PACA_AGUA', cantidadNueva: 10, motivo: 'se capturaron 12, eran 10',
      offlineId: `g11-01-fix-${Date.now()}`,
    })
    expect(commitRes.status()).toBe(201)

    const afterRes = await apiGet(page, `/api/pedidos/${pedido.id}`)
    const after = (await afterRes.json()).pedido
    expect(Number(after.total)).toBe(prev.totalDespues)
    const item = (after.items as Array<{ producto: string; cantPedido: number }>).find((i) => i.producto === 'PACA_AGUA')
    expect(item?.cantPedido).toBe(10)
  })

  test('G11-03: pedido cerrado → 409 CORRECCION_PEDIDO_CERRADO, sin mutación', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(page, { nombre: 'G11-03' })
    const pedido = await crearPedido(page, cliente.id, 5)

    const cancel = await apiPost(page, `/api/pedidos/${pedido.id}/cancelar`, { motivo: 'test G11-03', offlineId: `g11-03-cxl-${Date.now()}` })
    // `/api/pedidos/[id]/cancelar` → apiSuccess(result) = 200 (no 201; ver la route).
    expect(cancel.status()).toBe(200)

    const res = await apiPost(page, `/api/pedidos/${pedido.id}/ajustar-cantidad`, {
      producto: 'PACA_AGUA', cantidadNueva: 3, motivo: 'intento tardío', offlineId: `g11-03-fix-${Date.now()}`,
    })
    expect(res.status()).toBe(409)
    const body = await res.json()
    expect(body.error?.code).toBe('CORRECCION_PEDIDO_CERRADO')

    // no se creó ningún pedido nuevo relacionado
    const detail = await (await apiGet(page, `/api/pedidos/${pedido.id}`)).json()
    expect(detail.pedido?.pedidosVinculados ?? []).toHaveLength(0)
  })

  test('G11-04: corrección que generaría sobrepago → 409 CORRECCION_GENERARIA_SOBREPAGO, sin mutación', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(page, { nombre: 'G11-04' })
    // sonda para conocer el total de 10 pacas
    const sonda = await crearPedido(page, cliente.id, 10)
    const total = Number(sonda.total)

    // pedido real: 10 pacas con prepago COMPLETO (sigue PENDIENTE → ANTICIPADO)
    const pedido = await crearPedido(page, cliente.id, 10, [{ metodo: 'EFECTIVO', monto: total }])
    expect(Number(pedido.totalPagado)).toBe(total)

    const prev = await (await apiPost(page, `/api/pedidos/${pedido.id}/ajustar-cantidad/preview`, { producto: 'PACA_AGUA', cantidadNueva: 3 })).json()
    expect(prev.bloqueadoPor).toBe('CORRECCION_GENERARIA_SOBREPAGO')
    expect(prev.sobrepagoProyectado).toBeGreaterThan(0)

    const res = await apiPost(page, `/api/pedidos/${pedido.id}/ajustar-cantidad`, {
      producto: 'PACA_AGUA', cantidadNueva: 3, motivo: 'bajar', offlineId: `g11-04-fix-${Date.now()}`,
    })
    expect(res.status()).toBe(409)
    expect((await res.json()).error?.code).toBe('CORRECCION_GENERARIA_SOBREPAGO')

    // sin mutación
    const after = (await (await apiGet(page, `/api/pedidos/${pedido.id}`)).json()).pedido
    expect(Number(after.total)).toBe(total)
  })
})

test.describe('G11 — nueva demanda (rama B)', () => {
  test('G11-05 + G11-06: pedido nuevo independiente con pedidoOrigenId; vínculo visible en ambos peeks; el original no cambia', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(page, { nombre: 'G11-05' })
    const original = await crearPedido(page, cliente.id, 20)
    const totalOriginal = Number(original.total)

    const ndRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }], pagos: [],
      pedidoOrigenId: original.id,
      offlineId: `g11-05-nd-${Date.now()}`,
    })
    expect(ndRes.status()).toBe(201)
    const nd = (await ndRes.json()).pedido

    expect(nd.id).not.toBe(original.id)

    // peek del ORIGINAL → ve la nueva demanda con rol "demanda".
    // `GET /api/pedidos/[id]` → `{ pedido: { …, pedidosVinculados } }` (anidado).
    const detOrig = await (await apiGet(page, `/api/pedidos/${original.id}`)).json()
    const vinculadosOrig = detOrig.pedido.pedidosVinculados as Array<{ id: string; rol: string }>
    expect(vinculadosOrig.some((v) => v.id === nd.id && v.rol === 'demanda')).toBe(true)

    // peek de la NUEVA DEMANDA → ve el origen con rol "origen"
    const detNd = await (await apiGet(page, `/api/pedidos/${nd.id}`)).json()
    const vinculadosNd = detNd.pedido.pedidosVinculados as Array<{ id: string; rol: string }>
    expect(vinculadosNd.some((v) => v.id === original.id && v.rol === 'origen')).toBe(true)

    // G11-06: corregir la nueva demanda NO toca el original
    await apiPost(page, `/api/pedidos/${nd.id}/ajustar-cantidad`, {
      producto: 'PACA_AGUA', cantidadNueva: 8, motivo: 'ajuste de la nueva demanda', offlineId: `g11-06-fix-${Date.now()}`,
    })
    const origAfter = (await (await apiGet(page, `/api/pedidos/${original.id}`)).json()).pedido
    expect(Number(origAfter.total)).toBe(totalOriginal)
    const origItem = (origAfter.items as Array<{ producto: string; cantPedido: number }>).find((i) => i.producto === 'PACA_AGUA')
    expect(origItem?.cantPedido).toBe(20)
  })
})

test.describe('G11 — punto de decisión (UI, NEXT_PUBLIC_PEDIDOS_V2)', () => {
  test.skip(!HUB_ON, 'requiere NEXT_PUBLIC_PEDIDOS_V2=true + webServer fresco')

  test('"Cambiar cantidades" → "¿Qué pasó?" ofrece exactamente 2 opciones, sin Venta Libre', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const app = appMain(page)
    const nombreCli = `G11 UI ${Date.now()}`
    const { cliente } = await createCliente(page, { nombre: nombreCli })
    await crearPedido(page, cliente.id, 6)

    await page.goto(`${BASE}/pedidos?all=true`)
    // La fila de ESTE test; `.first()` no garantiza que sea el recién creado.
    await app.locator('[data-testid^="operacion-row-"]').filter({ hasText: nombreCli }).first().click()
    await expect(page.getByTestId('peek-desktop')).toBeVisible()

    await page.getByTestId('cambio-cantidad-abrir').click()
    const decision = page.getByTestId('cambio-cantidad-decision')
    await expect(decision).toBeVisible()
    await expect(page.getByTestId('cambio-causa-correccion')).toBeVisible()
    await expect(page.getByTestId('cambio-causa-nueva-demanda')).toBeVisible()
    // "sin Venta Libre" = dentro del panel de decisión (scoped: la copia de
    // streaming SSR fuera de <main> puede contener el texto en otro contexto).
    await expect(decision.getByText(/venta libre|venta durante la ruta/i)).toHaveCount(0)

    // elegir corrección → formulario inline con motivo obligatorio
    await page.getByTestId('cambio-causa-correccion').click()
    await expect(page.getByTestId('correccion-cantidad-form')).toBeVisible()
    await expect(page.getByTestId('correccion-confirmar')).toBeDisabled()
  })
})
