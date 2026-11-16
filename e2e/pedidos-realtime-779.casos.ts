// @tests #779 — suscripciones estables con red normal/lenta y pestañas independientes.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { test, expect, applyCachedRoleAuth, skipBaseCaja, goto, appMain, resetTestDatabase } from './fixtures'

const db = new PrismaClient()
test.describe('Regresión #779: Pedidos y Fiados en móvil sin bucles', () => {
  // El job del Hub selecciona chromium (desktop). Mantener estos casos
  // móviles dentro de ese job, sin depender de una ejecución manual extra.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    timezoneId: 'America/Bogota',
    // Producción monta SerwistProvider. Bloquear su registro provoca el
    // error conocido `.waiting` (documentado en src/app/layout.tsx).
    // Contexto nuevo por test: usar la PWA real sin ocultar pageerrors.
    serviceWorkers: 'allow' })
  test.skip(process.env.NEXT_PUBLIC_PEDIDOS_V2 !== 'true', 'requiere Hub ON')
  test.setTimeout(60000)
  test.beforeEach(() => resetTestDatabase())
  test.afterAll(() => db.$disconnect())

  for (const role of ['admin', 'asistente'] as const) {
    for (const slow of [false, true]) {
      test(`${role}, red ${slow ? 'lenta' : 'normal'}: Fiados, filtros, detalle y reconexión conservan su contexto`, async ({ page, context }) => {
        const cliente = await db.cliente.create({ data: { nombre: `Prueba779 ${randomUUID().slice(0, 8)}`, telefono: randomUUID() } })
        const pedido = await db.pedido.create({ data: {
          clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
          estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO', estadoPago: 'PENDIENTE',
          total: 10000, totalPagado: 0, saldo: 10000,
          items: { create: { producto: 'PACA_AGUA', cantPedido: 4, cantEntrega: 4, precio: 2500, subtotal: 10000 } },
        } })
        await db.factura.create({ data: {
          numero: `F779-${randomUUID().slice(0, 8)}`, pedidoId: pedido.id,
          clienteId: cliente.id, subtotal: 10000, total: 10000, saldo: 10000,
        } })
        await page.addInitScript(({ slow }) => {
          localStorage.setItem('pwa-install-banner-dismissed', 'true')
          Object.defineProperty(navigator, 'connection', { configurable: true, value: {
            effectiveType: slow ? '2g' : '4g', downlink: slow ? 0.5 : 10, saveData: slow,
          } })
        }, { slow })
        const errors: string[] = []
        let etapa = 'entrada directa a Fiados'
        page.on('pageerror', e => errors.push(`${etapa}: ${e.message}`))
        page.on('console', m => {
          if (m.type() === 'error' && /Maximum update depth|Minified React error #185/.test(m.text())) errors.push(m.text())
        })
        let consultas = 0
        page.on('request', r => {
          if (new URL(r.url()).pathname === '/api/pedidos/consulta') consultas++
        })
        // Entrada directa autenticada a Fiados; no esperar networkidle en
        // Dashboard, que mantiene una conexión SSE abierta legítimamente.
        await skipBaseCaja(page)
        await applyCachedRoleAuth(page, role)
        await goto(page, `/pedidos?tab=fiados&all=true&pedidosCliente=${cliente.id}`)
        const app = appMain(page)
        await expect(app.getByTestId('fiados-total')).toHaveAttribute('aria-busy', 'false')
        await app.getByLabel('Buscar cliente', { exact: true }).fill(cliente.nombre)
        await expect(app.getByText(cliente.nombre, { exact: true }).locator('visible=true').first()).toBeVisible()
        await app.getByRole('button', { name: 'Ver pedidos', exact: true }).locator('visible=true').click()
        etapa = 'abrir pedido desde Fiados'
        await app.getByRole('link', { name: `Ver pedido #${pedido.numero}`, exact: true }).locator('visible=true').click()
        const detalle = page.getByRole('dialog', { name: `Pedido #${pedido.numero}`, exact: true })
        await expect(detalle).toContainText(cliente.nombre, { timeout: 15000 })
        await detalle.getByRole('button', { name: 'Volver a Fiados', exact: true }).click()

        etapa = 'pasar de Fiados a Pedidos'
        await app.getByTestId('tab-hoy').click()
        const row = app.getByTestId(`operacion-row-${pedido.id}`)
        await expect(row).toBeVisible()
        expect(new URL(page.url()).searchParams.get('clienteId')).toBe(cliente.id)
        const filtros = app.getByTestId('consulta-filtros')
        etapa = 'aplicar Ayer y volver a Fiados'
        await filtros.getByRole('button', { name: 'Ayer', exact: true }).click()
        await expect(row).toHaveCount(0)
        await expect(app.getByText('Actualizando la consulta…', { exact: true })).toHaveCount(0)
        await app.getByTestId('tab-fiados').click()
        await expect(app.getByRole('link', { name: `Ver pedido #${pedido.numero}`, exact: true }).locator('visible=true')).toBeVisible()
        await app.getByTestId('tab-hoy').click()
        await filtros.getByRole('button', { name: 'Todos', exact: true }).click()
        await expect(row).toBeVisible()

        // Sin interacción ni eventos nuevos, el número de solicitudes debe
        // estabilizarse. El bug emitía ~15 por segundo en este escenario.
        const antes = consultas
        await page.waitForTimeout(2000)
        expect(consultas - antes).toBeLessThanOrEqual(1)
        etapa = 'perder y recuperar conexión'
        await context.setOffline(true)
        await expect(app.getByTestId('pedido-hub-offline')).toBeVisible()
        await expect(row).toBeVisible()
        await context.setOffline(false)
        await expect(app.getByTestId('pedido-hub-offline')).toHaveCount(0)
        await expect(row).toBeVisible()
        etapa = 'recargar la consulta'
        await page.reload()
        await expect(row).toBeVisible()
        const trasRecargar = consultas
        await page.waitForTimeout(2000)
        expect(consultas - trasRecargar).toBeLessThanOrEqual(1)
        expect(errors).toEqual([])
      })
    }
  }
})
