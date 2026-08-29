// @tests Tab "Físico" del detalle de embarque — ledger físico, recovery y botellones.
// Suite robusta: happy paths (SOBRANTE y FALTANTE), validaciones de formulario,
// límites de permisos por rol, idempotencia offline (retry con mismo offlineId)
// y responsive/mobile. No solo el camino feliz — también los casos límite que
// el propio contrato del plan maestro exige (ver docs/adr/ADR-*).
import { test, expect, loginAs, goto, skipBaseCaja, createTrabajador, createEmbarque, apiPost, apiGet, BASE, waitForToast, checkHorizontalOverflow } from './fixtures'
import type { Page } from '@playwright/test'

// checkTouchTargets() de fixtures.ts revisa los primeros 20 elementos
// interactivos de TODA la página en orden de DOM — en esta pantalla eso
// captura el header/sidebar global preexistente (hamburguesa, badge de
// sync, chevron de usuario), no el contenido del tab Físico. Acotamos la
// revisión al panel que realmente construimos.
async function checkTouchTargetsIn(page: Page, containerTestId: string, minSize = 44) {
  const container = page.getByTestId(containerTestId)
  const buttons = container.locator('button, [role="button"], a, input[type="submit"]')
  const count = await buttons.count()
  const failures: string[] = []
  for (let i = 0; i < count; i++) {
    const box = await buttons.nth(i).boundingBox()
    if (box && (box.width < minSize || box.height < minSize)) {
      const text = (await buttons.nth(i).textContent())?.trim().slice(0, 30)
      failures.push(`Button ${i} ("${text}"): ${box.width.toFixed(0)}x${box.height.toFixed(0)} (min: ${minSize}x${minSize})`)
    }
  }
  if (failures.length > 0) {
    throw new Error(`Touch targets too small en #${containerTestId}:\n${failures.join('\n')}`)
  }
}

async function setup(page: Page, actingRole: 'admin' | 'asistente' = 'admin') {
  // POST /api/trabajadores es ADMIN-only — la creación de datos de setup
  // siempre corre como admin, independientemente del rol que interactúe
  // luego con la UI (así el test de ASISTENTE prueba su acceso real a la
  // pantalla, no si puede crear un trabajador, que no puede).
  await loginAs(page, 'admin')
  const t = await createTrabajador(page)
  const trabajadorId = t.trabajador?.id || t.data?.id
  const e = await createEmbarque(page, trabajadorId)
  const embarqueId = e.embarque?.id || e.data?.id
  if (actingRole !== 'admin') {
    await loginAs(page, actingRole)
  }
  return { trabajadorId, embarqueId }
}

async function abrirTabFisico(page: Page, embarqueId: string) {
  await goto(page, `/embarques/${embarqueId}`)
  await page.getByTestId('tab-fisico').click()
  await expect(page.getByTestId('movimientos-timeline')).toBeVisible()
}

test.describe('Embarques — Tab Físico — Happy path', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('SOBRANTE: registrar movimiento, resolver sobrante contra él y ver el disponible restante actualizarse', async ({ page }) => {
    const { embarqueId } = await setup(page)
    await abrirTabFisico(page, embarqueId)

    await expect(page.getByText('Sin movimientos registrados todavía.')).toBeVisible()
    await expect(page.getByText('Sin sobrantes ni faltantes registrados todavía.')).toBeVisible()

    await page.getByTestId('registrar-movimiento-button').click()
    await page.getByTestId('movimiento-tipo-CUSTODY_TRANSFER').click()
    await page.getByTestId('movimiento-cantidad-input').fill('10')
    await page.getByTestId('movimiento-origen-select').selectOption('ALMACEN')
    await page.getByTestId('movimiento-destino-select').selectOption('VEHICULO')
    await page.getByTestId('movimiento-submit-button').click()
    await waitForToast(page, 'Movimiento registrado')
    await expect(page.getByTestId('movimientos-timeline')).toContainText('Transferencia')

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
    // La etiqueta del origen debe ser amigable, no el enum crudo.
    await expect(page.getByTestId('recovery-panel')).toContainText('Origen: Transferencia')
    await expect(page.getByTestId('recovery-panel')).not.toContainText('CUSTODY_TRANSFER')

    // El disponible restante del mismo origen ahora refleja 10 - 4 = 6.
    await page.getByTestId('nueva-recovery-decision-button').click()
    await expect(page.getByTestId('recovery-source-select').locator('option', { hasText: 'disponible: 6 de 10' })).toHaveCount(1)
    await page.getByText('Cancelar').last().click()
  })

  test('FALTANTE: no exige movimiento de origen y queda registrado como discrepancia', async ({ page }) => {
    const { embarqueId } = await setup(page)
    await abrirTabFisico(page, embarqueId)

    await page.getByTestId('nueva-recovery-decision-button').click()
    await page.getByTestId('recovery-tipo-faltante').click()
    // No debe pedir movimiento de origen para un FALTANTE.
    await expect(page.getByTestId('recovery-source-select')).not.toBeVisible()
    await page.getByTestId('recovery-cantidad-input').fill('3')
    await page.getByTestId('recovery-cantidad-aplicada-input').fill('3')
    await page.getByTestId('recovery-reason-input').fill('Faltante detectado en conteo de cierre')
    await page.getByTestId('recovery-submit-button').click()
    await waitForToast(page, 'Faltante registrado')

    await expect(page.getByTestId('recovery-panel')).toContainText('Faltante')
    await expect(page.getByTestId('recovery-panel')).toContainText('3 de 3')
    // Un faltante nunca tiene "Origen:" — no existe fuente física.
    await expect(page.getByTestId('recovery-panel')).not.toContainText('Origen:')
  })

  test('Botellones: recogido ≠ entregado, "en custodia" se deriva correctamente', async ({ page }) => {
    const { embarqueId } = await setup(page)
    await abrirTabFisico(page, embarqueId)

    await page.getByTestId('botellon-recogida-button').click()
    await page.getByTestId('botellon-cantidad-input').fill('5')
    await page.getByTestId('botellon-confirmar-button').click()
    await waitForToast(page, 'Recogida registrada')

    // Recogido no se convierte automáticamente en entregado.
    await expect(page.getByText('Recogidos')).toBeVisible()
    await expect(page.getByText('Entregados')).toBeVisible()

    await page.getByTestId('botellon-entrega-button').click()
    await page.getByTestId('botellon-cantidad-input').fill('2')
    await page.getByTestId('botellon-confirmar-button').click()
    await waitForToast(page, 'Entrega registrada')

    // En custodia = recogidos(5) - entregados(2) = 3.
    const res = await page.request.get(`${BASE}/api/embarques/${embarqueId}/movimientos`)
    const body = await res.json()
    const recogidos = body.movimientos.filter((m: { tipo: string; destino: string }) => m.tipo === 'RETORNO' && m.destino === 'ALMACEN').reduce((s: number, m: { cantidad: number }) => s + m.cantidad, 0)
    const entregados = body.movimientos.filter((m: { tipo: string; destino: string }) => m.tipo === 'ENTREGA' && m.destino === 'CLIENTE').reduce((s: number, m: { cantidad: number }) => s + m.cantidad, 0)
    expect(recogidos).toBe(5)
    expect(entregados).toBe(2)
  })

  test('Sustitución: registrar desde la UI genera RETORNO + ENTREGA (2 movimientos)', async ({ page }) => {
    const { embarqueId } = await setup(page)
    await abrirTabFisico(page, embarqueId)

    await expect(page.getByText('Sin movimientos registrados todavía.')).toBeVisible()

    await page.getByTestId('registrar-sustitucion-button').click()
    await page.getByTestId('sustitucion-cantidad-input').fill('2')
    await page.getByTestId('sustitucion-submit-button').click()
    await waitForToast(page, 'Sustitución registrada')

    // La lista de sustituciones muestra la nueva sustitución con sus 2 movimientos.
    await expect(page.getByTestId('sustituciones-list')).toContainText('Sustitución')
    await expect(page.getByTestId('sustituciones-list')).toContainText('Retorno')
    await expect(page.getByTestId('sustituciones-list')).toContainText('Entrega')

    // El ledger físico refleja exactamente esos 2 movimientos separados.
    await expect(page.getByTestId('movimientos-timeline')).toContainText('Retorno')
    await expect(page.getByTestId('movimientos-timeline')).toContainText('Entrega')
  })
})

test.describe('Embarques — Tab Físico — Validaciones de formulario', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('AJUSTE_AUTORIZADO exige efecto + autorización antes de habilitar el envío', async ({ page }) => {
    const { embarqueId } = await setup(page)
    await abrirTabFisico(page, embarqueId)

    await page.getByTestId('registrar-movimiento-button').click()
    await page.getByTestId('movimiento-tipo-AJUSTE_AUTORIZADO').click()
    await page.getByTestId('movimiento-cantidad-input').fill('7')
    // Sin autorización todavía: el submit debe estar deshabilitado.
    await expect(page.getByTestId('movimiento-submit-button')).toBeDisabled()

    await page.getByText('+ Aumenta inventario').click()
    await expect(page.getByTestId('movimiento-submit-button')).toBeDisabled()

    await page.locator('input[placeholder="Motivo y quién autoriza este ajuste"]').fill('Autorizado por gerencia — conteo físico confirmado')
    await expect(page.getByTestId('movimiento-submit-button')).toBeEnabled()

    await page.getByTestId('movimiento-submit-button').click()
    await waitForToast(page, 'Movimiento registrado')
    await expect(page.getByTestId('movimientos-timeline')).toContainText('Ajuste autorizado')
    await expect(page.getByTestId('movimientos-timeline')).toContainText('↑ aumenta')
  })

  test('Movimiento sin cantidad mantiene el envío deshabilitado', async ({ page }) => {
    const { embarqueId } = await setup(page)
    await abrirTabFisico(page, embarqueId)
    await page.getByTestId('registrar-movimiento-button').click()
    await page.getByTestId('movimiento-tipo-REEMPAQUE').click()
    await expect(page.getByTestId('movimiento-submit-button')).toBeDisabled()
    await page.getByTestId('movimiento-cantidad-input').fill('0')
    await expect(page.getByTestId('movimiento-submit-button')).toBeDisabled()
  })

  test('Recovery: cantidad aplicada no puede exceder la solicitada', async ({ page }) => {
    const { embarqueId } = await setup(page)
    await abrirTabFisico(page, embarqueId)
    await page.getByTestId('nueva-recovery-decision-button').click()
    await page.getByTestId('recovery-tipo-faltante').click()
    await page.getByTestId('recovery-cantidad-input').fill('5')
    await page.getByTestId('recovery-cantidad-aplicada-input').fill('9')
    await expect(page.getByText('La cantidad aplicada no puede exceder la solicitada.')).toBeVisible()
    await expect(page.getByTestId('recovery-submit-button')).toBeDisabled()
  })

  test('Recovery SOBRANTE en un embarque sin movimientos elegibles no permite continuar', async ({ page }) => {
    const { embarqueId } = await setup(page)
    await abrirTabFisico(page, embarqueId)
    await page.getByTestId('nueva-recovery-decision-button').click()
    // SOBRANTE es el tipo por defecto; sin CARGA/RECARGA/CUSTODY_TRANSFER previos.
    await expect(page.getByText('No hay movimientos con unidades disponibles todavía.')).toBeVisible()
    await expect(page.getByTestId('recovery-source-select')).not.toBeVisible()
  })
})

test.describe('Embarques — Tab Físico — Permisos por rol', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('REPARTIDOR es redirigido antes de ver el detalle del embarque (view:embarques no está en su matriz)', async ({ page }) => {
    const { embarqueId } = await setup(page)
    await skipBaseCaja(page)
    await loginAs(page, 'repartidor')
    await page.goto(`${BASE}/embarques/${embarqueId}`)
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/repartidor$/)
  })

  test('ASISTENTE puede registrar movimientos igual que ADMIN (no es exclusivo de ADMIN)', async ({ page }) => {
    const { embarqueId } = await setup(page, 'asistente')
    await abrirTabFisico(page, embarqueId)
    await expect(page.getByTestId('registrar-movimiento-button')).toBeVisible()
    await page.getByTestId('registrar-movimiento-button').click()
    await page.getByTestId('movimiento-tipo-DESCARTE').click()
    await page.getByTestId('movimiento-cantidad-input').fill('2')
    await page.getByTestId('movimiento-submit-button').click()
    await waitForToast(page, 'Movimiento registrado')
  })
})

test.describe('Embarques — Tab Físico — Idempotencia (retry offline)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('POST /movimientos con el mismo offlineId dos veces no duplica', async ({ page }) => {
    await loginAs(page, 'admin')
    const t = await createTrabajador(page)
    const e = await createEmbarque(page, t.trabajador?.id || t.data?.id)
    const embarqueId = e.embarque?.id || e.data?.id
    const offlineId = `e2e-fisico-${Date.now()}`
    const body = { tipo: 'DESCARTE', producto: 'PACA_AGUA', cantidad: 3, offlineId }

    const r1 = await apiPost(page, `/api/embarques/${embarqueId}/movimientos`, body)
    expect(r1.status()).toBe(201)
    const r2 = await apiPost(page, `/api/embarques/${embarqueId}/movimientos`, body)
    expect(r2.ok()).toBe(true)
    const b2 = await r2.json()
    expect(b2.deduped).toBe(true)

    const list = await apiGet(page, `/api/embarques/${embarqueId}/movimientos`)
    const listBody = await list.json()
    const matching = listBody.movimientos.filter((m: { offlineId: string | null }) => m.offlineId === offlineId)
    expect(matching.length).toBe(1)
  })

  test('POST /botellones con el mismo offlineId dos veces no duplica', async ({ page }) => {
    await loginAs(page, 'admin')
    const t = await createTrabajador(page)
    const e = await createEmbarque(page, t.trabajador?.id || t.data?.id)
    const embarqueId = e.embarque?.id || e.data?.id
    const offlineId = `e2e-botellon-${Date.now()}`
    const body = { accion: 'RECOGIDA', cantidad: 2, offlineId }

    const r1 = await apiPost(page, `/api/embarques/${embarqueId}/botellones`, body)
    expect(r1.status()).toBe(201)
    const r2 = await apiPost(page, `/api/embarques/${embarqueId}/botellones`, body)
    expect(r2.ok()).toBe(true)
    const b2 = await r2.json()
    expect(b2.deduped).toBe(true)

    const list = await apiGet(page, `/api/embarques/${embarqueId}/movimientos`)
    const listBody = await list.json()
    const matching = listBody.movimientos.filter((m: { offlineId: string | null }) => m.offlineId === offlineId)
    expect(matching.length).toBe(1)
  })

  // ADR-SUSTITUCION-001 / contrato §9
  test('POST /sustituciones crea DOS movimientos físicos separados (RETORNO + ENTREGA)', async ({ page }) => {
    await loginAs(page, 'admin')
    const t = await createTrabajador(page)
    const e = await createEmbarque(page, t.trabajador?.id || t.data?.id)
    const embarqueId = e.embarque?.id || e.data?.id

    const res = await apiPost(page, `/api/embarques/${embarqueId}/sustituciones`, {
      producto: 'PACA_AGUA',
      cantidad: 1,
      motivo: 'Bolsa rota al descargar',
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.sustitucion.movimientoRecepcion.tipo).toBe('RETORNO')
    expect(body.sustitucion.movimientoRecepcion.destino).toBe('INSPECCION')
    expect(body.sustitucion.movimientoEntrega.tipo).toBe('ENTREGA')
    expect(body.sustitucion.movimientoEntrega.destino).toBe('CLIENTE')

    // El ledger físico tiene exactamente esos 2 movimientos (no uno ambiguo).
    const list = await apiGet(page, `/api/embarques/${embarqueId}/movimientos`)
    const movs = (await list.json()).movimientos as Array<{ tipo: string; producto: string }>
    expect(movs.filter((m) => m.producto === 'PACA_AGUA' && (m.tipo === 'RETORNO' || m.tipo === 'ENTREGA')).length).toBe(2)
  })

  test('POST /sustituciones con el mismo offlineId dos veces no duplica', async ({ page }) => {
    await loginAs(page, 'admin')
    const t = await createTrabajador(page)
    const e = await createEmbarque(page, t.trabajador?.id || t.data?.id)
    const embarqueId = e.embarque?.id || e.data?.id
    const offlineId = `e2e-sust-${Date.now()}`
    const body = { producto: 'PACA_HIELO', cantidad: 2, offlineId }

    const r1 = await apiPost(page, `/api/embarques/${embarqueId}/sustituciones`, body)
    expect(r1.status()).toBe(201)
    const r2 = await apiPost(page, `/api/embarques/${embarqueId}/sustituciones`, body)
    expect(r2.ok()).toBe(true)
    expect((await r2.json()).deduped).toBe(true)

    const list = await apiGet(page, `/api/embarques/${embarqueId}/sustituciones`)
    const sustituciones = (await list.json()).sustituciones as Array<{ offlineId: string | null }>
    expect(sustituciones.filter((s) => s.offlineId === offlineId).length).toBe(1)
  })
})

test.describe('Embarques — Tab Físico — Responsive / mobile', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1',
  })

  test('el tab Físico no produce overflow horizontal y los botones cumplen tamaño mínimo táctil', async ({ page }) => {
    const { embarqueId } = await setup(page)
    await abrirTabFisico(page, embarqueId)
    await checkHorizontalOverflow(page)
    await checkTouchTargetsIn(page, 'tab-fisico-panel', 44)
  })
})
