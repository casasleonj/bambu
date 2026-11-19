// @tests #836 F2b: hora acordada del pedido. «Programar entrega» al crear (cerrado por defecto), «Para hoy» por
// franjas (Ya toca / Normales / Más tarde hoy, plegado) y cambio de hora desde «Cambiar fecha prometida».
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { test, expect, loginAs, createCliente, goto, resetTestDatabase } from './fixtures'

const db = new PrismaClient()
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const mediodia = (d: string) => new Date(`${d}T12:00:00-05:00`)
const hub = process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true'
const incId = hub ? 'workspace-inc-PACA_AGUA' : 'item-inc-PACA_AGUA'
const commitId = hub ? 'workspace-commit' : 'submit-pedido'

test.describe('#836 F2b — hora acordada', () => {
  test.setTimeout(120000)
  test.beforeEach(() => resetTestDatabase())
  test.afterAll(() => db.$disconnect())

  test('crear: sin tocar «Programar entrega» el pedido nace como siempre; con hora queda hoy + hora', async ({ page }) => {
    await loginAs(page, 'admin')
    const { cliente } = await createCliente(page, { nombre: 'Cliente Programa', telefono: '3001230001' })
    const crear = async (cantidad = 1) => {
      await goto(page, '/pedidos') // parte de una página limpia: el enlace ?new=1 solo abre el formulario al cargar
      await goto(page, `/pedidos?new=1&clienteId=${cliente.id}`)
      await expect(page.getByText('📦 Nuevo Pedido')).toBeVisible({ timeout: 15000 })
      if (hub) await expect(page.getByTestId('comprador-nombre')).toContainText('Cliente Programa')
      for (let i = 0; i < cantidad; i++) await page.getByTestId(incId).click()
      await expect(page.getByTestId(commitId)).toBeEnabled({ timeout: 20000 }) // precios y preview resueltos
    }

    // 1) Sin programar: el bloque está cerrado y no se guarda nada.
    await crear()
    await expect(page.getByTestId('programar-entrega-toggle')).toContainText('Programar entrega (fecha u hora)')
    await expect(page.getByTestId('programar-hora')).toHaveCount(0)
    await page.getByTestId(commitId).click()
    await expect.poll(() => db.pedido.count({ where: { clienteId: cliente.id } }), { timeout: 20000 }).toBe(1)
    const sinProgramar = await db.pedido.findFirstOrThrow({ where: { clienteId: cliente.id } })
    expect(sinProgramar.entregaNoAntesDe).toBeNull()
    expect(sinProgramar.fechaEntrega).toBeNull()

    // 2) Con hora (y sin fecha = hoy): se guarda hoy y la hora.
    // Cantidad diferente: no activar el aviso de venta repetida del Hub.
    await crear(2)
    await page.getByTestId('programar-entrega-toggle').click()
    await page.getByTestId('programar-hora').fill('16:00')
    await page.getByTestId(commitId).click()
    await expect.poll(() => db.pedido.count({ where: { clienteId: cliente.id } }), { timeout: 20000 }).toBe(2)
    const conHora = await db.pedido.findFirstOrThrow({ where: { clienteId: cliente.id, entregaNoAntesDe: { not: null } } })
    expect(conHora.entregaNoAntesDe).toBe('16:00')
    expect(conHora.fechaEntrega!.toISOString().slice(0, 10)).toBe(hoy())
  })

  test('crear: una fecha pasada se explica y no guarda', async ({ page }) => {
    await loginAs(page, 'admin')
    const { cliente } = await createCliente(page, { nombre: 'Cliente Fecha Pasada', telefono: '3001230002' })
    await goto(page, '/pedidos') // parte de una página limpia: el enlace ?new=1 solo abre el formulario al cargar
    await goto(page, `/pedidos?new=1&clienteId=${cliente.id}`)
    await expect(page.getByText('📦 Nuevo Pedido')).toBeVisible({ timeout: 15000 })
    await page.getByTestId(incId).click()
    await expect(page.getByTestId(commitId)).toBeEnabled({ timeout: 20000 }) // precios resueltos
    await page.getByTestId('programar-entrega-toggle').click()
    await page.getByTestId('programar-fecha').evaluate((el: HTMLInputElement) => {
      // `min` no impide el valor programático: la regla del servidor y del formulario deben rechazarlo.
      el.removeAttribute('min')
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(el, '2026-01-05'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.getByTestId(commitId).click()
    await expect(page.getByTestId('programar-error')).toContainText('La fecha ya pasó')
    expect(await db.pedido.count({ where: { clienteId: cliente.id } })).toBe(0)
  })

  test('crear desde el FAB de Pedidos: mismo componente y persistencia de la programación', async ({ page }) => {
    await loginAs(page, 'admin')
    const nombre = 'Cliente FAB Programado'
    const { cliente } = await createCliente(page, { nombre, telefono: '3001230089' })
    await goto(page, '/pedidos')
    await page.getByTestId('fab-main').click()
    await page.getByTestId('fab-pedido-envio').click()
    await expect(page.getByText('📦 Nuevo Pedido')).toBeVisible()
    if (hub) {
      await expect(page.getByTestId('pedidos-workspace')).toBeVisible()
      await page.getByTestId('cliente-search-input').fill(nombre)
      await page.getByTestId('cliente-search-result').filter({ hasText: nombre }).click()
      await expect(page.getByTestId('comprador-nombre')).toContainText(nombre)
      await page.getByTestId(incId).click()
      await expect(page.getByTestId(commitId)).toBeEnabled({ timeout: 20000 })
      await page.getByTestId('programar-entrega-toggle').click()
      const manana = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
      await page.getByTestId('programar-fecha').fill(manana)
      await page.getByTestId('programar-hora').fill('15:30')
      await page.getByTestId(commitId).click()
      await expect.poll(() => db.pedido.count({ where: { clienteId: cliente.id } }), { timeout: 20000 }).toBe(1)
      const guardado = await db.pedido.findFirstOrThrow({ where: { clienteId: cliente.id } })
      expect(guardado.fechaEntrega?.toISOString()).toBe(mediodia(manana).toISOString())
      expect(guardado.entregaNoAntesDe).toBe('15:30')
      expect(guardado.estadoEntrega).toBe('PENDIENTE')
    } else {
      await expect(page.getByTestId('programar-entrega-toggle')).toBeVisible()
    }
  })

  test.describe('lista de Pedidos', () => {
    test.skip(process.env.NEXT_PUBLIC_PEDIDOS_V2 !== 'true', 'requiere Hub V2 activo')

    test('«Para hoy» agrupa por tiempo restante: Ya toca, Normales y Más tarde plegado (nada se oculta)', async ({ page }) => {
      const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } })
      const cli = await db.cliente.create({ data: { nombre: `ClienteFranja ${randomUUID().slice(0, 6)}`, telefono: randomUUID() } })
      const mk = (hora: string | null) => db.pedido.create({
        data: {
          clienteId: cli.id, createdById: admin.id, canal: 'DOMICILIO', origen: 'PEDIDO', estado: 'PENDIENTE', estadoEntrega: 'PENDIENTE',
          estadoPago: 'PENDIENTE', total: 1000, totalPagado: 0, saldo: 1000, fechaEntrega: mediodia(hoy()), entregaNoAntesDe: hora,
        },
      })
      const ya = await mk('06:30'); const sin = await mk(null); const c8 = await mk('08:00'); const t16 = await mk('16:00'); const t17 = await mk('17:30')
      await loginAs(page, 'admin')
      // El reloj del navegador se fija a las 6:10 a. m. de Bogotá para que las franjas sean deterministas.
      await page.clock.setFixedTime(new Date(`${hoy()}T06:10:00-05:00`))
      await goto(page, '/pedidos?foco=paraHoy&pageSize=50')

      await expect(page.getByTestId('franja-ya_toca')).toContainText('Ya toca · 1')
      await expect(page.getByTestId('franja-normal')).toContainText('Normales · 2')
      await expect(page.getByTestId('franja-mas_tarde')).toContainText('Más tarde hoy · 2')
      await expect(page.getByTestId(`operacion-row-${ya.id}`)).toBeVisible()
      await expect(page.getByTestId(`operacion-row-${sin.id}`)).toBeVisible()
      await expect(page.getByTestId(`operacion-row-${c8.id}`)).toBeVisible()
      // Plegado, pero no oculto: se despliega y están los dos.
      await expect(page.getByTestId(`operacion-row-${t16.id}`)).toHaveCount(0)
      await page.getByTestId('franja-mas-tarde-toggle').click()
      await expect(page.getByTestId(`operacion-row-${t16.id}`)).toBeVisible()
      await expect(page.getByTestId(`operacion-row-${t17.id}`)).toBeVisible()
      await expect(page.getByTestId(`operacion-hora-${t16.id}`)).toContainText('Faltan 9 h 50 min')
      // Orden: ya toca antes que los normales; los normales antes que los de más tarde.
      const filas = await page.locator('[data-testid^="operacion-row-"]').evaluateAll((n) => n.map((e) => e.getAttribute('data-testid')!.replace('operacion-row-', '')))
      expect(filas.indexOf(ya.id)).toBeLessThan(filas.indexOf(sin.id))
      expect(filas.indexOf(c8.id)).toBeLessThan(filas.indexOf(t16.id))
    })

    test('«Cambiar fecha prometida»: poner y luego quitar la hora, con historial', async ({ page }) => {
      const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } })
      const cli = await db.cliente.create({ data: { nombre: `ClienteHora ${randomUUID().slice(0, 6)}`, telefono: randomUUID() } })
      const p = await db.pedido.create({
        data: {
          clienteId: cli.id, createdById: admin.id, canal: 'DOMICILIO', origen: 'PEDIDO', estado: 'PENDIENTE', estadoEntrega: 'PENDIENTE',
          estadoPago: 'PENDIENTE', total: 1000, totalPagado: 0, saldo: 1000, fechaEntrega: mediodia(hoy()),
        },
      })
      await loginAs(page, 'admin')
      await goto(page, '/pedidos?all=true&pageSize=50')
      await page.locator(`[data-testid="operacion-row-${p.id}"]`).click()
      await page.getByTestId('reprogramar-abrir').click()
      const manana = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
      await page.getByTestId('reprogramar-fecha').fill(manana)
      await page.getByTestId('reprogramar-hora').fill('06:00')
      await page.getByTestId('reprogramar-confirmar').click()
      await expect(page.getByTestId('reprogramar-form')).toHaveCount(0)
      await expect.poll(async () => (await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).entregaNoAntesDe, { timeout: 15000 }).toBe('06:00')

      // Quitar la hora: se vacía el campo y queda null; el historial guarda 06:00 → null.
      // En móvil el panel del pedido sigue abierto tras el primer cambio; en escritorio hay que reabrirlo.
      if (await page.getByTestId('peek-mobile').isVisible()) await expect(page.getByTestId('reprogramar-abrir')).toBeVisible({ timeout: 15000 })
      else await page.locator(`[data-testid="operacion-row-${p.id}"]`).click()
      await page.getByTestId('reprogramar-abrir').click()
      await page.getByTestId('reprogramar-fecha').fill(manana)
      await page.getByTestId('reprogramar-hora').fill('')
      await page.getByTestId('reprogramar-confirmar').click()
      await expect(page.getByTestId('reprogramar-form')).toHaveCount(0)
      await expect.poll(async () => (await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).entregaNoAntesDe, { timeout: 15000 }).toBeNull()
      const h = await db.pedidoReprogramacion.findMany({ where: { pedidoId: p.id }, orderBy: { reprogramadoAt: 'asc' } })
      expect(h.map((x) => [x.horaAnterior, x.horaNueva])).toEqual([[null, '06:00'], ['06:00', null]])
    })
  })
})
