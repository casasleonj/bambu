// @tests #617 — corregir la fecha efectiva de un cobro desde el detalle del pedido: solo el ADMIN, con motivo,
// confirmación y rastro; un día cerrado se remite a la regularización formal. Cada prueba mira la BASE.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { test, expect, loginAs, apiPost, resetTestDatabase, BASE } from './fixtures'

const prisma = new PrismaClient()
// Años lejos de "hoy": ningún otro spec cierra ni mueve estos días.
const REGISTRO = new Date('2020-06-15T14:00:00Z') // 15 jun 2020, 09:00 en Bogotá
const DIA_CORREGIDO = '2020-06-12'

async function pagoRegistrado() {
  const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente sintético fecha de pago', telefono: randomUUID(), direccion: 'Prueba' } })
  const pedido = await prisma.pedido.create({ data: {
    clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: REGISTRO,
    estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO', estadoPago: 'PAGADO', total: 50000, totalPagado: 50000, saldo: 0,
  } })
  const pago = await prisma.pago.create({ data: { pedidoId: pedido.id, monto: 50000, metodo: 'NEQUI', createdAt: REGISTRO } })
  return { pedido, pago }
}

test.describe('Pagos #617: corregir la fecha efectiva de un cobro', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(async () => {
    resetTestDatabase()
    await prisma.cierreDia.deleteMany({})
  })
  test.afterAll(async () => { await prisma.$disconnect() })

  test('el ADMIN corrige desde el detalle (con confirmación) y queda la fecha nueva y el historial; el registro no cambia', async ({ page }) => {
    const { pedido, pago } = await pagoRegistrado()
    await loginAs(page, 'admin')
    await page.goto(`${BASE}/pedidos?openPedido=${pedido.id}`)
    await page.getByTestId('pago-corregir-fecha-abrir').click()
    await page.getByTestId('pago-corregir-fecha-dia').fill(DIA_CORREGIDO)
    await expect(page.getByTestId('pago-corregir-fecha-revisar')).toBeDisabled() // falta el motivo
    await page.getByTestId('pago-corregir-fecha-motivo').fill('Error de digitación')
    await page.getByTestId('pago-corregir-fecha-revisar').click()
    await expect(page.getByTestId('pago-corregir-fecha-confirmar-bloque')).toContainText('¿Cambiar la fecha del cobro?')
    expect(await prisma.pagoFechaCorreccion.count({ where: { pagoId: pago.id } })).toBe(0) // todavía no se guardó
    await page.getByTestId('pago-corregir-fecha-confirmar').click()

    await expect(page.getByTestId('detalle-pago-correcciones')).toContainText('Error de digitación', { timeout: 15000 })
    await expect(page.getByTestId('detalle-pago-fechas')).toContainText('Se cobró')

    const despues = await prisma.pago.findUniqueOrThrow({ where: { id: pago.id } })
    expect(despues.createdAt.toISOString()).toBe(REGISTRO.toISOString())
    expect(despues.ocurridoAt?.toISOString()).toBe('2020-06-12T17:00:00.000Z')
    const filas = await prisma.pagoFechaCorreccion.findMany({ where: { pagoId: pago.id } })
    expect(filas).toHaveLength(1)
    expect(filas[0].motivo).toBe('Error de digitación')
  })

  test('el ASISTENTE no ve el botón y el servidor le responde 403 sin crear nada', async ({ page }) => {
    const { pedido, pago } = await pagoRegistrado()
    await loginAs(page, 'asistente')
    await page.goto(`${BASE}/pedidos?openPedido=${pedido.id}`)
    await expect(page.getByTestId('detalle-pago')).toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId('pago-corregir-fecha-abrir')).toHaveCount(0)
    const res = await apiPost(page, `/api/pagos/${pago.id}/corregir-fecha`, { fecha: DIA_CORREGIDO, motivo: 'quiero cambiarla' })
    expect(res.status()).toBe(403)
    expect((await prisma.pago.findUniqueOrThrow({ where: { id: pago.id } })).ocurridoAt).toBeNull()
    expect(await prisma.pagoFechaCorreccion.count({ where: { pagoId: pago.id } })).toBe(0)
  })

  test('si el día ya está cerrado, avisa que hace falta una regularización formal y no cambia nada', async ({ page }) => {
    const { pedido, pago } = await pagoRegistrado()
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } })
    await prisma.cierreDia.create({ data: { fecha: new Date(`${DIA_CORREGIDO}T00:00:00-05:00`), cerradoPor: admin.id } })
    await loginAs(page, 'admin')
    await page.goto(`${BASE}/pedidos?openPedido=${pedido.id}`)
    await page.getByTestId('pago-corregir-fecha-abrir').click()
    await page.getByTestId('pago-corregir-fecha-dia').fill(DIA_CORREGIDO)
    await page.getByTestId('pago-corregir-fecha-motivo').fill('Error de digitación')
    await page.getByTestId('pago-corregir-fecha-revisar').click()
    await page.getByTestId('pago-corregir-fecha-confirmar').click()
    await expect(page.getByTestId('pago-corregir-fecha-error')).toContainText('regularización formal', { timeout: 15000 })
    expect((await prisma.pago.findUniqueOrThrow({ where: { id: pago.id } })).ocurridoAt).toBeNull()
    expect(await prisma.pagoFechaCorreccion.count({ where: { pagoId: pago.id } })).toBe(0)
  })
})
