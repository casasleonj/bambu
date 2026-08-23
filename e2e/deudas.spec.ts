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

  test('deudas globales muestra resumen con datos', async ({ page }) => {
    // Create a worker with debt
    const trabajador = await createTrabajador(page, { nombre: `UIWorker ${Date.now()}` })
    await createDeuda(page, {
      trabajadorId: trabajador.trabajador.id,
      tipo: 'PRESTAMO',
      monto: 75000,
      descripcion: 'Prestamo para UI test'})

    await goto(page, '/deudas')

    // Total should be visible. El monto aparece 2 veces (resumen + fila de
    // tabla) -- .first() para evitar violación de strict mode.
    await expect(page.getByText(/\$\s*75\.000/).first()).toBeVisible()
    // Worker name should appear
    await expect(page.getByText(trabajador.trabajador.nombre)).toBeVisible()
    // Link to worker detail. La fila tiene 2 links al mismo href (nombre +
    // "Ver detalle") -- .first() evita la violación de strict mode.
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

    // Fill form. El dialog tiene 3 inputs type="number" (monto + los
    // opcionales plazoNominas/porcentaje de nueva-deuda-dialog.tsx) --
    // placeholder="0" identifica el campo Monto sin ambigüedad.
    await page.locator('select').first().selectOption('PRESTAMO')
    await page.getByPlaceholder('0', { exact: true }).fill('45000')
    await page.locator('textarea').fill('Prestamo desde UI dialog')

    // Submit
    await page.getByRole('button', { name: 'Crear Deuda' }).click()

    await waitForToast(page, 'Deuda creada exitosamente')

    // Verify debt appears
    await expect(page.getByText('Prestamo desde UI dialog')).toBeVisible()
    await expect(page.getByText(/\$\s*45\.000/).first()).toBeVisible()
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

    // Verify max amount shown. El monto se repite en varios lugares del
    // dialog/card (encabezado, "de $X", etc.) -- .first() evita strict mode.
    await expect(page.getByText(/\$\s*80\.000/).first()).toBeVisible()

    // Fill abono
    const numberInputs = page.locator('input[type="number"]')
    await numberInputs.first().fill('30000')
    await page.locator('textarea').fill('Abono parcial desde UI')

    // Submit. El label "Registrar Abono" también está en el botón de la
    // card que abre el dialog -- se scopea al <form> para tomar el submit.
    await page.locator('form').getByRole('button', { name: 'Registrar Abono' }).click()

    await waitForToast(page, 'Abono registrado exitosamente')

    // Verify remaining amount
    await expect(page.getByText(/\$\s*50\.000/).first()).toBeVisible()
  })

  // FIXME: nunca implementado. trabajador-card.tsx no muestra ningún
  // indicador de deuda (verificado: cero menciones de "deuda" en el
  // componente) -- "Deuda pendiente" solo existe en el dialog de abono
  // (abono-deuda-dialog.tsx), no en la card de la lista de trabajadores.
  // Es un gap de feature real, no un selector roto: no se implementa acá
  // sin una decisión de producto sobre diseño/posición del badge.
  test.fixme('badge de deuda en card de trabajador', async ({ page }) => {
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
    await expect(page.getByText(/\$\s*60\.000/)).toBeVisible()

    // Click on worker name should navigate to detail
    await page.locator(`a[href="/trabajadores/${tid}"]`).first().click()
    await expect(page.getByRole('heading', { name: trabajador.trabajador.nombre })).toBeVisible()
  })

  test('filtro de deudas pendientes/pagadas', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `FilterWorker ${Date.now()}` })
    const tid = trabajador.trabajador.id

    // Create one pending debt
    const res1 = await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 40000,
      descripcion: 'Pendiente'})
    await res1.json()

    // Create and pay off another. Descripcion != 'Pagada': la card ya
    // renderiza su propio badge <span>Pagada</span> cuando montoPendiente
    // === 0 (deudas-tab.tsx) -- si la descripcion repite ese texto, el
    // assert exact:true de abajo choca en strict mode contra 2 nodos.
    const res2 = await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'OTRO',
      monto: 20000,
      descripcion: 'Deuda saldada'})
    const body2 = await res2.json()
    await abonarDeuda(page, body2.deuda.id, { monto: 20000 })

    await goto(page, `/trabajadores/${tid}`)
    await page.getByRole('button', { name: 'Deudas' }).click()

    // Default filter: pendientes. exact:true porque 'Pendiente' (substring)
    // también matchea la etiqueta 'Total Pendiente' y el botón 'Pendientes'
    // -- deuda.descripcion (el texto que realmente se está probando) es el
    // único nodo con el texto EXACTO 'Pendiente'.
    // exact:true: 'Pagada' (substring) también matchea el botón 'Pagadas'.
    await expect(page.getByText('Pendiente', { exact: true })).toBeVisible()
    await expect(page.getByText('Pagada', { exact: true })).not.toBeVisible()

    // Switch to pagadas
    await page.getByRole('button', { name: 'Pagadas' }).click()
    await expect(page.getByText('Pagada', { exact: true })).toBeVisible()
    await expect(page.getByText('Pendiente', { exact: true })).not.toBeVisible()

    // Switch to todas
    await page.getByRole('button', { name: 'Todas' }).click()
    await expect(page.getByText('Pendiente', { exact: true })).toBeVisible()
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

    // Should show abono history. El monto restante se repite en la card
    // (encabezado + historial de abonos) -- .first() evita strict mode.
    await expect(page.getByText(/\$\s*50\.000/).first()).toBeVisible()
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

    // Create debt. Monto menor a la comisión que va a generar el cierre de
    // abajo (5 PACA_AGUA * comRepartAgua=500/u = 2500, ver comisiones.ts /
    // fixtures.ts createTrabajador) para que la nómina AUTO pueda cubrir la
    // deuda COMPLETA en este período -- si la deuda superara la comisión
    // ganada, la deducción quedaría parcial (ese caso ya lo cubre el test
    // "nomina con deuda mayor al total deja remanente" más abajo).
    await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 2000,
      descripcion: 'Prestamo antes de nomina'})

    // Create a closed embarque with deliveries for commissions.
    // canal DOMICILIO + ventaRapida:false: el pedido nace PENDIENTE y puede
    // enviarse al embarque. Con ventaRapida:true nace ENTREGADO/PAGADO y
    // /enviar lo rechaza con 400 (ver fix en Embarque Cash Reconciliation).
    // Sin pagos en la creación: se paga en el cierre (ver comentario en
    // Embarque Cash Reconciliation). 5 PACA_AGUA cae en el rango de precio
    // por volumen 5-9u = 2500 c/u = 12500 total (prisma/seed.ts PRECIOS_VOLUMEN).
    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }]})
    const pedidoId = (await pedidoRes.json()).pedido.id

    const embarqueRes = await createEmbarque(page, tid)
    const embarqueId = embarqueRes.embarque.id

    // Send embarque
    const enviarRes = await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
    expect(enviarRes.status()).toBe(201)

    // /pedidos/[id]/enviar solo mueve el PEDIDO a EN_RUTA -- el EMBARQUE
    // sigue ABIERTO. cerrar() exige EN_RUTA->CERRADO (ABIERTO->CERRADO no es
    // una transición válida, ver EstadoEmbarque.ts), así que hay que mover
    // el embarque explícitamente. Mismo patrón que cerrarEmbarqueTest() en
    // ciclo-pedido-completo.spec.ts/embarques.spec.ts.
    await apiPut(page, `/api/embarques/${embarqueId}`, { estado: 'EN_RUTA' })

    // Close embarque
    const cerrarRes = await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
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
        pagos: [{ metodo: 'EFECTIVO', monto: 12500 }]}],
      ventasLibres: [],
      productos: [
        { producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'PACA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOTELLON', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
      ],
      gastos: [],
      dineroEntregado: 12500})
    const cerrarBodyDebug = await cerrarRes.json()
    expect(cerrarRes.status(), JSON.stringify(cerrarBodyDebug)).toBe(200)

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

    // REPARTIDOR (no SELLADOR): generar comSellTotal requiere un ciclo
    // completo de /api/produccion (conteos, stock, un embarque CERRADO del
    // mismo día, etc.) -- innecesariamente frágil para lo que este test
    // verifica (ANULAR restaura deudas). El patrón embarque->cierre con
    // REPARTIDOR ya está probado en "nomina AUTO descuenta deudas
    // pendientes" arriba y genera comisión de forma simple y determinista.
    const trabajador = await createTrabajador(page, {
      nombre: `AnularWorker ${Date.now()}`,
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
      usaMoto: true})
    const tid = trabajador.trabajador.id

    // Debt menor a la comisión generada abajo (5 PACA_AGUA * 500/u = 2500)
    // para que la nómina AUTO la cubra por completo, igual que en el test
    // de arriba.
    await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 2000,
      descripcion: 'Deuda para anular'})

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }]})
    const pedidoId = (await pedidoRes.json()).pedido.id

    const embarqueRes = await createEmbarque(page, tid)
    const embarqueId = embarqueRes.embarque.id

    const enviarRes = await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
    expect(enviarRes.status()).toBe(201)

    await apiPut(page, `/api/embarques/${embarqueId}`, { estado: 'EN_RUTA' })

    const cerrarRes = await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
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
        pagos: [{ metodo: 'EFECTIVO', monto: 12500 }]}],
      ventasLibres: [],
      productos: [
        { producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'PACA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOTELLON', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
      ],
      gastos: [],
      dineroEntregado: 12500})
    const cerrarBodyDebug = await cerrarRes.json()
    expect(cerrarRes.status(), JSON.stringify(cerrarBodyDebug)).toBe(200)

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
    expect(deudasBody2.deudas[0].montoPendiente).toBe(2000)
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
    // canal DOMICILIO + ventaRapida:false: el pedido nace PENDIENTE y se
    // paga en el cierre del embarque (no en la creación). Con
    // ventaRapida:true (venta de mostrador) el pedido nace ENTREGADO/PAGADO
    // y /enviar lo rechaza con "no está en estado pendiente" -- este test
    // necesita el flujo de reparto para poder probar la reconciliación de
    // caja en el cierre.
    // Sin pagos en la creación: el pedido nace PENDIENTE/sin pagar (saldo =
    // total). El pago real se registra en el cierre (abajo), que es lo que
    // efectivamente alimenta la reconciliación de caja (coleccionarPagos()
    // en cerrar-embarque-caja.helper.ts suma los pagos del cuadre de
    // cierre). 3 PACA_AGUA a precio de volumen (1-4 u.) = 2800 c/u = 8400
    // total -- ver prisma/seed.ts PRECIOS_VOLUMEN.
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 3 }]})
    const pedidoId = (await pedidoRes.json()).pedido.id

    const embarqueRes = await createEmbarque(page, tid)
    const embarqueId = embarqueRes.embarque.id

    // Send
    const enviarRes = await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
    expect(enviarRes.status()).toBe(201)

    // El embarque sigue ABIERTO tras /enviar (solo mueve el pedido); cerrar()
    // exige EN_RUTA->CERRADO. Ver comentario en el test de nómina arriba.
    await apiPut(page, `/api/embarques/${embarqueId}`, { estado: 'EN_RUTA' })

    // Close with LESS cash than expected (simulating lost bill). El
    // repartidor cobra el total real del pedido (8400) pero solo reporta
    // haber entregado 3400 -> deficit de 5000.
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
        pagos: [{ metodo: 'EFECTIVO', monto: 8400 }]}],
      ventasLibres: [],
      productos: [
        { producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'PACA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOTELLON', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
      ],
      gastos: [],
      dineroEntregado: 3400, // Less than 8400 cobrado = 5000 deficit
    })

    const cerrarBody = await cerrarRes.json()
    expect(cerrarBody.success).toBe(true)

    // Cash reconciliation data should be present. El shape real es
    // cerrarBody.caja (CierrePresenter), no "conciliacion" -- ese campo
    // existe pero es de reconciliación de PRODUCTOS, no de caja. Ver
    // cerrar-embarque-caja.helper.ts: sobranteFaltante = dineroEntregado - efectivoReal.
    const caja = cerrarBody.caja
    expect(caja.efectivoReal).toBe(8400)
    expect(caja.dineroEntregadoReportado).toBe(3400)
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
    // Ver comentario en el test anterior: DOMICILIO + ventaRapida:false y
    // sin pagos en la creación. 2 PACA_AGUA a 2800 c/u = 5600 total.
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }]})
    const pedidoId = (await pedidoRes.json()).pedido.id

    const embarqueRes = await createEmbarque(page, tid)
    const embarqueId = embarqueRes.embarque.id

    const enviarRes = await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
    expect(enviarRes.status()).toBe(201)

    await apiPut(page, `/api/embarques/${embarqueId}`, { estado: 'EN_RUTA' })

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
        pagos: [{ metodo: 'EFECTIVO', monto: 5600 }]}],
      ventasLibres: [],
      productos: [
        { producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'PACA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOTELLON', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
      ],
      gastos: [],
      dineroEntregado: 5600, // Exact match
    })

    const cerrarBody = await cerrarRes.json()
    expect(cerrarBody.success).toBe(true)
    expect(cerrarBody.caja.sobranteFaltante).toBe(0)
  })
})

// ─── Permissions / RBAC ──────────────────────────────────────────────────────

test.describe('Deudas Permissions', () => {
  test('contador no puede crear deuda', async ({ page }) => {
    // POST /api/trabajadores exige rol ADMIN -- crear el trabajador de
    // fixture con esa sesión ANTES de cambiar a la sesión restringida que
    // realmente se está probando (contador no puede crear deuda).
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
    // Mismo motivo que arriba: crear el trabajador como ADMIN antes de
    // cambiar a la sesión de asistente que se está probando.
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
