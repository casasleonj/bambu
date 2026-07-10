// @tests e2e/negocios-crud
// Admin CRUD de negocios desde /clientes, todos los contextos UI:
// crear, ver detalle, editar desde detalle, editar desde card,
// link "Ver pedidos", eliminar, y bloqueo de eliminación con pedidos.

import { test, expect } from '@playwright/test'
import { fullLogin, createCliente, createNegocio, apiPost, goto, waitForToast, resetDatabase } from './fixtures'

test.describe('Negocios CRUD UI - admin', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    resetDatabase()
  })

  test.beforeEach(async ({ page }) => {
    await fullLogin(page)
  })

  test('crear negocio desde detalle de cliente', async ({ page }) => {
    const { cliente } = await createCliente(page, { nombre: 'Cliente Negocio UI', telefono: '3000000001' })
    await goto(page, `/clientes?openCliente=${cliente.id}`)

    await expect(page.getByRole('heading', { name: 'Cliente Negocio UI' })).toBeVisible()

    // Click "Agregar" in the Negocios section
    await page.getByRole('button', { name: 'Agregar' }).first().click()

    // Fill the negocio form
    await page.locator('input[placeholder="Ej: Restaurante El Sabor"]').fill('Restaurante El Sabor')

    // Tipo de negocio combobox
    await page.locator('input[placeholder="Buscar tipo de negocio..."]').click()
    await page.locator('input[placeholder="Buscar tipo de negocio..."]').fill('Tienda')
    await page.getByRole('option', { name: 'Tienda' }).or(page.locator('text=Tienda').first()).click()

    await page.locator('textarea[placeholder="Calle, número, referencias..."]').fill('Calle 123 # 45-67')
    await page.locator('input[placeholder="Ej: Centro"]').fill('Centro')
    await page.locator('input[type="time"]').fill('08:30')
    await page.locator('input[placeholder="https://maps.google.com/?q=..."]').fill('https://maps.google.com/?q=test')

    await page.getByRole('button', { name: /Crear negocio/ }).click()
    await waitForToast(page, 'Negocio creado')

    // Card should appear in the negocios list
    await expect(page.getByRole('button', { name: 'Ver detalle de Restaurante El Sabor' })).toBeVisible()
    await expect(page.getByText('Restaurante El Sabor')).toBeVisible()
    await expect(page.getByText('Tienda', { exact: true })).toBeVisible()
    await expect(page.getByText('Calle 123 # 45-67')).toBeVisible()
    await expect(page.getByText('Abre a las 08:30')).toBeVisible()
  })

  test('regresion: formulario de edicion carga datos al cambiar de negocio', async ({ page }) => {
    // Regression for stale state: NegocioForm is mounted once and reused.
    // Opening create first, then editing two different negocios must show
    // the correct data each time.
    const { cliente } = await createCliente(page, { nombre: 'Cliente Stale Regression', telefono: '3000000008' })
    const { negocio: negA } = await createNegocio(page, {
      clienteId: cliente.id,
      nombre: 'Negocio Alfa',
      tipoNegocio: 'Tienda',
      direccion: 'Dir Alfa',
      barrio: 'Barrio Alfa',
      horaApertura: '07:00',
    })
    const { negocio: negB } = await createNegocio(page, {
      clienteId: cliente.id,
      nombre: 'Negocio Beta',
      tipoNegocio: 'Restaurante',
      direccion: 'Dir Beta',
      barrio: 'Barrio Beta',
      horaApertura: '09:00',
    })

    await goto(page, `/clientes?openCliente=${cliente.id}`)

    // 1. Open create form first to mount the component with editData=null
    await page.getByRole('button', { name: 'Agregar' }).first().click()
    await expect(page.getByRole('heading', { name: 'Nuevo Negocio' })).toBeVisible()
    await expect(page.locator('input[placeholder="Ej: Restaurante El Sabor"]')).toHaveValue('')
    await page.getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.getByRole('heading', { name: 'Nuevo Negocio' })).toBeHidden()

    // 2. Edit negocio A — form must pre-fill with A's data
    await page.getByRole('button', { name: `Ver detalle de ${negA.nombre}` }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Editar' }).click()
    await expect(page.getByRole('heading', { name: 'Editar Negocio' })).toBeVisible()
    await expect(page.locator('input[placeholder="Ej: Restaurante El Sabor"]')).toHaveValue(negA.nombre)
    await expect(page.locator('input[placeholder="Ej: Centro"]')).toHaveValue('Barrio Alfa')
    await expect(page.locator('input[type="time"]')).toHaveValue('07:00')
    await page.getByRole('button', { name: 'Cancelar' }).click()

    // 3. Edit negocio B — form must pre-fill with B's data, not A's
    await page.getByRole('button', { name: `Ver detalle de ${negB.nombre}` }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Editar' }).click()
    await expect(page.getByRole('heading', { name: 'Editar Negocio' })).toBeVisible()
    await expect(page.locator('input[placeholder="Ej: Restaurante El Sabor"]')).toHaveValue(negB.nombre)
    await expect(page.locator('input[placeholder="Ej: Centro"]')).toHaveValue('Barrio Beta')
    await expect(page.locator('input[type="time"]')).toHaveValue('09:00')
  })

  test('ver detalle de negocio en modal', async ({ page }) => {
    const { cliente } = await createCliente(page, { nombre: 'Cliente Detalle Negocio', telefono: '3000000002' })
    const { negocio } = await createNegocio(page, {
      clienteId: cliente.id,
      nombre: 'Panadería Dulce Hogar',
      tipoNegocio: 'Panadería',
      direccion: 'Carrera 7 # 12-34',
      barrio: 'Chapinero',
      horaApertura: '06:00',
    })

    await goto(page, `/clientes?openCliente=${cliente.id}`)
    await page.getByRole('button', { name: `Ver detalle de ${negocio.nombre}` }).click()

    // Modal should be visible with details
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()
    await expect(page.getByRole('heading', { name: `Detalle de ${negocio.nombre}` })).toBeVisible()
    await expect(modal.getByText('Panadería', { exact: true })).toBeVisible()
    await expect(modal.getByText('Carrera 7 # 12-34')).toBeVisible()
    await expect(modal.getByText('Chapinero')).toBeVisible()
    await expect(modal.getByText('Hora de apertura: 06:00')).toBeVisible()
    await expect(modal.getByRole('link', { name: 'Ver pedidos' })).toBeVisible()
    await expect(modal.getByRole('button', { name: 'Editar' })).toBeVisible()
    await expect(modal.getByRole('button', { name: 'Eliminar' })).toBeVisible()

    // Close with the X button
    await modal.getByRole('button', { name: 'Cerrar' }).click()
    await expect(modal).toBeHidden()
  })

  test('editar negocio desde el modal de detalle', async ({ page }) => {
    const { cliente } = await createCliente(page, { nombre: 'Cliente Editar Desde Detalle', telefono: '3000000003' })
    const { negocio } = await createNegocio(page, {
      clienteId: cliente.id,
      nombre: 'Café Aroma',
      tipoNegocio: 'Café',
      direccion: 'Avenida 1 # 2-34',
      barrio: 'Teusaquillo',
    })

    await goto(page, `/clientes?openCliente=${cliente.id}`)
    await page.getByRole('button', { name: `Ver detalle de ${negocio.nombre}` }).click()

    await page.getByRole('dialog').getByRole('button', { name: 'Editar' }).click()

    // NegocioForm should open in edit mode
    await expect(page.getByRole('heading', { name: 'Editar Negocio' })).toBeVisible()

    // Change name and type
    const nameInput = page.locator('input[placeholder="Ej: Restaurante El Sabor"]')
    await nameInput.fill('Café Aroma Renovado')

    await page.locator('input[placeholder="Buscar tipo de negocio..."]').click()
    await page.locator('input[placeholder="Buscar tipo de negocio..."]').fill('Restaurante')
    await page.getByRole('option', { name: 'Restaurante' }).or(page.locator('text=Restaurante').first()).click()

    await page.getByRole('button', { name: /Actualizar/ }).click()
    await waitForToast(page, 'Negocio actualizado')

    // Re-open detail and verify changes
    await page.getByRole('button', { name: 'Ver detalle de Café Aroma Renovado' }).click()
    const modal = page.getByRole('dialog')
    await expect(modal.getByRole('heading', { name: 'Detalle de Café Aroma Renovado' })).toBeVisible()
    await expect(modal.getByText('Restaurante')).toBeVisible()
  })

  test('editar negocio desde el botón lápiz de la tarjeta', async ({ page }) => {
    const { cliente } = await createCliente(page, { nombre: 'Cliente Editar Desde Card', telefono: '3000000004' })
    const { negocio } = await createNegocio(page, {
      clienteId: cliente.id,
      nombre: 'Frutería Natural',
      tipoNegocio: 'Frutería',
    })

    await goto(page, `/clientes?openCliente=${cliente.id}`)

    // Hover over the card to reveal the pencil, then click it
    const card = page.getByRole('button', { name: `Ver detalle de ${negocio.nombre}` })
    await card.hover()
    await page.getByTitle('Editar negocio').click()

    await expect(page.getByRole('heading', { name: 'Editar Negocio' })).toBeVisible()

    await page.locator('input[placeholder="Ej: Restaurante El Sabor"]').fill('Frutería Natural Plus')
    await page.getByRole('button', { name: /Actualizar/ }).click()
    await waitForToast(page, 'Negocio actualizado')

    await expect(page.getByRole('button', { name: 'Ver detalle de Frutería Natural Plus' })).toBeVisible()
  })

  test('link "Ver pedidos" navega a pedidos filtrados por cliente sin abrir formulario', async ({ page }) => {
    const { cliente } = await createCliente(page, { nombre: 'Cliente Ver Pedidos', telefono: '3000000005' })
    const { negocio } = await createNegocio(page, {
      clienteId: cliente.id,
      nombre: 'Hotel Descanso',
      tipoNegocio: 'Hotel',
    })

    await goto(page, `/clientes?openCliente=${cliente.id}`)
    await page.getByRole('button', { name: `Ver detalle de ${negocio.nombre}` }).click()

    const pedidosLink = page.getByRole('dialog').getByRole('link', { name: 'Ver pedidos' })
    await expect(pedidosLink).toHaveAttribute('href', `/pedidos?clienteId=${cliente.id}`)
    await pedidosLink.click()

    await page.waitForURL(/\/pedidos\?clienteId=.+/)
    await expect(page).toHaveURL(new RegExp(`/pedidos\\?clienteId=${cliente.id}`))
    await expect(page.getByRole('heading', { name: 'Pedidos', exact: true })).toBeVisible()
    // Regresión: antes el mismo link abría el formulario de nuevo pedido.
    await expect(page.getByRole('heading', { name: 'Nuevo Pedido' })).toBeHidden()
  })

  test('link "Crear Pedido" en detalle de negocio abre formulario con cliente y negocio preseleccionados', async ({ page }) => {
    const { cliente } = await createCliente(page, { nombre: 'Cliente Crear Pedido Negocio', telefono: '3000000009' })
    const { negocio } = await createNegocio(page, {
      clienteId: cliente.id,
      nombre: 'Panadería Central',
      tipoNegocio: 'Panadería',
      direccion: 'Calle Pan 123',
      barrio: 'Centro',
    })

    await goto(page, `/clientes?openCliente=${cliente.id}`)
    await page.getByRole('button', { name: `Ver detalle de ${negocio.nombre}` }).click()

    const crearPedidoLink = page.getByRole('dialog').getByRole('link', { name: 'Crear Pedido' })
    await expect(crearPedidoLink).toHaveAttribute('href', `/pedidos?new=1&clienteId=${cliente.id}&negocioId=${negocio.id}`)
    await crearPedidoLink.click()

    await page.waitForURL(/pedidos.*new=1.*clienteId=/)
    await expect(page.getByRole('heading', { name: 'Nuevo Pedido' })).toBeVisible()
    const modal = page.locator('[role="dialog"]').filter({ hasText: 'Nuevo Pedido' })
    await expect(modal.getByText(cliente.nombre).first()).toBeVisible()
    await expect(modal.getByText(negocio.nombre).first()).toBeVisible()
  })

  test('eliminar negocio desde el modal de detalle', async ({ page }) => {
    const { cliente } = await createCliente(page, { nombre: 'Cliente Eliminar Negocio', telefono: '3000000006' })
    const { negocio } = await createNegocio(page, {
      clienteId: cliente.id,
      nombre: 'Lavandería Clean',
      tipoNegocio: 'Lavandería',
    })

    await goto(page, `/clientes?openCliente=${cliente.id}`)
    await page.getByRole('button', { name: `Ver detalle de ${negocio.nombre}` }).click()

    // Mock confirm modal returns true by clicking the confirm button
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click()

    // Confirm modal appears (owned by useConfirm)
    const confirmModal = page.locator('[role="dialog"]').filter({ hasText: 'Eliminar negocio' })
    await expect(confirmModal).toBeVisible()
    await confirmModal.getByRole('button', { name: /Sí, eliminar/ }).click()

    await waitForToast(page, 'Negocio eliminado')

    // Card should disappear
    await expect(page.getByRole('button', { name: `Ver detalle de ${negocio.nombre}` })).toBeHidden()
  })

  test('no se puede eliminar negocio con pedidos asociados', async ({ page }) => {
    const { cliente } = await createCliente(page, { nombre: 'Cliente Negocio Con Pedidos', telefono: '3000000007' })
    const { negocio } = await createNegocio(page, {
      clienteId: cliente.id,
      nombre: 'Taller Mecánico',
      tipoNegocio: 'Taller',
    })

    // Create a pedido associated to this negocio via API
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id,
      negocioId: negocio.id,
      canal: 'DOMICILIO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    expect(pedidoRes.ok()).toBe(true)

    await goto(page, `/clientes?openCliente=${cliente.id}`)
    await page.getByRole('button', { name: `Ver detalle de ${negocio.nombre}` }).click()

    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click()

    const confirmModal = page.locator('[role="dialog"]').filter({ hasText: 'Eliminar negocio' })
    await expect(confirmModal).toBeVisible()
    await confirmModal.getByRole('button', { name: /Sí, eliminar/ }).click()

    // Error banner should appear inside the detail modal
    const detailModal = page.getByRole('dialog').filter({ hasText: `Detalle de ${negocio.nombre}` })
    await expect(detailModal.getByText(/No se puede eliminar: tiene .* pedido\(s\) asociado\(s\)/)).toBeVisible()
  })
})
