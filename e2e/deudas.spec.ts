import { test, expect, type Page } from '@playwright/test'
import {loginAs,
  goto,
  apiPost,
  apiGet,
  apiPut,
  apiDelete,
  createTrabajador,
  createCliente,
  createEmbarque,
  resetTestDatabase,
  waitForToast} from './fixtures'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createDeuda(page: Page, data: {
  trabajadorId: string
  tipo: string
  monto: number
  descripcion: string
}) {
  return apiPost(page, '/api/deudas', data)
}

async function abonarDeuda(page: Page, deudaId: string, data: {
  monto: number
  nota?: string
}) {
  return apiPost(page, `/api/deudas/${deudaId}/abonar`, data)
}

// ─── API Tests ───────────────────────────────────────────────────────────────

test.describe('Deudas API', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('crear deuda prestamo via API', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `DeudaWorker ${Date.now()}` })
    const tid = trabajador.trabajador.id

    const res = await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 50000,
      descripcion: 'Prestamo personal'})

    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.deuda.montoOriginal).toBe(50000)
    expect(body.deuda.montoPendiente).toBe(50000)
    expect(body.deuda.tipo).toBe('PRESTAMO')
    expect(body.deuda.trabajadorId).toBe(tid)
  })

  test('crear deuda deficit efectivo via API', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `DeficitWorker ${Date.now()}` })
    const tid = trabajador.trabajador.id

    const res = await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'DEFICIT_EFECTIVO',
      monto: 15000,
      descripcion: 'Faltante en cierre de embarque'})

    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.deuda.tipo).toBe('DEFICIT_EFECTIVO')
    expect(body.deuda.montoPendiente).toBe(15000)
  })

  test('rechazar deuda con monto invalido', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `InvalidWorker ${Date.now()}` })

    const res = await createDeuda(page, {
      trabajadorId: trabajador.trabajador.id,
      tipo: 'PRESTAMO',
      monto: -100,
      descripcion: 'Deuda invalida'})

    expect(res.status()).toBe(400)
  })

  test('rechazar deuda sin descripcion', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `NoDescWorker ${Date.now()}` })

    const res = await createDeuda(page, {
      trabajadorId: trabajador.trabajador.id,
      tipo: 'PRESTAMO',
      monto: 10000,
      descripcion: ''})

    expect(res.status()).toBe(400)
  })

  test('listar deudas por trabajador', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `ListWorker ${Date.now()}` })
    const tid = trabajador.trabajador.id

    await createDeuda(page, { trabajadorId: tid, tipo: 'PRESTAMO', monto: 30000, descripcion: 'Deuda 1' })
    await createDeuda(page, { trabajadorId: tid, tipo: 'OTRO', monto: 20000, descripcion: 'Deuda 2' })

    const res = await apiGet(page, `/api/deudas?trabajadorId=${tid}`)
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(body.deudas.length).toBe(2)
  })

  test('listar solo deudas pendientes', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `PendingWorker ${Date.now()}` })
    const tid = trabajador.trabajador.id

    const res1 = await createDeuda(page, { trabajadorId: tid, tipo: 'PRESTAMO', monto: 50000, descripcion: 'Pendiente' })
    const body1 = await res1.json()
    const deudaId = body1.deuda.id

    // Pay it off
    await abonarDeuda(page, deudaId, { monto: 50000, nota: 'Pago completo' })

    // Create another pending one
    await createDeuda(page, { trabajadorId: tid, tipo: 'PRESTAMO', monto: 25000, descripcion: 'Aun pendiente' })

    const res = await apiGet(page, `/api/deudas?trabajadorId=${tid}&pendiente=true`)
    const body = await res.json()

    expect(body.deudas.length).toBe(1)
    expect(body.deudas[0].descripcion).toBe('Aun pendiente')
  })

  test('abono parcial a deuda', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `PartialWorker ${Date.now()}` })
    const tid = trabajador.trabajador.id

    const res1 = await createDeuda(page, { trabajadorId: tid, tipo: 'PRESTAMO', monto: 100000, descripcion: 'Prestamo grande' })
    const body1 = await res1.json()
    const deudaId = body1.deuda.id

    // Partial payment
    const res2 = await abonarDeuda(page, deudaId, { monto: 30000, nota: 'Primer abono' })
    expect(res2.status()).toBe(201)
    const body2 = await res2.json()
    expect(body2.deuda.montoPendiente).toBe(70000)
    expect(body2.abono.monto).toBe(30000)

    // Second partial payment
    const res3 = await abonarDeuda(page, deudaId, { monto: 40000, nota: 'Segundo abono' })
    expect(res3.status()).toBe(201)
    const body3 = await res3.json()
    expect(body3.deuda.montoPendiente).toBe(30000)
  })

  test('abono completo marca deuda como pagada', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `FullPayWorker ${Date.now()}` })
    const tid = trabajador.trabajador.id

    const res1 = await createDeuda(page, { trabajadorId: tid, tipo: 'PRESTAMO', monto: 25000, descripcion: 'Prestamo pequeno' })
    const body1 = await res1.json()
    const deudaId = body1.deuda.id

    const res2 = await abonarDeuda(page, deudaId, { monto: 25000 })
    const body2 = await res2.json()
    expect(body2.deuda.montoPendiente).toBe(0)
  })

  test('rechazar abono que excede deuda', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `OverpayWorker ${Date.now()}` })
    const tid = trabajador.trabajador.id

    const res1 = await createDeuda(page, { trabajadorId: tid, tipo: 'PRESTAMO', monto: 10000, descripcion: 'Prestamo chico' })
    const body1 = await res1.json()
    const deudaId = body1.deuda.id

    const res2 = await abonarDeuda(page, deudaId, { monto: 50000 })
    expect(res2.status()).toBe(400)
    const body2 = await res2.json()
    expect(body2.error.message).toContain('excede')
  })

  test('resumen de deudas por trabajador', async ({ page }) => {
    const t1 = await createTrabajador(page, { nombre: `Resumen1 ${Date.now()}` })
    const t2 = await createTrabajador(page, { nombre: `Resumen2 ${Date.now()}` })

    await createDeuda(page, { trabajadorId: t1.trabajador.id, tipo: 'PRESTAMO', monto: 50000, descripcion: 'D1' })
    await createDeuda(page, { trabajadorId: t1.trabajador.id, tipo: 'OTRO', monto: 30000, descripcion: 'D2' })
    await createDeuda(page, { trabajadorId: t2.trabajador.id, tipo: 'PRESTAMO', monto: 20000, descripcion: 'D3' })

    const res = await apiGet(page, '/api/deudas/resumen')
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(body.trabajadoresConDeuda).toBeGreaterThanOrEqual(2)
    expect(body.totalGeneral).toBeGreaterThanOrEqual(100000)

    const resumen = body.resumen as Array<{ trabajadorId: string; totalPendiente: number; cantidadDeudas: number }>
    const resumenT1 = resumen.find((r) => r.trabajadorId === t1.trabajador.id)
    expect(resumenT1!.totalPendiente).toBe(80000)
    expect(resumenT1!.cantidadDeudas).toBe(2)
  })

  test('obtener detalle de deuda con abonos', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `DetailWorker ${Date.now()}` })
    const tid = trabajador.trabajador.id

    const res1 = await createDeuda(page, { trabajadorId: tid, tipo: 'PRESTAMO', monto: 60000, descripcion: 'Con abonos' })
    const body1 = await res1.json()
    const deudaId = body1.deuda.id

    await abonarDeuda(page, deudaId, { monto: 20000, nota: 'Abono 1' })
    await abonarDeuda(page, deudaId, { monto: 10000, nota: 'Abono 2' })

    const res2 = await apiGet(page, `/api/deudas/${deudaId}`)
    const body2 = await res2.json()

    expect(body2.deuda.abonos.length).toBe(2)
    expect(body2.deuda.montoPendiente).toBe(30000)
  })

  test('deuda de trabajador inactivo rechazada', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `InactiveWorker ${Date.now()}` })
    const tid = trabajador.trabajador.id

    // Deactivate worker
    await apiDelete(page, `/api/trabajadores/${tid}`)

    const res = await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 10000,
      descripcion: 'Deuda invalida'})

    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error.message).toContain('inactivo')
  })
})

// ─── UI Tests ────────────────────────────────────────────────────────────────

test.describe('Deudas UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('pagina global de deudas carga', async ({ page }) => {
    await goto(page, '/deudas')
    await expect(page.getByRole('heading', { name: 'Deudas Pendientes' })).toBeVisible()
  })

  test('sidebar muestra sub-menu Deudas bajo Trabajadores', async ({ page }) => {
    await goto(page, '/dashboard')

    // Just navigate directly to verify the nav item exists
    await goto(page, '/deudas')
    await expect(page.getByRole('heading', { name: 'Deudas Pendientes' })).toBeVisible()
  })

  // FIX: los 6 tests de este describe fallaban en cascada por un mismatch de
  // formato, no relacionado al bug de Decimal-a-string de /api/deudas.
  // formatCurrency() (src/lib/utils.ts) fija minimumFractionDigits/
  // maximumFractionDigits en 0 deliberadamente (comentario propio: evita un
  // hydration mismatch "$ 17.600" server vs "$ 17.600,00" client) usando
  // Intl.NumberFormat('es-CO', {style:'currency',...}), que en es-CO
  // antepone el símbolo con un espacio real ("$ 75.000"), no "$75.000".
  // Los tests hardcodeaban el formato sin espacio -- getByText('$75.000')
  // nunca matcheaba el texto real renderizado.
  test('deudas globales muestra resumen con datos', async ({ page }) => {
    // Create a worker with debt
    const trabajador = await createTrabajador(page, { nombre: `UIWorker ${Date.now()}` })
    await createDeuda(page, {
      trabajadorId: trabajador.trabajador.id,
      tipo: 'PRESTAMO',
      monto: 75000,
      descripcion: 'Prestamo para UI test'})

    await goto(page, '/deudas')

    // Total should be visible
    // FIX: getByText('$ 75.000') era ambiguo (strict mode violation) --
    // con un solo trabajador con deuda, el mismo monto aparece 3 veces
    // (total general, columna Pendiente de la fila, columna Original de
    // la fila). Además, esta describe usa beforeAll (un solo reset para
    // todo el archivo, serial) -- el total GENERAL de la página acumula
    // deudas de otros tests que ya corrieron antes en el mismo archivo,
    // así que no es un valor determinístico contra el que comparar. Se
    // verifica en su lugar la fila de ESTE trabajador específico.
    await expect(page.getByTestId(`deuda-resumen-pendiente-${trabajador.trabajador.id}`)).toHaveText('$ 75.000')
    // Worker name should appear
    await expect(page.getByText(trabajador.trabajador.nombre)).toBeVisible()
    // Link to worker detail
    // FIX: ambiguo -- el nombre del trabajador y el link "Ver detalle" de
    // la fila apuntan al mismo href.
    const link = page.locator(`a[href="/trabajadores/${trabajador.trabajador.id}"]`).first()
    await expect(link).toBeVisible()
  })

  test('deudas globales vacio sin deudas', async ({ page }) => {
    await goto(page, '/deudas')
    // If there are existing debts from other tests, this might not show empty
    // But the page should still load
    await expect(page.getByRole('heading', { name: 'Deudas Pendientes' })).toBeVisible()
  })

  test('trabajador detail page con tab de deudas', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `DetailUI ${Date.now()}` })

    await goto(page, `/trabajadores/${trabajador.trabajador.id}`)

    // Info tab should be visible
    await expect(page.getByRole('heading', { name: trabajador.trabajador.nombre })).toBeVisible()
    await expect(page.getByText('Informacion')).toBeVisible()
    await expect(page.getByText('Deudas')).toBeVisible()
  })

  test('crear deuda desde UI dialog', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `DialogWorker ${Date.now()}` })

    await goto(page, `/trabajadores/${trabajador.trabajador.id}`)

    // Click Deudas tab
    await page.getByRole('button', { name: 'Deudas' }).click()

    // Click Nueva Deuda
    await page.getByRole('button', { name: '+ Nueva Deuda' }).click()

    // Fill form
    await page.locator('select').first().selectOption('PRESTAMO')
    // FIX: input[type="number"] es ambiguo -- PRESTAMO activa
    // requierePlanPago() (nueva-deuda-dialog.tsx), que agrega 2 inputs
    // number más ("Plazo (nominas)", "Tope % por nomina"). El campo Monto
    // tiene placeholder="0" único.
    await page.getByPlaceholder('0', { exact: true }).fill('45000')
    await page.locator('textarea').fill('Prestamo desde UI dialog')

    // Submit
    await page.getByRole('button', { name: 'Crear Deuda' }).click()

    await waitForToast(page, 'Deuda creada exitosamente')

    // Verify debt appears
    await expect(page.getByText('Prestamo desde UI dialog')).toBeVisible()
    // FIX: getByText('$ 45.000') es ambiguo -- con una sola deuda nueva,
    // el mismo monto aparece en el resumen "Total Pendiente" Y en la
    // card de la deuda (pendiente == original recién creada).
    await expect(page.getByTestId('deudas-tab-total-pendiente')).toHaveText('$ 45.000')
  })

  test('registrar abono desde UI dialog', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `AbonoUI ${Date.now()}` })
    const tid = trabajador.trabajador.id

    // Create debt via API
    await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 80000,
      descripcion: 'Prestamo para abono UI'})

    await goto(page, `/trabajadores/${tid}`)
    await page.getByRole('button', { name: 'Deudas' }).click()

    // Wait for debt card to appear
    await expect(page.getByText('Prestamo para abono UI')).toBeVisible()

    // Click Registrar Abono
    await page.getByRole('button', { name: 'Registrar Abono' }).click()

    // Verify max amount shown
    // FIX: getByText('$ 80.000') era ambiguo -- con la deuda recién
    // creada (pendiente == original), el mismo monto aparece también en
    // el resumen/card detrás del dialog. Se apunta al texto del dialog.
    await expect(page.getByTestId('abono-dialog-max-monto')).toHaveText('$ 80.000')

    // Fill abono
    const numberInputs = page.locator('input[type="number"]')
    await numberInputs.first().fill('30000')
    await page.locator('textarea').fill('Abono parcial desde UI')

    // Submit
    // FIX: ambiguo -- coexiste con el botón "Registrar Abono" de la card
    // que abre el dialog. Se apunta al submit del form del dialog.
    await page.locator('form').getByRole('button', { name: 'Registrar Abono' }).click()

    await waitForToast(page, 'Abono registrado exitosamente')

    // Verify remaining amount
    // FIX: getByText('$ 50.000') era ambiguo -- el resumen "Total
    // Pendiente" y la card de la deuda muestran el mismo monto restante.
    await expect(page.getByTestId('deudas-tab-total-pendiente')).toHaveText('$ 50.000')
  })

  test('badge de deuda en card de trabajador', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `BadgeWorker ${Date.now()}` })
    const tid = trabajador.trabajador.id

    await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 60000,
      descripcion: 'Deuda para badge'})

    await goto(page, '/trabajadores')

    // Badge should show debt
    await expect(page.getByText('Deuda pendiente')).toBeVisible()
    await expect(page.getByText('$ 60.000')).toBeVisible()

    // Click on worker name should navigate to detail
    await page.locator(`a[href="/trabajadores/${tid}"]`).first().click()
    await expect(page.getByRole('heading', { name: trabajador.trabajador.nombre })).toBeVisible()
  })

  test('filtro de deudas pendientes/pagadas', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `FilterWorker ${Date.now()}` })
    const tid = trabajador.trabajador.id

    // FIX: las descripciones eran literalmente 'Pendiente'/'Pagada',
    // usadas como proxy de "la deuda aparece". Eso siempre fue frágil
    // (getByText('Pendiente') dependía de que NINGÚN otro texto de la UI
    // contuviera "Pendiente") y quedó roto cuando deudas-tab.tsx sumó
    // "Total Pendiente" (resumen) y el botón "Pendientes" -- ambos
    // contienen "Pendiente" como substring, violando strict mode. Se usan
    // descripciones únicas que no colisionan con ningún texto de la UI.
    // Sin substrings "Pendiente"/"Pagada"/"Pendientes"/"Pagadas" -- de lo
    // contrario siguen colisionando con esos textos de la UI (getByText
    // matchea por substring, no exacto).
    const DESC_PEND = 'DescripcionDeudaUnoXYZ'
    const DESC_PAG = 'DescripcionDeudaDosXYZ'

    // Create one pending debt
    const res1 = await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 40000,
      descripcion: DESC_PEND})
    await res1.json()

    // Create and pay off another
    const res2 = await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'OTRO',
      monto: 20000,
      descripcion: DESC_PAG})
    const body2 = await res2.json()
    await abonarDeuda(page, body2.deuda.id, { monto: 20000 })

    await goto(page, `/trabajadores/${tid}`)
    await page.getByRole('button', { name: 'Deudas' }).click()

    // Default filter: pendientes
    await expect(page.getByText(DESC_PEND)).toBeVisible()
    await expect(page.getByText(DESC_PAG)).not.toBeVisible()

    // Switch to pagadas
    await page.getByRole('button', { name: 'Pagadas' }).click()
    await expect(page.getByText(DESC_PAG)).toBeVisible()
    await expect(page.getByText(DESC_PEND)).not.toBeVisible()

    // Switch to todas
    await page.getByRole('button', { name: 'Todas' }).click()
    await expect(page.getByText(DESC_PEND)).toBeVisible()
    // FIX: 'Pagada' (sin exact) matchea también el botón "Pagadas" (filtro,
    // substring). El badge de estado real es el único con texto exacto.
    await expect(page.getByText('Pagada', { exact: true })).toBeVisible()
  })

  test('progress bar en deuda card', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `ProgressWorker ${Date.now()}` })
    const tid = trabajador.trabajador.id

    const res = await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 100000,
      descripcion: 'Deuda con progress'})
    const body = await res.json()
    await abonarDeuda(page, body.deuda.id, { monto: 50000 })

    await goto(page, `/trabajadores/${tid}`)
    await page.getByRole('button', { name: 'Deudas' }).click()

    // Progress bar should be at 50%
    const progressBar = page.locator('.bg-green-500.h-2')
    await expect(progressBar).toBeVisible()

    // Should show abono history
    // FIX: getByText('$ 50.000') era ambiguo -- el mismo monto restante
    // aparece en el resumen, la card, y la entrada de historial de abono.
    // Se apunta específicamente a la entrada de historial.
    await expect(page.locator('[data-testid^="deuda-abono-"]', { hasText: '$ 50.000' })).toBeVisible()
  })
})

// ─── Nomina Integration ──────────────────────────────────────────────────────

test.describe('Deudas + Nomina Integration', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    resetTestDatabase()
  })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('nomina AUTO descuenta deudas pendientes', async ({ page }) => {
    test.setTimeout(60000)

    // Create a repartidor with debt
    const trabajador = await createTrabajador(page, {
      nombre: `NominaDeudaWorker ${Date.now()}`,
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
      usaMoto: true})
    const tid = trabajador.trabajador.id

    // Create debt
    // FIX: la deuda debe caber dentro de lo pagable en el período (comisión
    // de 5 PACA_AGUA * comRepartAgua=500 = 2500 -- ver createTrabajador en
    // fixtures.ts) para que este test (que verifica pago COMPLETO,
    // montoPendiente=0) sea alcanzable. calcularDeduccionesDeuda() nunca
    // descuenta más de lo disponible (src/lib/nomina-deudas.ts); el caso de
    // deuda mayor al disponible ya lo cubre el siguiente test ("nomina con
    // deuda mayor al total deja remanente").
    await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 2000,
      descripcion: 'Prestamo antes de nomina'})

    // Create a closed embarque with deliveries for commissions
    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      // FIX: canal PUNTO + ventaRapida:true crea un pedido ya ENTREGADO al
      // crearse (venta de mostrador -- Pedido.estado se sincroniza a
      // estadoEntrega='ENTREGADO' en la creación, ver
      // PedidoMapper.toPrismaCreate). Un pedido así nunca puede pasar por
      // /enviar (exige estado=PENDIENTE) -- rechaza con PEDIDO_NOT_PENDIENTE
      // silenciosamente porque el test no verificaba el status de esa
      // respuesta, dejando el embarque sin pedidos y el cierre posterior con
      // conciliacion/comisiones en 0/undefined. DOMICILIO + ventaRapida:false
      // es el patrón real de un pedido que se despacha por embarque, usado
      // consistentemente en embarques-fixes.spec.ts/embarques-dedicado.spec.ts.
      canal: 'DOMICILIO',
      ventaRapida: false,
      // FIX: sin pagos al crear -- un pedido DOMICILIO se cobra en el
      // cierre del embarque (ver pedidos[0].pagos abajo), no al crearse.
      // Pagar acá también duplicaba el monto y excedía el total real del
      // pedido (PAGOS_EXCEDIDOS).
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }]})
    const pedidoJson = (await pedidoRes.json()).pedido
    const pedidoId = pedidoJson.id
    const totalReal = Number(pedidoJson.total)

    const embarqueRes = await createEmbarque(page, tid)
    const embarqueId = embarqueRes.embarque.id

    // Send embarque
    await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
    // FIX: adjuntar un pedido al embarque no transiciona el EMBARQUE mismo a
    // EN_RUTA -- son dos operaciones distintas. cerrar() exige que el
    // embarque esté EN_RUTA (transicion ABIERTO->CERRADO directa está
    // prohibida: "Transicion invalida: ABIERTO -> CERRADO. Permitidas:
    // EN_RUTA, CANCELADO"). Sin esta llamada, cerrar() fallaba con 400 y el
    // test no lo notaba porque no verificaba el status de esa respuesta.
    await apiPost(page, `/api/embarques/${embarqueId}/enviar`, {})

    // Close embarque
    await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
      pedidos: [{
        pedidoId,
        entregado: 'COMPLETO',
        productosEntregados: {
          cPacaAguaEnt: 5,
          cPacaHieloEnt: 0,
          cBotellonFabEnt: 0,
          cBotellonDomEnt: 0,
          cBolsaAguaEnt: 0,
          cBolsaHieloEnt: 0},
        pagado: 'COMPLETO',
        pagos: [{ metodo: 'EFECTIVO', monto: totalReal }]}],
      ventasLibres: [],
      productos: [
        { producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'PACA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOTELLON', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
      ],
      gastos: [],
      dineroEntregado: totalReal})

    // Create nomina
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - 7)

    const nominaRes = await apiPost(page, '/api/nomina', {
      trabajadorId: tid,
      fechaInicio: startDate.toISOString().split('T')[0],
      fechaFin: today.toISOString().split('T')[0],
      tipoCalculo: 'AUTO'})

    const nominaBody = await nominaRes.json()
    expect(nominaBody.success).toBe(true)

    // Verify debt was deducted
    const descuentoDeudas = nominaBody.detalles.descuentoDeudas
    expect(descuentoDeudas).toBe(2000)

    // Verify debt was reduced
    const deudasRes = await apiGet(page, `/api/deudas?trabajadorId=${tid}`)
    const deudasBody = await deudasRes.json()
    const deuda = deudasBody.deudas[0]
    expect(deuda.montoPendiente).toBe(0)
  })

  test('nomina con deuda mayor al total deja remanente', async ({ page }) => {
    test.setTimeout(60000)

    // Create a sellador with small commissions but big debt
    const trabajador = await createTrabajador(page, {
      nombre: `BigDebtWorker ${Date.now()}`,
      rol: 'SELLADOR',
      tipoPago: 'COMISION',
      usaMoto: false})
    const tid = trabajador.trabajador.id

    // Create big debt
    await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 500000,
      descripcion: 'Deuda grande'})

    // Create nomina with small total
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - 7)

    const nominaRes = await apiPost(page, '/api/nomina', {
      trabajadorId: tid,
      fechaInicio: startDate.toISOString().split('T')[0],
      fechaFin: today.toISOString().split('T')[0],
      tipoCalculo: 'AUTO'})

    const nominaBody = await nominaRes.json()
    expect(nominaBody.success).toBe(true)

    // Debt deduction should be limited to total
    const descuentoDeudas = nominaBody.detalles.descuentoDeudas
    expect(descuentoDeudas).toBeLessThanOrEqual(nominaBody.detalles.comisionTotal + nominaBody.detalles.salarioFijo)

    // Debt should still have remaining balance
    const deudasRes = await apiGet(page, `/api/deudas?trabajadorId=${tid}`)
    const deudasBody = await deudasRes.json()
    const deuda = deudasBody.deudas[0]
    expect(deuda.montoPendiente).toBeGreaterThan(0)
  })

  test('anular nomina restaura deudas deducidas', async ({ page }) => {
    test.setTimeout(60000)

    // Create a sellador
    const trabajador = await createTrabajador(page, {
      nombre: `AnularWorker ${Date.now()}`,
      rol: 'SELLADOR',
      tipoPago: 'COMISION',
      usaMoto: false})
    const tid = trabajador.trabajador.id

    // Create debt
    await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 30000,
      descripcion: 'Deuda para anular'})

    // Create nomina
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - 7)

    const nominaRes = await apiPost(page, '/api/nomina', {
      trabajadorId: tid,
      fechaInicio: startDate.toISOString().split('T')[0],
      fechaFin: today.toISOString().split('T')[0],
      tipoCalculo: 'AUTO'})

    const nominaBody = await nominaRes.json()
    const nominaId = nominaBody.nomina.id

    // Verify debt was deducted
    const deudasRes1 = await apiGet(page, `/api/deudas?trabajadorId=${tid}`)
    const deudasBody1 = await deudasRes1.json()
    expect(deudasBody1.deudas[0].montoPendiente).toBe(0)

    // Annull nomina
    const anularRes = await apiPut(page, `/api/nomina/${nominaId}`, { action: 'ANULAR' })
    expect(anularRes.status()).toBe(200)

    // Verify debt was restored
    const deudasRes2 = await apiGet(page, `/api/deudas?trabajadorId=${tid}`)
    const deudasBody2 = await deudasRes2.json()
    expect(deudasBody2.deudas[0].montoPendiente).toBe(30000)
  })
})

// ─── Embarque Cash Reconciliation ────────────────────────────────────────────

test.describe('Embarque Cash Reconciliation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('cierre de embarque retorna deficitCaja en conciliacion', async ({ page }) => {
    const trabajador = await createTrabajador(page, {
      nombre: `CashWorker ${Date.now()}`,
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
      usaMoto: true})
    const tid = trabajador.trabajador.id

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 3 }]})
    const pedidoJson = (await pedidoRes.json()).pedido
    const pedidoId = pedidoJson.id
    // FIX: el precio real depende del tier de volumen (ver
    // src/modules/pedidos/.../precio-volumen), no es un monto fijo -- usar
    // el total que la API realmente calculó en vez de un monto hardcodeado
    // evita PAGOS_EXCEDIDOS si el pricing cambia.
    const totalReal = Number(pedidoJson.total)

    const embarqueRes = await createEmbarque(page, tid)
    const embarqueId = embarqueRes.embarque.id

    // Send
    await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
    // FIX: adjuntar un pedido al embarque no transiciona el EMBARQUE mismo a
    // EN_RUTA -- son dos operaciones distintas. cerrar() exige que el
    // embarque esté EN_RUTA (transicion ABIERTO->CERRADO directa está
    // prohibida: "Transicion invalida: ABIERTO -> CERRADO. Permitidas:
    // EN_RUTA, CANCELADO"). Sin esta llamada, cerrar() fallaba con 400 y el
    // test no lo notaba porque no verificaba el status de esa respuesta.
    await apiPost(page, `/api/embarques/${embarqueId}/enviar`, {})

    // Close with LESS cash than expected (simulating lost bill)
    const cerrarRes = await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
      pedidos: [{
        pedidoId,
        entregado: 'COMPLETO',
        productosEntregados: {
          cPacaAguaEnt: 3,
          cPacaHieloEnt: 0,
          cBotellonFabEnt: 0,
          cBotellonDomEnt: 0,
          cBolsaAguaEnt: 0,
          cBolsaHieloEnt: 0},
        pagado: 'COMPLETO',
        pagos: [{ metodo: 'EFECTIVO', monto: totalReal }]}],
      ventasLibres: [],
      productos: [
        { producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'PACA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOTELLON', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
      ],
      gastos: [],
      dineroEntregado: totalReal - 5000, // Less than received = 5000 deficit
    })

    const cerrarBody = await cerrarRes.json()
    expect(cerrarBody.success).toBe(true)

    // FIX: la data de reconciliación de caja vive en `caja`, no en
    // `conciliacion` (ese campo es para discrepancias de PRODUCTO --
    // totalCargado/totalEntregado/discrepancias -- ver CierrePresenter.ts).
    // `caja` usa otros nombres: efectivoEsperado (= pagos EFECTIVO
    // recibidos), dineroEntregadoReportado, sobranteFaltante (=
    // dineroEntregado - efectivoReal, mismo signo que el "deficitCaja"
    // negativo que este test espera -- ver cerrar-embarque-caja.helper.ts).
    const caja = cerrarBody.caja
    expect(caja.efectivoEsperado).toBe(totalReal)
    expect(caja.dineroEntregadoReportado).toBe(totalReal - 5000)
    expect(caja.sobranteFaltante).toBe(-5000) // Negative = deficit
  })

  test('cierre con cuadre perfecto retorna deficitCaja = 0', async ({ page }) => {
    const trabajador = await createTrabajador(page, {
      nombre: `PerfectCash ${Date.now()}`,
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
      usaMoto: true})
    const tid = trabajador.trabajador.id

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }]})
    const pedidoJson = (await pedidoRes.json()).pedido
    const pedidoId = pedidoJson.id
    const totalReal = Number(pedidoJson.total)

    const embarqueRes = await createEmbarque(page, tid)
    const embarqueId = embarqueRes.embarque.id

    await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
    // FIX: adjuntar un pedido al embarque no transiciona el EMBARQUE mismo a
    // EN_RUTA -- son dos operaciones distintas. cerrar() exige que el
    // embarque esté EN_RUTA (transicion ABIERTO->CERRADO directa está
    // prohibida: "Transicion invalida: ABIERTO -> CERRADO. Permitidas:
    // EN_RUTA, CANCELADO"). Sin esta llamada, cerrar() fallaba con 400 y el
    // test no lo notaba porque no verificaba el status de esa respuesta.
    await apiPost(page, `/api/embarques/${embarqueId}/enviar`, {})

    const cerrarRes = await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
      pedidos: [{
        pedidoId,
        entregado: 'COMPLETO',
        productosEntregados: {
          cPacaAguaEnt: 2,
          cPacaHieloEnt: 0,
          cBotellonFabEnt: 0,
          cBotellonDomEnt: 0,
          cBolsaAguaEnt: 0,
          cBolsaHieloEnt: 0},
        pagado: 'COMPLETO',
        pagos: [{ metodo: 'EFECTIVO', monto: totalReal }]}],
      ventasLibres: [],
      productos: [
        { producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'PACA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOTELLON', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
      ],
      gastos: [],
      dineroEntregado: totalReal, // Exact match
    })

    const cerrarBody = await cerrarRes.json()
    expect(cerrarBody.caja.sobranteFaltante).toBe(0)
  })
})

// ─── Permissions / RBAC ──────────────────────────────────────────────────────

test.describe('Deudas Permissions', () => {
  // FIX: POST /api/trabajadores exige ADMIN (src/app/api/trabajadores/route.ts:47)
  // -- crear el trabajador de prueba mientras el page ya estaba logueado como
  // CONTADOR/ASISTENTE devolvía 403 en el propio setup, dejando
  // trabajador.trabajador undefined y un TypeError al leer .id, antes de
  // siquiera llegar al POST /api/deudas que el test realmente valida. Mismo
  // patron ya establecido en roles-permisos.spec.ts:209 "SÍ puede crear
  // embarque": crear como admin, luego cambiar de sesion al rol bajo prueba.
  test('contador no puede crear deuda', async ({ page }) => {
    await loginAs(page, 'admin')
    const trabajador = await createTrabajador(page, { nombre: `PermWorker ${Date.now()}` })

    await loginAs(page, 'contador')
    await goto(page, '/dashboard')

    const res = await apiPost(page, '/api/deudas', {
      trabajadorId: trabajador.trabajador.id,
      tipo: 'PRESTAMO',
      monto: 10000,
      descripcion: 'Intento no autorizado'})

    expect(res.status()).toBe(403)
  })

  test('repartidor no puede crear deuda', async ({ page }) => {
    await loginAs(page, 'repartidor')
    await goto(page, '/dashboard')

    const res = await apiPost(page, '/api/deudas', {
      trabajadorId: 'some-id',
      tipo: 'PRESTAMO',
      monto: 10000,
      descripcion: 'Intento no autorizado'})

    expect(res.status()).toBe(403)
  })

  test('asistente puede crear deuda', async ({ page }) => {
    await loginAs(page, 'admin')
    const trabajador = await createTrabajador(page, { nombre: `AsistWorker ${Date.now()}` })

    await loginAs(page, 'asistente')
    await goto(page, '/dashboard')

    const res = await apiPost(page, '/api/deudas', {
      trabajadorId: trabajador.trabajador.id,
      tipo: 'PRESTAMO',
      monto: 20000,
      descripcion: 'Prestamo autorizado por asistente'})

    expect(res.status()).toBe(201)
  })

  test('admin puede crear deuda', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/dashboard')

    const trabajador = await createTrabajador(page, { nombre: `AdminWorker ${Date.now()}` })

    const res = await apiPost(page, '/api/deudas', {
      trabajadorId: trabajador.trabajador.id,
      tipo: 'PRESTAMO',
      monto: 30000,
      descripcion: 'Prestamo autorizado por admin'})

    expect(res.status()).toBe(201)
  })

  test('asistente puede registrar abono', async ({ page }) => {
    await loginAs(page, 'asistente')
    await goto(page, '/dashboard')

    // Create debt as admin first
    const adminPage = await page.context().browser()!.newPage()
    await loginAs(adminPage, 'admin')
    const trabajador = await createTrabajador(adminPage, { nombre: `AbonoAsist ${Date.now()}` })
    const res1 = await apiPost(adminPage, '/api/deudas', {
      trabajadorId: trabajador.trabajador.id,
      tipo: 'PRESTAMO',
      monto: 40000,
      descripcion: 'Deuda para abono'})
    const body1 = await res1.json()
    const deudaId = body1.deuda.id
    await adminPage.close()

    // Abono as asistente
    const res2 = await apiPost(page, `/api/deudas/${deudaId}/abonar`, {
      monto: 10000,
      nota: 'Abono por asistente'})

    expect(res2.status()).toBe(201)
  })
})
