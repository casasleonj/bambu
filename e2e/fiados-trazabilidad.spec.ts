// @tests api/pedido, api/abono
import { test, expect } from '@playwright/test'
import { prisma } from '../src/lib/prisma'

const BASE = 'http://localhost:3000'

test.describe('Trazabilidad de pagos de fiados', () => {
  test('pagar fiado crea Pago en pedido y Abono en factura', async ({ page }) => {
    // 1. Crear setup via Prisma
    const cliente = await prisma.cliente.create({
      data: {
        nombre: 'Cliente Test Fiado',
        telefono: '3001234567',
        direccion: 'Calle Test 123',
      },
    })

    const pedido = await prisma.pedido.create({
      data: {
        clienteId: cliente.id,
        canal: 'DOMICILIO',
        estadoEntrega: 'ENTREGADO',
        estadoPago: 'PARCIAL',
        total: 21000,
        totalPagado: 0,
        saldo: 21000,
        cPacaAguaPed: 1,
        cPacaAguaEnt: 1,
        precioPacaAgua: 10500,
        cPacaHieloPed: 1,
        cPacaHieloEnt: 1,
        precioPacaHielo: 10500,
      },
    })

    const factura = await prisma.factura.create({
      data: {
        numero: `FAC-TEST-${Date.now()}`,
        clienteId: cliente.id,
        pedidoId: pedido.id,
        subtotal: 21000,
        total: 21000,
        montoPagado: 0,
        saldo: 21000,
        estado: 'EMITIDA',
      },
    })

    // 2. Login via UI
    await page.goto(`${BASE}/login`)
    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button:has-text("Ingresar")')
    await page.waitForURL(/.*dashboard/, { timeout: 30000 })

    // 3. Pagar fiado via API (usando cookies de sesión)
    const pagarRes = await page.request.post(`${BASE}/api/pedidos/pagar-fiado`, {
      data: {
        clienteId: cliente.id,
        monto: 21000,
        metodo: 'EFECTIVO',
      },
    })
    expect(pagarRes.ok()).toBeTruthy()
    const pagarData = await pagarRes.json()
    expect(pagarData.pagosAplicados).toBeDefined()
    expect(pagarData.pagosAplicados.length).toBeGreaterThan(0)
    expect(pagarData.pagosAplicados[0].abonoCreado).toBe(true)

    // 4. Verificar en base de datos que se creó el Abono
    const abonos = await prisma.abono.findMany({
      where: { facturaId: factura.id },
    })
    expect(abonos.length).toBeGreaterThan(0)
    expect(abonos[0].pedidoId).toBe(pedido.id)
    expect(Number(abonos[0].monto)).toBe(21000)
    expect(abonos[0].metodoPago).toBe('EFECTIVO')

    // 5. Verificar que se creó el Pago
    const pagos = await prisma.pago.findMany({
      where: { pedidoId: pedido.id },
    })
    expect(pagos.length).toBeGreaterThan(0)
    expect(Number(pagos[0].monto)).toBe(21000)

    // 6. Verificar que la factura quedó PAGADA
    const facturaActualizada = await prisma.factura.findUnique({
      where: { id: factura.id },
    })
    expect(facturaActualizada?.estado).toBe('PAGADA')
    expect(Number(facturaActualizada?.saldo)).toBe(0)

    // 7. Verificar que el pedido quedó con saldo 0
    const pedidoActualizado = await prisma.pedido.findUnique({
      where: { id: pedido.id },
    })
    expect(Number(pedidoActualizado?.saldo)).toBe(0)

    // Cleanup
    await prisma.abono.deleteMany({ where: { facturaId: factura.id } })
    await prisma.pago.deleteMany({ where: { pedidoId: pedido.id } })
    await prisma.factura.delete({ where: { id: factura.id } })
    await prisma.pedido.delete({ where: { id: pedido.id } })
    await prisma.cliente.delete({ where: { id: cliente.id } })
  })
})
