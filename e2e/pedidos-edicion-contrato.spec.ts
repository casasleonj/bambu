// @tests PR-1 (incidente Pedidos: edición / modalidad de entrega) — navegador real.
//
// Corre con la UI por defecto (flag NEXT_PUBLIC_PEDIDOS_V2 OFF → formulario
// legacy `PedidoFormUnified`), que es donde el usuario veía el toggle
// Punto/Domicilio al editar y recibía «Pedido actualizado» sin que se guardara.
//
//   Hub OFF: PW_WORKERS=1 npx playwright test e2e/pedidos-edicion-contrato.spec.ts --project=chromium
//   Hub ON : NEXT_PUBLIC_PEDIDOS_V2=true PW_WORKERS=1 npx playwright test e2e/pedidos-edicion-contrato.spec.ts --project=chromium
//   (con webServer fresco: el flag se inlinea en el build del cliente)

import { test, expect, apiPost, apiPut, apiGet, createCliente, createTrabajador, createEmbarque, BASE, sharedLoginAs } from './fixtures'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// `next dev` compila rutas bajo demanda: la primera visita puede tardar.
test.setTimeout(120_000)
const HUB_ON = process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true'

/** El formulario recalcula precios al abrir: clicar antes de que el total sea > 0 da «Agrega al menos un producto». */
async function esperarFormularioListo(page: Parameters<typeof apiPost>[0]) {
  await expect(page.getByTestId('submit-pedido')).toContainText(/\$\s?[1-9]/, { timeout: 20000 })
  await expect(page.getByTestId('submit-pedido')).toBeEnabled()
}

/**
 * Envía el formulario legacy y devuelve la respuesta del PUT. Si el formulario aún
 * está recalculando precios, el submit responde «Espera a que se actualicen los
 * precios…» sin llamar al servidor (comportamiento intencional): se reintenta.
 */
async function enviarYEsperarPut(page: Parameters<typeof apiPost>[0], pedidoId: string) {
  for (let intento = 0; intento < 5; intento++) {
    await esperarFormularioListo(page)
    const put = page.waitForResponse(
      (r) => r.url().endsWith(`/api/pedidos/${pedidoId}`) && r.request().method() === 'PUT',
      { timeout: 6000 },
    ).catch(() => null)
    await page.getByTestId('submit-pedido').click()
    const res = await put
    if (res) return res
  }
  throw new Error('El formulario no llegó a enviar el PUT tras 5 intentos')
}

/** Idem para el caso «nada que guardar»: el aviso es «Sin cambios» y NO hay PUT. */
async function enviarYEsperarSinCambios(page: Parameters<typeof apiPost>[0]) {
  for (let intento = 0; intento < 5; intento++) {
    await esperarFormularioListo(page)
    await page.getByTestId('submit-pedido').click()
    const visible = await page.getByText(/Sin cambios/).first().waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)
    if (visible) return
  }
  throw new Error('No apareció el aviso «Sin cambios» tras 5 intentos')
}

async function crearPedidoPunto(page: Parameters<typeof apiPost>[0], tag: string) {
  const { cliente } = await createCliente(page, { nombre: `Edicion ${tag} ${Date.now()}` })
  const res = await apiPost(page, '/api/pedidos', {
    clienteId: cliente.id, canal: 'PUNTO', origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
    obs: 'nota original',
    offlineId: `edicion-e2e-${tag}-${Date.now()}`,
  })
  expect(res.status()).toBe(201)
  const body = await res.json()
  return { cliente, pedidoId: (body.data?.pedido ?? body.pedido).id as string }
}

test.describe('Edición de pedidos: el canal no se ofrece y nada aparenta guardarse', () => {
  test.skip(HUB_ON, 'este bloque valida el formulario legacy (flag Hub OFF)')

  test('editar un PUNTO: sin toggle de canal; cambiar la observación se guarda y el aviso dice qué se aplicó', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { pedidoId } = await crearPedidoPunto(page, 'obs')

    await page.goto(`${BASE}/pedidos?all=true&openPedido=${pedidoId}`)
    await page.getByRole('button', { name: /✏️ Editar/ }).click()

    // El canal es historia: se muestra fijo, no hay forma de pedir "Domicilio".
    await expect(page.getByTestId('canal-fijo-edicion')).toBeVisible()
    await expect(page.getByTestId('canal-fijo-edicion')).toContainText('Punto de Venta')
    await expect(page.getByRole('button', { name: /^🚚 Domicilio$/ })).toHaveCount(0)

    const textarea = page.getByPlaceholder('Notas adicionales...')
    await expect(textarea).toHaveValue('nota original')
    await textarea.fill('nota editada en navegador')

    const res = await enviarYEsperarPut(page, pedidoId)
    expect(res.status()).toBe(200)
    expect((await res.json()).aplicado).toEqual({ campos: ['obs'], sinCambios: false })
    await expect(page.getByText(/Pedido actualizado \(obs\)/)).toBeVisible()

    const fila = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })
    expect(fila.obs).toBe('nota editada en navegador')
    expect(fila.canal).toBe('PUNTO')
  })

  test('borrar la observación en el formulario la borra en la base de datos', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { pedidoId } = await crearPedidoPunto(page, 'borrar')

    await page.goto(`${BASE}/pedidos?all=true&openPedido=${pedidoId}`)
    await page.getByRole('button', { name: /✏️ Editar/ }).click()
    await page.getByPlaceholder('Notas adicionales...').fill('')

    expect((await enviarYEsperarPut(page, pedidoId)).status()).toBe(200)

    const fila = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })
    expect(fila.obs).toBeNull()
  })

  test('guardar sin tocar nada informa «Sin cambios» y no llama al servidor (no aparenta haber guardado)', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { pedidoId } = await crearPedidoPunto(page, 'sincambios')
    const antes = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })

    await page.goto(`${BASE}/pedidos?all=true&openPedido=${pedidoId}`)
    await page.getByRole('button', { name: /✏️ Editar/ }).click()
    let puts = 0
    page.on('request', (r) => { if (r.method() === 'PUT' && r.url().endsWith(`/api/pedidos/${pedidoId}`)) puts += 1 })
    await enviarYEsperarSinCambios(page)
    expect(puts).toBe(0)

    const despues = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })
    expect(despues.updatedAt.getTime()).toBe(antes.updatedAt.getTime())
  })

  test('API: pedir cambiar el canal por PUT se rechaza con 422 y explica la vía formal; el canal no cambia', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { pedidoId } = await crearPedidoPunto(page, 'canal')

    const res = await apiPut(page, `/api/pedidos/${pedidoId}`, { canal: 'DOMICILIO', obs: 'no debe aplicarse' })
    expect(res.status()).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('CAMPO_NO_SOPORTADO')
    expect(body.error.fieldErrors.canal[0]).toMatch(/corrección formal/)

    const detalle = await (await apiGet(page, `/api/pedidos/${pedidoId}`)).json()
    expect(detalle.pedido.canal).toBe('PUNTO')
    expect(detalle.pedido.obs).toBe('nota original') // ni siquiera la parte válida se aplicó
  })

  test('API: dirección de entrega SIN items se guarda (antes: 200 sin efecto)', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(page, { nombre: `Dir ${Date.now()}` })
    const creado = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }], offlineId: `edicion-dir-${Date.now()}`,
    })
    const cuerpo = await creado.json()
    const pedidoId = (cuerpo.data?.pedido ?? cuerpo.pedido)?.id as string
    expect(pedidoId).toBeTruthy()

    const res = await apiPut(page, `/api/pedidos/${pedidoId}`, { direccionEntrega: 'Carrera 7 # 8-9', barrioEntrega: 'Nuevo' })
    expect(res.status()).toBe(200)
    const fila = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })
    expect(fila.direccionEntrega).toBe('Carrera 7 # 8-9')
    expect(fila.barrioEntrega).toBe('Nuevo')
  })
})

const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8Af//Z'

/** Pedido DOMICILIO de 2 unidades con 1 ya entregada: queda PENDIENTE con cantEntrega>0 (entrega parcial). */
async function crearPedidoParcial(page: Parameters<typeof apiPost>[0], tag: string) {
  const { cliente } = await createCliente(page, { nombre: `Parcial ${tag} ${Date.now()}` })
  const creado = await apiPost(page, '/api/pedidos', {
    clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', obs: 'nota original',
    items: [{ producto: 'PACA_AGUA', cantidad: 2 }], offlineId: `parcial-e2e-${tag}-${Date.now()}`,
  })
  expect(creado.status()).toBe(201)
  const cuerpo = await creado.json()
  const pedidoId = (cuerpo.data?.pedido ?? cuerpo.pedido).id as string
  const trabajador = await createTrabajador(page)
  const embarque = await createEmbarque(page, trabajador.trabajador.id)
  expect((await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId: embarque.embarque.id })).status()).toBeLessThan(300)
  const entrega = await apiPost(page, `/api/pedidos/${pedidoId}/entrega`, {
    itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 1 }], fotoEntrega: FOTO, entregadoConGps: false, gpsJustificacion: 'e2e',
  })
  expect(entrega.status()).toBe(200)
  const fila = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { items: true } })
  expect(fila.estadoEntrega).toBe('PENDIENTE')
  expect(fila.items[0].cantEntrega).toBe(1)
  return { pedidoId, embarqueId: embarque.embarque.id as string }
}

test.describe('Entrega parcial: editar información no depende de los ítems (Hub OFF)', () => {
  test.skip(HUB_ON, 'formulario legacy (flag Hub OFF)')

  test('cambiar la observación de un pedido con entrega parcial se guarda (antes: 409 por reenviar ítems)', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { pedidoId } = await crearPedidoParcial(page, 'obs')
    await page.goto(`${BASE}/pedidos?all=true&openPedido=${pedidoId}`)
    await page.getByRole('button', { name: /✏️ Editar/ }).click()
    await page.getByPlaceholder('Notas adicionales...').fill('nota con entrega parcial')
    const res = await enviarYEsperarPut(page, pedidoId)
    expect(res.status()).toBe(200)
    expect((await res.json()).aplicado.campos).toEqual(['obs'])
    const fila = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { items: true } })
    expect(fila.obs).toBe('nota con entrega parcial')
    expect(fila.items[0].cantEntrega).toBe(1) // la entrega no se tocó
  })

  test('guardar sin cambios un pedido parcial dice «Sin cambios» y NO llama al servidor', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { pedidoId } = await crearPedidoParcial(page, 'nada')
    await page.goto(`${BASE}/pedidos?all=true&openPedido=${pedidoId}`)
    await page.getByRole('button', { name: /✏️ Editar/ }).click()
    let puts = 0
    page.on('request', (r) => { if (r.method() === 'PUT' && r.url().endsWith(`/api/pedidos/${pedidoId}`)) puts += 1 })
    await enviarYEsperarSinCambios(page)
    expect(puts).toBe(0)
  })

  test('cambiar CANTIDADES de un pedido con entrega parcial se rechaza con el mensaje correcto y no cambia nada', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { pedidoId } = await crearPedidoParcial(page, 'cant')
    await page.goto(`${BASE}/pedidos?all=true&openPedido=${pedidoId}`)
    await page.getByRole('button', { name: /✏️ Editar/ }).click()
    await page.locator('[data-testid$="-inc-PACA_AGUA"]').first().click()
    const res = await enviarYEsperarPut(page, pedidoId)
    expect(res.status()).toBe(409)
    expect((await res.json()).error.code).toBe('CANTIDAD_YA_ENTREGADA_USE_AJUSTAR_CANTIDAD')
    await expect(page.getByText(/corrección de cantidad/)).toBeVisible()
    const fila = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { items: true } })
    expect(fila.items[0].cantPedido).toBe(2)
  })
})

test.describe('Entrega parcial: editar cantidades se rechaza con claridad (Hub ON)', () => {
  test.skip(!HUB_ON, 'requiere NEXT_PUBLIC_PEDIDOS_V2=true + webServer fresco')

  test('el workspace no deja "guardar" un cambio de cantidades sobre un pedido con entrega y lo explica', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { pedidoId } = await crearPedidoParcial(page, 'hub')
    await page.goto(`${BASE}/pedidos?all=true&openPedido=${pedidoId}`)
    await page.getByRole('button', { name: /✏️ Editar/ }).click()
    await expect(page.getByTestId('pedidos-workspace')).toBeVisible()
    await expect(page.getByTestId('workspace-canal-fijo')).toBeVisible()
    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })
    const put = page.waitForResponse((r) => r.url().endsWith(`/api/pedidos/${pedidoId}`) && r.request().method() === 'PUT')
    await page.getByTestId('workspace-commit').click()
    const res = await put
    expect(res.status()).toBe(409)
    expect((await res.json()).error.code).toBe('CANTIDAD_YA_ENTREGADA_USE_AJUSTAR_CANTIDAD')
    await expect(page.getByText(/corrección de cantidad/)).toBeVisible()
    const fila = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { items: true } })
    expect(fila.items[0].cantPedido).toBe(2)
  })

  test('el workspace guarda un cambio de cantidades en un pedido SIN entregas (flujo normal intacto)', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(page, { nombre: `HubNormal ${Date.now()}` })
    const creado = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: [{ producto: 'PACA_AGUA', cantidad: 3 }], offlineId: `hub-normal-${Date.now()}`,
    })
    const cuerpo = await creado.json()
    const pedidoId = (cuerpo.data?.pedido ?? cuerpo.pedido).id as string
    await page.goto(`${BASE}/pedidos?all=true&openPedido=${pedidoId}`)
    await page.getByRole('button', { name: /✏️ Editar/ }).click()
    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })
    const put = page.waitForResponse((r) => r.url().endsWith(`/api/pedidos/${pedidoId}`) && r.request().method() === 'PUT')
    await page.getByTestId('workspace-commit').click()
    const res = await put
    expect(res.status()).toBe(200)
    expect((await res.json()).aplicado.campos).toEqual(['items'])
    expect((await prisma.pedidoItem.findFirstOrThrow({ where: { pedidoId } })).cantPedido).toBe(4)
  })
})

test.describe('Transiciones críticas: ni el PUT ni la UI las ejecutan por atajo', () => {
  test('API: PUT con cualquier estado distinto del actual se rechaza (409 OPERACION_ESPECIALIZADA) y el pedido no cambia', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { pedidoId } = await crearPedidoPunto(page, 'atajo')
    for (const estado of ['CANCELADO', 'ENTREGADO', 'EN_RUTA', 'NO_ENTREGADO']) {
      const res = await apiPut(page, `/api/pedidos/${pedidoId}`, { estado })
      expect(res.status()).toBe(409)
      expect((await res.json()).error.code).toBe('OPERACION_ESPECIALIZADA')
    }
    expect((await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })).estadoEntrega).toBe('PENDIENTE')
  })

  test('UI: «Volver a Pendiente» de un pedido EN_RUTA quita el pedido del embarque (operación especializada)', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(page, { nombre: `UiVuelve ${Date.now()}` })
    const creado = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], offlineId: `ui-vuelve-${Date.now()}`,
    })
    const cuerpo = await creado.json()
    const pedidoId = (cuerpo.data?.pedido ?? cuerpo.pedido).id as string
    const trabajador = await createTrabajador(page)
    const embarque = await createEmbarque(page, trabajador.trabajador.id)
    expect((await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId: embarque.embarque.id })).status()).toBeLessThan(300)

    await page.goto(`${BASE}/pedidos?all=true&openPedido=${pedidoId}`)
    const del = page.waitForResponse((r) => r.url().includes(`/api/embarques/${embarque.embarque.id}/pedidos/${pedidoId}`) && r.request().method() === 'DELETE')
    await page.getByRole('button', { name: /Volver a Pendiente/ }).click()
    expect((await del).status()).toBe(200)
    const fila = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })
    expect(fila.estadoEntrega).toBe('PENDIENTE')
    expect(fila.embarqueId).toBeNull()
  })

  test('UI: «Marcar Entregado» de un pedido EN_RUTA usa la entrega especializada (cantidades, GPS) y lo deja ENTREGADO', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { cliente } = await createCliente(page, { nombre: `UiEntrega ${Date.now()}` })
    const creado = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: [{ producto: 'PACA_AGUA', cantidad: 2 }], offlineId: `ui-entrega-${Date.now()}`,
    })
    const cuerpo = await creado.json()
    const pedidoId = (cuerpo.data?.pedido ?? cuerpo.pedido).id as string
    const trabajador = await createTrabajador(page)
    const embarque = await createEmbarque(page, trabajador.trabajador.id)
    expect((await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId: embarque.embarque.id })).status()).toBeLessThan(300)

    // Determinista en cualquier runner: no depende del proveedor de geolocalización
    // del navegador headless ni de la foto de entrega (Config de la BD de test).
    await prisma.config.upsert({ where: { clave: 'REQUIERE_FOTO_ENTREGA' }, update: { valor: 'false' }, create: { clave: 'REQUIERE_FOTO_ENTREGA', valor: 'false' } })
    await page.addInitScript(() => {
      const posicion = { coords: { latitude: 4.711, longitude: -74.0721, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() }
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (ok: (p: unknown) => void) => { setTimeout(() => ok(posicion), 0) },
          watchPosition: () => 0,
          clearWatch: () => undefined,
        },
      })
    })
    await page.goto(`${BASE}/pedidos?all=true&openPedido=${pedidoId}`)
    const entregaRes = page.waitForResponse((r) => r.url().endsWith(`/api/pedidos/${pedidoId}/entrega`) && r.request().method() === 'POST')
    await page.getByRole('button', { name: /Marcar Entregado/ }).click()
    // La captura de GPS es parte de la entrega especializada (antes el PUT la saltaba).
    await expect(page.getByText('GPS capturado')).toBeVisible({ timeout: 20000 })
    await page.getByTestId('gps-confirmar').click()
    const respuesta = await entregaRes
    expect(respuesta.status(), `POST /entrega -> ${await respuesta.text()}`).toBeLessThan(300)
    await expect.poll(async () => (await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })).estadoEntrega, { timeout: 15000 }).toBe('ENTREGADO')
    const fila = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { items: true } })
    expect(fila.items[0].cantEntrega).toBe(2)
  })
})
