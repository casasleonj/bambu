import { test, expect } from '@playwright/test'
import { loginAs, goto, apiGet, apiPost, createTrabajador } from './fixtures'

/**
 * #566 — quién ve la deuda del trabajador.
 *  - ADMIN, ASISTENTE y CONTADOR la ven en la lista de trabajadores (el asistente sin acciones de edición).
 *  - Un repartidor/sellador ve solo la suya en «Mi perfil» y la API le niega la de otros.
 */
test.describe('Deuda del trabajador por rol (#566)', () => {
  test('ASISTENTE ve la deuda en la lista, sin crear ni editar trabajadores', async ({ page }) => {
    await loginAs(page, 'admin')
    const t = await createTrabajador(page, { nombre: `DeudaAsist ${Date.now()}` })
    await apiPost(page, '/api/deudas', { trabajadorId: t.trabajador.id, tipo: 'PRESTAMO', monto: 40000, descripcion: 'Préstamo asistente' })

    await page.context().clearCookies()
    await loginAs(page, 'asistente')
    await goto(page, '/trabajadores')

    const card = page.locator('div.rounded-2xl').filter({ hasText: t.trabajador.nombre })
    await expect(card.getByTestId('deuda-bloque')).toContainText('$ 40.000')
    await expect(page.getByRole('button', { name: '+ Nuevo Trabajador' })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Editar' })).toHaveCount(0)

    await card.getByTestId('deuda-bloque').click()
    await expect(page.getByTestId('deuda-detalle')).toContainText('Préstamo asistente')
  })

  test('el repartidor ve en «Mi perfil» solo su deuda y la API le niega la de otros', async ({ page }) => {
    // 1. ¿A qué trabajador está vinculado el usuario repartidor? Lo dice su propio perfil.
    await loginAs(page, 'repartidor')
    await goto(page, '/mi-perfil')
    const vinculo = await page.getByText(/Vinculado a:/).first().textContent()
    const nombrePropio = vinculo?.replace(/^.*Vinculado a:\s*/, '').trim()
    expect(nombrePropio, 'el seed vincula un trabajador al usuario repartidor').toBeTruthy()

    // 2. El admin le crea una deuda a él y otra a un trabajador cualquiera.
    await page.context().clearCookies()
    await loginAs(page, 'admin')
    const lista = await (await apiGet(page, '/api/trabajadores?activo=true')).json()
    const propio = (lista.trabajadores as Array<{ id: string; nombre: string }>).find((t) => t.nombre === nombrePropio)
    expect(propio).toBeTruthy()
    const ajeno = await createTrabajador(page, { nombre: `Ajeno ${Date.now()}` })
    await apiPost(page, '/api/deudas', { trabajadorId: propio!.id, tipo: 'PRESTAMO', monto: 22000, descripcion: 'Deuda propia repartidor' })
    await apiPost(page, '/api/deudas', { trabajadorId: ajeno.trabajador.id, tipo: 'PRESTAMO', monto: 99000, descripcion: 'Deuda ajena' })

    // 3. El repartidor ve la suya en Mi perfil y la API le niega la de otros.
    await page.context().clearCookies()
    await loginAs(page, 'repartidor')
    await goto(page, '/mi-perfil')
    const mis = page.getByTestId('mis-deudas')
    await expect(mis).toBeVisible()
    await expect(mis.getByTestId('deuda-total')).toContainText('$')
    await expect(mis).toContainText('Deuda propia repartidor')
    await expect(mis).not.toContainText('Deuda ajena')

    expect((await apiGet(page, `/api/trabajadores/${ajeno.trabajador.id}/deudas-pendientes`)).status()).toBe(403)
    expect((await apiGet(page, '/api/trabajadores/deudas-resumen')).status()).toBe(403)
  })
})
