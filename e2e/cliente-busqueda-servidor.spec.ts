// @tests #376 — el buscador de cliente del modal de pedido consulta el servidor
// (`/api/clientes?search=...&pageSize=8`) y NO depende de que la lista completa
// (`/api/clientes?all=true`, 8 s de timeout) haya cargado. Formulario clásico
// (el Hub comparte el hook y el panel; su spec de integración vive en pedidos-hub).
import { test, expect, loginAs, createCliente, createNegocio, apiPost, handleBaseCaja, openFabPedidoEnvio, goto } from './fixtures'
import type { Page } from '@playwright/test'

const HUB_ON = process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true'

const esListaCompleta = (url: URL) =>
  url.pathname === '/api/clientes' && url.searchParams.get('all') === 'true' && !url.searchParams.has('search')
const esBusqueda = (url: URL) => url.pathname === '/api/clientes' && url.searchParams.has('search')

async function abrirModal(page: Page) {
  await goto(page, '/pedidos')
  await handleBaseCaja(page)
  await openFabPedidoEnvio(page)
  return page.locator('input[placeholder^="Buscar cliente"]').first()
}

test.describe('Búsqueda de cliente en el servidor (#376)', () => {
  test.skip(HUB_ON, 'formulario clásico (Hub apagado, como producción)')
  test.describe.configure({ mode: 'serial' })

  test('encuentra al cliente aunque la lista completa nunca cargue', async ({ page }) => {
    test.setTimeout(90000)
    await loginAs(page, 'admin')
    const nombre = `Buscable ${Date.now() % 1000000}`
    await createCliente(page, { nombre })

    // La lista completa falla (red lenta/aborto): antes el buscador quedaba vacío.
    await page.route((url) => esListaCompleta(url), (route) => route.abort())
    const input = await abrirModal(page)
    const busqueda = page.waitForResponse((r) => esBusqueda(new URL(r.url())) && r.ok())
    await input.fill(nombre)

    await expect(page.getByTestId('cliente-search-result').filter({ hasText: nombre }).first()).toBeVisible({ timeout: 15000 })
    const url = new URL((await busqueda).url())
    expect(url.searchParams.get('pageSize')).toBe('8')
    expect(url.searchParams.has('all')).toBe(false)
  })

  test('si la búsqueda falla muestra el error y "Reintentar" la recupera', async ({ page }) => {
    test.setTimeout(90000)
    await loginAs(page, 'admin')
    const nombre = `Reintento ${Date.now() % 1000000}`
    await createCliente(page, { nombre })

    await page.route((url) => esListaCompleta(url), (route) => route.abort())
    let bloquear = true
    await page.route((url) => esBusqueda(url), (route) => (bloquear ? route.abort() : route.continue()))

    const input = await abrirModal(page)
    await input.fill(nombre)
    await expect(page.getByTestId('cliente-search-error')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('cliente-search-result')).toHaveCount(0)

    bloquear = false
    await page.getByTestId('cliente-search-retry').click()
    await expect(page.getByTestId('cliente-search-result').filter({ hasText: nombre }).first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('cliente-search-error')).toHaveCount(0)
  })
  test('la fila explica por qué coincidió: negocio, contacto con su relación y deuda (#385)', async ({ page }) => {
    test.setTimeout(120000)
    await loginAs(page, 'admin')
    const n = Date.now() % 1000000
    const nombre = `Titular${n}`
    const negocio = `Panadería Zafiro${n}`
    const contacto = `Mireya${n}`
    const { cliente } = await createCliente(page, { nombre })
    await createNegocio(page, { clienteId: cliente.id, nombre: negocio, tipoNegocio: 'Panadería' })
    const rc = await apiPost(page, `/api/clientes/${cliente.id}/contactos`, { nombre: contacto, telefono: `3188${String(n).padStart(6, '0')}`, relacion: 'hermana' })
    expect(rc.status()).toBe(201)
    // deuda: venta en punto entregada sin cobrar a un cliente real queda como fiado
    const rp = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id, canal: 'PUNTO', entregado: true, items: [{ producto: 'PACA_AGUA', cantidad: 1 }], pagos: [],
    })
    expect(rp.status()).toBe(201)

    const input = await abrirModal(page)

    // por el negocio: la fila nombra el negocio y al titular
    await input.fill(`Zafiro${n}`)
    const porNegocio = page.getByTestId('cliente-search-result').filter({ hasText: nombre }).first()
    await expect(porNegocio).toBeVisible({ timeout: 15000 })
    await expect(porNegocio.getByTestId('cliente-search-motivo')).toContainText(negocio)
    await expect(porNegocio.getByTestId('cliente-search-deuda')).toContainText('Debe')

    // por el contacto: nombre y relación
    await input.fill(contacto)
    const porContacto = page.getByTestId('cliente-search-result').filter({ hasText: nombre }).first()
    await expect(porContacto).toBeVisible({ timeout: 15000 })
    await expect(porContacto.getByTestId('cliente-search-motivo')).toContainText(contacto)
    await expect(porContacto.getByTestId('cliente-search-motivo')).toContainText('(hermana)')

    // por el nombre del titular no hay línea de motivo
    await input.fill(nombre)
    const porNombre = page.getByTestId('cliente-search-result').filter({ hasText: nombre }).first()
    await expect(porNombre).toBeVisible({ timeout: 15000 })
    await expect(porNombre.getByTestId('cliente-search-motivo')).toHaveCount(0)
  })
})
