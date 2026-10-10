// @tests PR-1 (incidente Pedidos: edición / modalidad de entrega) — navegador real.
//
// Corre con la UI por defecto (flag NEXT_PUBLIC_PEDIDOS_V2 OFF → formulario
// legacy `PedidoFormUnified`), que es donde el usuario veía el toggle
// Punto/Domicilio al editar y recibía «Pedido actualizado» sin que se guardara.
//
//   PW_WORKERS=1 npx playwright test e2e/pedidos-edicion-contrato.spec.ts --project=chromium

import { test, expect, apiPost, apiPut, apiGet, createCliente, BASE, sharedLoginAs } from './fixtures'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const HUB_ON = process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true'

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
    await page.getByRole('button', { name: /Editar/ }).click()

    // El canal es historia: se muestra fijo, no hay forma de pedir "Domicilio".
    await expect(page.getByTestId('canal-fijo-edicion')).toBeVisible()
    await expect(page.getByTestId('canal-fijo-edicion')).toContainText('Punto de Venta')
    await expect(page.getByRole('button', { name: /^🚚 Domicilio$/ })).toHaveCount(0)

    const textarea = page.getByPlaceholder('Notas adicionales...')
    await expect(textarea).toHaveValue('nota original')
    await textarea.fill('nota editada en navegador')

    const put = page.waitForResponse((r) => r.url().endsWith(`/api/pedidos/${pedidoId}`) && r.request().method() === 'PUT')
    await page.getByTestId('submit-pedido').click()
    const res = await put
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
    await page.getByRole('button', { name: /Editar/ }).click()
    await page.getByPlaceholder('Notas adicionales...').fill('')

    const put = page.waitForResponse((r) => r.url().endsWith(`/api/pedidos/${pedidoId}`) && r.request().method() === 'PUT')
    await page.getByTestId('submit-pedido').click()
    expect((await put).status()).toBe(200)

    const fila = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })
    expect(fila.obs).toBeNull()
  })

  test('guardar sin tocar nada informa «Sin cambios» (no aparenta haber guardado)', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { pedidoId } = await crearPedidoPunto(page, 'sincambios')
    const antes = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })

    await page.goto(`${BASE}/pedidos?all=true&openPedido=${pedidoId}`)
    await page.getByRole('button', { name: /Editar/ }).click()
    const put = page.waitForResponse((r) => r.url().endsWith(`/api/pedidos/${pedidoId}`) && r.request().method() === 'PUT')
    await page.getByTestId('submit-pedido').click()
    const res = await put
    expect(res.status()).toBe(200)
    expect((await res.json()).aplicado.sinCambios).toBe(true)
    await expect(page.getByText(/Sin cambios/)).toBeVisible()

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
