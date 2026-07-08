import { test, expect, fullLogin, goto, createCliente, createClienteFull, createNegocio, resetDatabase } from './fixtures'

test.describe('Clientes - scroll no se congela tras cerrar panel + sub-modal', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 720 } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('scroll funciona después de abrir detalle, sub-modal y cerrar todo', async ({ page }) => {
    test.setTimeout(120000)

    await fullLogin(page)

    // Crear cliente con un negocio para poder abrir sub-modal
    const clienteRes = await createClienteFull(page, {
      nombre: 'Scroll',
      apellido: 'Test',
      telefono: '3999000003',
      direccion: 'Calle Scroll 1',
      barrio: 'Centro',
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.data?.id
    if (!clienteId) throw new Error('No se pudo crear cliente de prueba')

    await createNegocio(page, { clienteId, nombre: 'Negocio Scroll' })

    // Crear varios clientes adicionales para que la página sea scrollable
    for (let i = 0; i < 15; i++) {
      await createCliente(page, {
        nombre: `Filler ${i}`,
        telefono: `3999001${String(i).padStart(3, '0')}`,
        direccion: `Calle Filler ${i}`,
        barrio: 'Centro',
      })
    }

    await goto(page, '/clientes')

    const canScroll = async () => {
      return page.evaluate(() => {
        const findScrollable = (el: Element): Element | null => {
          const style = window.getComputedStyle(el)
          if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
            return el
          }
          for (const child of el.children) {
            const found = findScrollable(child)
            if (found) return found
          }
          return null
        }
        const scrollable = findScrollable(document.body) || document.documentElement
        const before = scrollable.scrollTop
        scrollable.scrollBy(0, 200)
        const after = scrollable.scrollTop
        scrollable.scrollTo(0, before)
        return after > before
      })
    }

    // Verificar scroll inicial
    expect(await canScroll()).toBe(true)

    // Abrir detalle del cliente
    await page.locator('text=Scroll Test').first().click()
    await expect(page.locator('text=Negocio Scroll')).toBeVisible({ timeout: 5000 })

    // Abrir sub-modal (detalle del negocio)
    await page.locator('[aria-label*="Ver detalle de"]').first().click()
    await expect(page.getByRole('heading', { name: 'Negocio Scroll' }).last()).toBeVisible({ timeout: 5000 })

    // Cerrar sub-modal haciendo clic en el botón de cerrar del header
    const subModalClose = page.locator('[role="dialog"] >> [aria-label="Cerrar"]').first()
    await expect(subModalClose).toBeVisible({ timeout: 5000 })
    await subModalClose.click()
    await page.waitForTimeout(500)

    // Cerrar panel de detalle (primer cerrar visible fuera de un dialog)
    const panelClose = page.locator('button[aria-label="Cerrar"]:not([role="dialog"] *)').first()
    await expect(panelClose).toBeVisible({ timeout: 5000 })
    await panelClose.click()
    await page.waitForTimeout(500)

    // Verificar que el scroll sigue funcionando
    expect(await canScroll()).toBe(true)

    // Repetir el ciclo para descartar fugas acumulativas
    for (let i = 0; i < 2; i++) {
      await page.locator('text=Scroll Test').first().click()
      await page.locator('[aria-label*="Ver detalle de"]').first().click()
      await page.waitForTimeout(200)
      await page.locator('[role="dialog"] >> [aria-label="Cerrar"]').first().click()
      await page.waitForTimeout(200)
      await page.locator('button[aria-label="Cerrar"]:not([role="dialog"] *)').first().click()
      await page.waitForTimeout(200)
      expect(await canScroll()).toBe(true)
    }
  })
})
