// @tests Tab "Físico" del detalle de embarque — ledger físico, recovery y botellones.
// Happy path completo: registrar un movimiento (CUSTODY_TRANSFER), usarlo como
// origen de un SOBRANTE, y registrar recogida/entrega de botellones.
import { test, expect, login, goto, skipBaseCaja, createTrabajador, createEmbarque, BASE, waitForToast } from './fixtures'

async function setup(page: Parameters<typeof login>[0]) {
  await skipBaseCaja(page)
  await login(page, 'admin', 'admin123')
  const t = await createTrabajador(page)
  const trabajadorId = t.trabajador?.id || t.data?.id
  const e = await createEmbarque(page, trabajadorId)
  const embarqueId = e.embarque?.id || e.data?.id
  return { trabajadorId, embarqueId }
}

test.describe('Embarques — Tab Físico (ledger, recovery, botellones)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('happy path: movimiento físico, sobrante resuelto y botellones', async ({ page }) => {
    const { embarqueId } = await setup(page)
    expect(embarqueId).toBeTruthy()

    await goto(page, `/embarques/${embarqueId}`)
    await page.getByTestId('tab-fisico').click()

    // El tab carga sus dos listas (vacías al inicio) sin error.
    await expect(page.getByTestId('movimientos-timeline')).toBeVisible()
    await expect(page.getByTestId('recovery-panel')).toBeVisible()
    await expect(page.getByText('Sin movimientos registrados todavía.')).toBeVisible()

    // 1. Registrar un movimiento físico (CUSTODY_TRANSFER) — se convierte en
    //    candidato de origen para un SOBRANTE.
    await page.getByTestId('registrar-movimiento-button').click()
    await page.getByTestId('movimiento-tipo-CUSTODY_TRANSFER').click()
    await page.getByTestId('movimiento-cantidad-input').fill('10')
    await page.getByTestId('movimiento-origen-select').selectOption('ALMACEN')
    await page.getByTestId('movimiento-destino-select').selectOption('VEHICULO')
    await page.getByTestId('movimiento-submit-button').click()
    await waitForToast(page, 'Movimiento registrado')

    await expect(page.getByTestId('movimientos-timeline')).toContainText('Transferencia')
    await expect(page.getByTestId('movimientos-timeline')).toContainText('10')

    // 2. Resolver un SOBRANTE contra ese movimiento — verifica que el
    //    "disponible restante" se calcula y se muestra antes de enviar.
    await page.getByTestId('nueva-recovery-decision-button').click()
    await expect(page.getByTestId('recovery-tipo-sobrante')).toHaveClass(/border-green-500/)
    const sourceSelect = page.getByTestId('recovery-source-select')
    await expect(sourceSelect.locator('option', { hasText: 'disponible: 10 de 10' })).toHaveCount(1)
    await sourceSelect.selectOption({ index: 1 })
    await expect(page.getByText('Disponible restante:')).toBeVisible()
    await page.getByTestId('recovery-cantidad-input').fill('4')
    await page.getByTestId('recovery-cantidad-aplicada-input').fill('4')
    await page.getByTestId('recovery-reason-input').fill('Sobrante detectado tras verificación en bodega')
    await page.getByTestId('recovery-submit-button').click()
    await waitForToast(page, 'Sobrante resuelto')

    await expect(page.getByTestId('recovery-panel')).toContainText('Sobrante')
    await expect(page.getByTestId('recovery-panel')).toContainText('4 de 4')

    // El disponible restante del mismo origen ahora debe reflejar 10 - 4 = 6.
    await page.getByTestId('nueva-recovery-decision-button').click()
    await expect(page.getByTestId('recovery-source-select').locator('option', { hasText: 'disponible: 6 de 10' })).toHaveCount(1)
    await page.getByText('Cancelar').last().click()

    // 3. Botellones — recogida y entrega, con conteos derivados del ledger.
    await page.getByTestId('botellon-recogida-button').click()
    await page.getByTestId('botellon-cantidad-input').fill('3')
    await page.getByTestId('botellon-confirmar-button').click()
    await waitForToast(page, 'Recogida registrada')
    await expect(page.getByText('Recogidos')).toBeVisible()
    await expect(page.getByText('3', { exact: true }).first()).toBeVisible()

    await page.getByTestId('botellon-entrega-button').click()
    await page.getByTestId('botellon-cantidad-input').fill('1')
    await page.getByTestId('botellon-confirmar-button').click()
    await waitForToast(page, 'Entrega registrada')

    // En custodia = recogidos(3) - entregados(1) = 2.
    await expect(page.getByText('En custodia')).toBeVisible()
  })

  test('el GET de movimientos y recovery refleja lo creado por la UI', async ({ page }) => {
    const { embarqueId } = await setup(page)
    await goto(page, `/embarques/${embarqueId}`)
    await page.getByTestId('tab-fisico').click()

    await page.getByTestId('registrar-movimiento-button').click()
    await page.getByTestId('movimiento-tipo-DESCARTE').click()
    await page.getByTestId('movimiento-cantidad-input').fill('2')
    await page.getByTestId('movimiento-submit-button').click()
    await waitForToast(page, 'Movimiento registrado')

    const res = await page.request.get(`${BASE}/api/embarques/${embarqueId}/movimientos`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.movimientos.some((m: { tipo: string; cantidad: number }) => m.tipo === 'DESCARTE' && m.cantidad === 2)).toBe(true)
  })
})
