// @tests #499 — comisión del repartidor por día: se ve en el cierre de caja, se paga con un toque
// confirmado y queda en la base de datos. Cada prueba mira la BASE (no solo la pantalla).
import { test, expect, apiPost, createCliente, sharedLoginAs, goto, resetTestDatabase } from './fixtures'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const TARIFA = 400

type PaginaAdmin = Parameters<typeof createCliente>[0]

test.describe.configure({ mode: 'serial' })

async function repartidorConEntrega(page: PaginaAdmin, nombre: string, pacas: number) {
  const repartidor = await prisma.trabajador.create({
    data: { nombre, rol: 'REPARTIDOR', usaMoto: true, tipoPago: 'COMISION', comRepartAgua: TARIFA, comRepartHielo: TARIFA },
  })
  const telefono = `3${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`
  const { cliente } = await createCliente(page, { nombre: `Cliente ${nombre}`, telefono })
  const res = await apiPost(page, '/api/pedidos', {
    clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad: pacas }],
    offlineId: `cd-${Date.now()}-${Math.random()}`,
  })
  const body = await res.json()
  const pedido = body.data?.pedido ?? body.pedido
  await prisma.pedido.update({
    where: { id: pedido.id as string },
    data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', cPacaAguaEnt: pacas, entregadoAt: new Date(), entregadoPorId: repartidor.id },
  })
  return repartidor
}

test.describe('Comisión del repartidor en el cierre (#499)', () => {
  test.beforeAll(() => { resetTestDatabase() })
  test.afterAll(async () => { await prisma.$disconnect() })

  test('el ADMIN ve la comisión del día, la paga con un toque confirmado y la base lo registra', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const r = await repartidorConEntrega(page, `Pago E2E ${Date.now()}`, 2)

    await goto(page, '/cierre')
    const fila = page.getByTestId(`comision-${r.id}`)
    await expect(fila).toBeVisible({ timeout: 30000 })
    await expect(fila.getByTestId('comision-pendiente')).toContainText('800')

    // Cancelar no paga nada.
    await fila.getByTestId(`pagar-comision-${r.id}`).click()
    await page.getByRole('button', { name: /cancelar/i }).click()
    expect(await prisma.pagoComisionRepartidor.count({ where: { trabajadorId: r.id } })).toBe(0)

    // Confirmar paga lo pendiente (el monto lo pone el servidor).
    await fila.getByTestId(`pagar-comision-${r.id}`).click()
    await page.getByRole('button', { name: 'Sí, ya le pagué' }).click()
    await expect(fila.getByTestId('comision-pagado')).toContainText('800', { timeout: 20000 })
    await expect(fila.getByTestId('comision-pendiente')).toHaveCount(0)
    await expect(fila.getByTestId(`pagar-comision-${r.id}`)).toHaveCount(0)

    const pagos = await prisma.pagoComisionRepartidor.findMany({ where: { trabajadorId: r.id } })
    expect(pagos).toHaveLength(1)
    expect(Number(pagos[0].monto)).toBe(2 * TARIFA)

    // La caja del cierre resta lo pagado, sin que nadie teclee nada.
    await expect(page.getByTestId('cierre-comisiones-auto')).toContainText('800')
    await page.reload()
    await expect(page.getByTestId(`comision-${r.id}`).getByTestId('comision-pagado')).toContainText('800', { timeout: 30000 })
  })

  test('la ASISTENTE ve lo pendiente pero no puede pagarlo', async ({ browser }) => {
    const admin = await sharedLoginAs(browser, 'admin')
    const r = await repartidorConEntrega(admin, `Sin permiso E2E ${Date.now()}`, 1)

    const asistente = await sharedLoginAs(browser, 'asistente')
    await goto(asistente, '/cierre')
    const fila = asistente.getByTestId(`comision-${r.id}`)
    await expect(fila).toBeVisible({ timeout: 30000 })
    await expect(fila.getByTestId('comision-pendiente')).toContainText('400')
    await expect(fila.getByTestId(`pagar-comision-${r.id}`)).toHaveCount(0)
    await expect(asistente.getByTestId('comisiones-aviso-pendiente')).toContainText('Un administrador debe pagar')

    // Y la API se lo confirma: 403 y nada se registra.
    const res = await apiPost(asistente, '/api/nomina/dia/pagar', {
      trabajadorId: r.id, fecha: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }), offlineId: `a-${Date.now()}-xxxx`,
    })
    expect(res.status()).toBe(403)
    expect(await prisma.pagoComisionRepartidor.count({ where: { trabajadorId: r.id } })).toBe(0)
  })
})
