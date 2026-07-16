import {
  test,
  expect,
  reportBug,
  loginAs,
  resetTestDatabase,
  prisma,
} from '../../fixtures-paranoid'

test.describe('M2 - XSS: linkUbicacion con javascript: scheme', () => {
  let clienteNombre: string
  let clienteId: string

  test.beforeAll(async () => {
    resetTestDatabase()
    const cliente = await prisma.cliente.findFirst({ where: { activo: true } })
    if (!cliente) throw new Error('No seeded cliente found')
    clienteId = cliente.id
    clienteNombre = cliente.nombre
    await prisma.cliente.update({
      where: { id: clienteId },
      data: { linkUbicacion: 'javascript:alert(document.domain)' },
    })
  })

  test.afterAll(async () => {
    await prisma.$disconnect()
  })

  test('javascript: en linkUbicacion no debe ejecutar al hacer click', async ({ page }) => {
    let dialogFired = false
    page.on('dialog', async (dialog) => {
      dialogFired = true
      await dialog.dismiss()
    })

    await loginAs(page, 'admin')
    await page.goto(`/clientes?openCliente=${clienteId}`)

    // Verificar que el panel de detalle abrió
    await expect(page.getByText(clienteNombre).first()).toBeVisible({ timeout: 10000 })
    const mapsLink = page.getByText('Abrir en Maps')
    await expect(mapsLink).toBeVisible({ timeout: 10000 })

    const href = await mapsLink.locator('..').locator('a').getAttribute('href')
    if (href?.toLowerCase().startsWith('javascript:')) {
      await mapsLink.click()
      await page.waitForTimeout(500)

      if (dialogFired) {
        reportBug({
          severity: 'HIGH',
          category: 'Seguridad',
          vista: '/clientes - detalle cliente',
          rol: 'ADMIN',
          pasos: 'Crear cliente con linkUbicacion=javascript:alert(document.domain); abrir detalle; hacer click en link',
          esperado: 'Link deshabilitado, sanitizado o sin efecto; sin diálogo de alerta',
          real: 'Se disparó alert(document.domain)',
          evidencia: 'Se disparó un alert(document.domain) al hacer click en linkUbicacion con javascript: scheme',
          conocidoEnAgentsMd: 'no',
        })
      }
      expect(dialogFired).toBe(false)
    }
  })
})
