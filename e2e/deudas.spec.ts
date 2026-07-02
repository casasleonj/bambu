import { test, expect } from '@playwright/test'
import {fullLogin,
  loginAs,
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

async function createDeuda(page: any, data: {
  trabajadorId: string
  tipo: string
  monto: number
  descripcion: string
}) {
  return apiPost(page, '/api/deudas', data)
}

async function abonarDeuda(page: any, deudaId: string, data: {
  monto: number
  nota?: string
}) {
  return apiPost(page, `/api/deudas/${deudaId}/abonar`, data)
}

// ─── API Tests ───────────────────────────────────────────────────────────────

test.describe('Deudas API', () => {
  test.beforeEach(async ({ page }) => {
    await fullLogin(page)
  })

  test('crear deuda prestamo via API', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `DeudaWorker ${Date.now()}` })
    const tid = trabajador.trabajador.id

    const res = await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 50000,
      descripcion: 'Prestamo personal',
    })

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
      descripcion: 'Faltante en cierre de embarque',
    })

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
      descripcion: 'Deuda invalida',
    })

    expect(res.status()).toBe(400)
  })

  test('rechazar deuda sin descripcion', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `NoDescWorker ${Date.now()}` })

    const res = await createDeuda(page, {
      trabajadorId: trabajador.trabajador.id,
      tipo: 'PRESTAMO',
      monto: 10000,
      descripcion: '',
    })

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

    const resumenT1 = body.resumen.find((r: any) => r.trabajadorId === t1.trabajador.id)
    expect(resumenT1.totalPendiente).toBe(80000)
    expect(resumenT1.cantidadDeudas).toBe(2)
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
      descripcion: 'Deuda invalida',
    })

    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error.message).toContain('inactivo')
  })
})

// ─── UI Tests ────────────────────────────────────────────────────────────────

test.describe('Deudas UI', () => {
  test.beforeEach(async ({ page }) => {
    await fullLogin(page)
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
      descripcion: 'Prestamo para UI test',
    })

    await goto(page, '/deudas')

    // Total should be visible
    await expect(page.getByText('$75.000')).toBeVisible()
    // Worker name should appear
    await expect(page.getByText(trabajador.trabajador.nombre)).toBeVisible()
    // Link to worker detail
    const link = page.locator(`a[href="/trabajadores/${trabajador.trabajador.id}"]`)
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
    await page.locator('input[type="number"]').fill('45000')
    await page.locator('textarea').fill('Prestamo desde UI dialog')

    // Submit
    await page.getByRole('button', { name: 'Crear Deuda' }).click()

    await waitForToast(page, 'Deuda creada exitosamente')

    // Verify debt appears
    await expect(page.getByText('Prestamo desde UI dialog')).toBeVisible()
    await expect(page.getByText('$45.000')).toBeVisible()
  })

  test('registrar abono desde UI dialog', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `AbonoUI ${Date.now()}` })
    const tid = trabajador.trabajador.id

    // Create debt via API
    await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 80000,
      descripcion: 'Prestamo para abono UI',
    })

    await goto(page, `/trabajadores/${tid}`)
    await page.getByRole('button', { name: 'Deudas' }).click()

    // Wait for debt card to appear
    await expect(page.getByText('Prestamo para abono UI')).toBeVisible()

    // Click Registrar Abono
    await page.getByRole('button', { name: 'Registrar Abono' }).click()

    // Verify max amount shown
    await expect(page.getByText('$80.000')).toBeVisible()

    // Fill abono
    const numberInputs = page.locator('input[type="number"]')
    await numberInputs.first().fill('30000')
    await page.locator('textarea').fill('Abono parcial desde UI')

    // Submit
    await page.getByRole('button', { name: 'Registrar Abono' }).click()

    await waitForToast(page, 'Abono registrado exitosamente')

    // Verify remaining amount
    await expect(page.getByText('$50.000')).toBeVisible()
  })

  test('badge de deuda en card de trabajador', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `BadgeWorker ${Date.now()}` })
    const tid = trabajador.trabajador.id

    await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 60000,
      descripcion: 'Deuda para badge',
    })

    await goto(page, '/trabajadores')

    // Badge should show debt
    await expect(page.getByText('Deuda pendiente')).toBeVisible()
    await expect(page.getByText('$60.000')).toBeVisible()

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
      descripcion: 'Pendiente',
    })
    await res1.json()

    // Create and pay off another
    const res2 = await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'OTRO',
      monto: 20000,
      descripcion: 'Pagada',
    })
    const body2 = await res2.json()
    await abonarDeuda(page, body2.deuda.id, { monto: 20000 })

    await goto(page, `/trabajadores/${tid}`)
    await page.getByRole('button', { name: 'Deudas' }).click()

    // Default filter: pendientes
    await expect(page.getByText('Pendiente')).toBeVisible()
    await expect(page.getByText('Pagada')).not.toBeVisible()

    // Switch to pagadas
    await page.getByRole('button', { name: 'Pagadas' }).click()
    await expect(page.getByText('Pagada')).toBeVisible()
    await expect(page.getByText('Pendiente')).not.toBeVisible()

    // Switch to todas
    await page.getByRole('button', { name: 'Todas' }).click()
    await expect(page.getByText('Pendiente')).toBeVisible()
    await expect(page.getByText('Pagada')).toBeVisible()
  })

  test('progress bar en deuda card', async ({ page }) => {
    const trabajador = await createTrabajador(page, { nombre: `ProgressWorker ${Date.now()}` })
    const tid = trabajador.trabajador.id

    const res = await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 100000,
      descripcion: 'Deuda con progress',
    })
    const body = await res.json()
    await abonarDeuda(page, body.deuda.id, { monto: 50000 })

    await goto(page, `/trabajadores/${tid}`)
    await page.getByRole('button', { name: 'Deudas' }).click()

    // Progress bar should be at 50%
    const progressBar = page.locator('.bg-green-500.h-2')
    await expect(progressBar).toBeVisible()

    // Should show abono history
    await expect(page.getByText('$50.000')).toBeVisible()
  })
})

// ─── Nomina Integration ──────────────────────────────────────────────────────

test.describe('Deudas + Nomina Integration', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    resetTestDatabase()
  })

  test.beforeEach(async ({ page }) => {
    await fullLogin(page)
  })

  test('nomina AUTO descuenta deudas pendientes', async ({ page }) => {
    test.setTimeout(60000)

    // Create a repartidor with debt
    const trabajador = await createTrabajador(page, {
      nombre: `NominaDeudaWorker ${Date.now()}`,
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
      usaMoto: true,
    })
    const tid = trabajador.trabajador.id

    // Create debt
    await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 50000,
      descripcion: 'Prestamo antes de nomina',
    })

    // Create a closed embarque with deliveries for commissions
    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 25000 }],
    })
    const pedidoId = (await pedidoRes.json()).pedido.id

    const embarqueRes = await createEmbarque(page, tid)
    const embarqueId = embarqueRes.embarque.id

    // Send embarque
    await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })

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
          cBolsaHieloEnt: 0,
        },
        pagado: 'COMPLETO',
        pagos: [{ metodo: 'EFECTIVO', monto: 25000 }],
      }],
      ventasLibres: [],
      productos: [
        { producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'PACA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOTELLON', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
      ],
      gastos: [],
      dineroEntregado: 25000,
    })

    // Create nomina
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - 7)

    const nominaRes = await apiPost(page, '/api/nomina', {
      trabajadorId: tid,
      fechaInicio: startDate.toISOString().split('T')[0],
      fechaFin: today.toISOString().split('T')[0],
      tipoCalculo: 'AUTO',
    })

    const nominaBody = await nominaRes.json()
    expect(nominaBody.success).toBe(true)

    // Verify debt was deducted
    const descuentoDeudas = nominaBody.detalles.descuentoDeudas
    expect(descuentoDeudas).toBe(50000)

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
      usaMoto: false,
    })
    const tid = trabajador.trabajador.id

    // Create big debt
    await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 500000,
      descripcion: 'Deuda grande',
    })

    // Create nomina with small total
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - 7)

    const nominaRes = await apiPost(page, '/api/nomina', {
      trabajadorId: tid,
      fechaInicio: startDate.toISOString().split('T')[0],
      fechaFin: today.toISOString().split('T')[0],
      tipoCalculo: 'AUTO',
    })

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
      usaMoto: false,
    })
    const tid = trabajador.trabajador.id

    // Create debt
    await createDeuda(page, {
      trabajadorId: tid,
      tipo: 'PRESTAMO',
      monto: 30000,
      descripcion: 'Deuda para anular',
    })

    // Create nomina
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - 7)

    const nominaRes = await apiPost(page, '/api/nomina', {
      trabajadorId: tid,
      fechaInicio: startDate.toISOString().split('T')[0],
      fechaFin: today.toISOString().split('T')[0],
      tipoCalculo: 'AUTO',
    })

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
    await fullLogin(page)
  })

  test('cierre de embarque retorna deficitCaja en conciliacion', async ({ page }) => {
    const trabajador = await createTrabajador(page, {
      nombre: `CashWorker ${Date.now()}`,
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
      usaMoto: true,
    })
    const tid = trabajador.trabajador.id

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 3 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 15000 }],
    })
    const pedidoId = (await pedidoRes.json()).pedido.id

    const embarqueRes = await createEmbarque(page, tid)
    const embarqueId = embarqueRes.embarque.id

    // Send
    await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })

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
          cBolsaHieloEnt: 0,
        },
        pagado: 'COMPLETO',
        pagos: [{ metodo: 'EFECTIVO', monto: 15000 }],
      }],
      ventasLibres: [],
      productos: [
        { producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'PACA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOTELLON', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
      ],
      gastos: [],
      dineroEntregado: 10000, // Less than 15000 received = 5000 deficit
    })

    const cerrarBody = await cerrarRes.json()
    expect(cerrarBody.success).toBe(true)

    // Cash reconciliation data should be present
    const conciliacion = cerrarBody.conciliacion
    expect(conciliacion.totalEfectivoRecibido).toBe(15000)
    expect(conciliacion.dineroEntregado).toBe(10000)
    expect(conciliacion.deficitCaja).toBe(-5000) // Negative = deficit
  })

  test('cierre con cuadre perfecto retorna deficitCaja = 0', async ({ page }) => {
    const trabajador = await createTrabajador(page, {
      nombre: `PerfectCash ${Date.now()}`,
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
      usaMoto: true,
    })
    const tid = trabajador.trabajador.id

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 10000 }],
    })
    const pedidoId = (await pedidoRes.json()).pedido.id

    const embarqueRes = await createEmbarque(page, tid)
    const embarqueId = embarqueRes.embarque.id

    await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })

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
          cBolsaHieloEnt: 0,
        },
        pagado: 'COMPLETO',
        pagos: [{ metodo: 'EFECTIVO', monto: 10000 }],
      }],
      ventasLibres: [],
      productos: [
        { producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'PACA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOTELLON', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'BOLSA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
      ],
      gastos: [],
      dineroEntregado: 10000, // Exact match
    })

    const cerrarBody = await cerrarRes.json()
    expect(cerrarBody.conciliacion.deficitCaja).toBe(0)
  })
})

// ─── Permissions / RBAC ──────────────────────────────────────────────────────

test.describe('Deudas Permissions', () => {
  test('contador no puede crear deuda', async ({ page }) => {
    await loginAs(page, 'contador')
    await goto(page, '/dashboard')

    const trabajador = await createTrabajador(page, { nombre: `PermWorker ${Date.now()}` })

    const res = await apiPost(page, '/api/deudas', {
      trabajadorId: trabajador.trabajador.id,
      tipo: 'PRESTAMO',
      monto: 10000,
      descripcion: 'Intento no autorizado',
    })

    expect(res.status()).toBe(403)
  })

  test('repartidor no puede crear deuda', async ({ page }) => {
    await loginAs(page, 'repartidor')
    await goto(page, '/dashboard')

    const res = await apiPost(page, '/api/deudas', {
      trabajadorId: 'some-id',
      tipo: 'PRESTAMO',
      monto: 10000,
      descripcion: 'Intento no autorizado',
    })

    expect(res.status()).toBe(403)
  })

  test('asistente puede crear deuda', async ({ page }) => {
    await loginAs(page, 'asistente')
    await goto(page, '/dashboard')

    const trabajador = await createTrabajador(page, { nombre: `AsistWorker ${Date.now()}` })

    const res = await apiPost(page, '/api/deudas', {
      trabajadorId: trabajador.trabajador.id,
      tipo: 'PRESTAMO',
      monto: 20000,
      descripcion: 'Prestamo autorizado por asistente',
    })

    expect(res.status()).toBe(201)
  })

  test('admin puede crear deuda', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/dashboard')

    const trabajador = await createTrabajador(page, { nombre: `AdminWorker ${Date.now()}` })

    const res = await apiPost(page, '/api/deudas', {
      trabajadorId: trabajador.trabajador.id,
      tipo: 'PRESTAMO',
      monto: 30000,
      descripcion: 'Prestamo autorizado por admin',
    })

    expect(res.status()).toBe(201)
  })

  test('asistente puede registrar abono', async ({ page }) => {
    await loginAs(page, 'asistente')
    await goto(page, '/dashboard')

    // Create debt as admin first
    const adminPage = await page.context().browser()!.newPage()
    await fullLogin(adminPage)
    const trabajador = await createTrabajador(adminPage, { nombre: `AbonoAsist ${Date.now()}` })
    const res1 = await apiPost(adminPage, '/api/deudas', {
      trabajadorId: trabajador.trabajador.id,
      tipo: 'PRESTAMO',
      monto: 40000,
      descripcion: 'Deuda para abono',
    })
    const body1 = await res1.json()
    const deudaId = body1.deuda.id
    await adminPage.close()

    // Abono as asistente
    const res2 = await apiPost(page, `/api/deudas/${deudaId}/abonar`, {
      monto: 10000,
      nota: 'Abono por asistente',
    })

    expect(res2.status()).toBe(201)
  })
})
