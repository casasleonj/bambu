// @tests #535 — «Venta en ruta» desde Pedidos (TEMPORAL-SIN-EMBARQUE): el ADMIN registra la venta que
// un repartidor hizo en la calle, sin embarque. Con un navegador real y mirando la BASE DE DATOS
// (la lección del incidente P0 de ventas anónimas: una prueba de venta que no mira la base pasa con el bug).
//
// Va detrás del Hub (NEXT_PUBLIC_PEDIDOS_V2=true), igual que `pedidos-hub.spec.ts`:
//   NEXT_PUBLIC_PEDIDOS_V2=true PW_WORKERS=1 npx playwright test e2e/venta-en-ruta.spec.ts
import { test, expect, apiPost, createCliente, BASE, sharedLoginAs, appMain, resetTestDatabase } from './fixtures'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const CLAVE = 'GESTION_ADMIN_SIN_EMBARQUE'
const HUB_ON = process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true'

type PaginaAdmin = Parameters<typeof createCliente>[0]

// El interruptor es global (Config): las pruebas de este archivo van en serie.
test.describe.configure({ mode: 'serial' })

async function interruptor(page: PaginaAdmin, valor: 'true' | 'false') {
  const res = await apiPost(page, '/api/config', { clave: CLAVE, valor })
  expect(res.ok()).toBeTruthy()
}

test.describe('Venta en ruta (#535)', () => {
  test.skip(!HUB_ON, 'requiere NEXT_PUBLIC_PEDIDOS_V2=true + webServer fresco')
  test.beforeAll(() => { resetTestDatabase() })
  test.afterAll(async () => { await prisma.$disconnect() })

  test('con el interruptor APAGADO no existe la opción «Venta en ruta»', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await interruptor(page, 'false')
    await page.goto(`${BASE}/pedidos`)
    await appMain(page).getByTestId('fab-main').click()
    await expect(page.getByTestId('fab-venta-rapida')).toBeVisible()
    await expect(page.getByTestId('fab-venta-en-ruta')).toHaveCount(0)
  })

  test('ENCENDIDO: sin repartidor no se registra; con repartidor queda entregada, cobrada y con su comisión', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await interruptor(page, 'true')
    const nombreRep = `Germain E2E ${Date.now()}`
    const repartidor = await prisma.trabajador.create({ data: { nombre: nombreRep, rol: 'REPARTIDOR', usaMoto: true } })
    const antes = await prisma.pedido.count()

    await page.goto(`${BASE}/pedidos`)
    await appMain(page).getByTestId('fab-main').click()
    await page.getByTestId('fab-venta-en-ruta').click()
    await expect(page.getByTestId('pedidos-workspace')).toBeVisible()
    await expect(page.getByTestId('workspace-venta-en-ruta')).toBeVisible()
    // nace a domicilio: ni «Punto» ni la elección de canal
    await expect(page.getByTestId('workspace-canal-PUNTO')).toHaveCount(0)
    await expect(page.getByTestId('workspace-entrega')).toBeVisible()

    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await page.getByTestId('workspace-entrega-direccion').fill(`Calle ${Date.now() % 100} # 3-2`)
    await page.getByTestId('workspace-entrega-barrio').fill('Centro')
    await page.getByTestId('dinero-pagar-completo-EFECTIVO').click()
    await expect(page.getByTestId('dinero-saldo')).toHaveText('Pagado', { timeout: 10000 })
    await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })

    // sin elegir quién la vendió: no se envía nada y se marca el campo
    await page.getByTestId('workspace-commit').click()
    await expect(page.getByText('Elige quién la vendió.')).toBeVisible()
    expect(await prisma.pedido.count()).toBe(antes)

    await page.getByTestId('venta-ruta-repartidor').selectOption(repartidor.id)
    const creado = page.waitForResponse((r) => r.url().endsWith('/api/pedidos') && r.request().method() === 'POST')
    await page.getByTestId('workspace-commit').click()
    const res = await creado
    expect(res.status()).toBeLessThan(300)
    const body = await res.json()
    const id = (body.data?.pedido ?? body.pedido).id as string
    await expect(page.getByTestId('pedidos-workspace')).toHaveCount(0)

    const f = await prisma.pedido.findUniqueOrThrow({ where: { id }, include: { pagos: true } })
    expect(f.origen).toBe('VENTA_RAPIDA')
    expect(f.canal).toBe('DOMICILIO')
    expect(f.estadoEntrega).toBe('ENTREGADO')
    expect(f.entregadoPorId).toBe(repartidor.id)
    expect(f.entregadoAt).not.toBeNull()
    expect(f.embarqueId).toBeNull()
    expect(Number(f.saldo)).toBe(0)
    expect(f.pagos).toHaveLength(1)
    expect(Number(f.pagos[0].monto)).toBe(Number(f.total))
  })

  test('un cliente real que queda debiendo necesita la fecha de la promesa de pago', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await interruptor(page, 'true')
    const repartidor = await prisma.trabajador.create({ data: { nombre: `Rep Fiado ${Date.now()}`, rol: 'REPARTIDOR', usaMoto: true } })
    const nombre = `Don Pedro ${Date.now()}`
    const telefono = `3${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`
    const { cliente } = await createCliente(page, { nombre, telefono })

    await page.goto(`${BASE}/pedidos`)
    await appMain(page).getByTestId('fab-main').click()
    await page.getByTestId('fab-venta-en-ruta').click()
    await expect(page.getByTestId('workspace-venta-en-ruta')).toBeVisible()
    await page.getByTestId('workspace-identificar').click()
    await page.getByTestId('cliente-search-input').fill(nombre)
    await page.getByTestId('cliente-search-result').first().click()
    await expect(page.getByTestId('comprador-nombre')).toContainText(nombre)

    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await page.getByTestId('workspace-inc-PACA_AGUA').click()
    await page.getByTestId('workspace-entrega-direccion').fill(`Calle ${Date.now() % 100} # 4-1`)
    await page.getByTestId('workspace-entrega-barrio').fill('Centro')
    // queda debiendo todo: aparece la pregunta de la promesa
    await expect(page.getByTestId('venta-ruta-promesa')).toBeVisible({ timeout: 10000 })
    await page.getByTestId('venta-ruta-repartidor').selectOption(repartidor.id)
    await expect(page.getByTestId('workspace-commit')).toBeEnabled({ timeout: 10000 })

    const antes = await prisma.pedido.count()
    await page.getByTestId('workspace-commit').click()
    await expect(page.getByText('Falta la fecha de la promesa de pago.')).toBeVisible()
    expect(await prisma.pedido.count()).toBe(antes)

    const manana = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    await page.getByTestId('venta-ruta-promesa').fill(manana)
    const creado = page.waitForResponse((r) => r.url().endsWith('/api/pedidos') && r.request().method() === 'POST')
    await page.getByTestId('workspace-commit').click()
    const res = await creado
    expect(res.status()).toBeLessThan(300)
    const body = await res.json()
    const id = (body.data?.pedido ?? body.pedido).id as string

    const f = await prisma.pedido.findUniqueOrThrow({ where: { id } })
    expect(f.clienteId).toBe(cliente.id)
    expect(f.origen).toBe('VENTA_RAPIDA')
    expect(f.estadoEntrega).toBe('ENTREGADO')
    expect(f.entregadoPorId).toBe(repartidor.id)
    expect(Number(f.saldo)).toBeGreaterThan(0)
    expect(f.promesaPagoFecha).not.toBeNull()
  })
})
