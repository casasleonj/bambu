// @tests #515 #407 — catálogo, editor canónico y generación manual real.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import {
  test,
  expect,
  appMain,
  BASE,
  applyCachedRoleAuth,
  skipBaseCaja,
  resetTestDatabase,
} from './fixtures'
import type { Page } from '@playwright/test'
const db = new PrismaClient()
async function preparar() {
  await db.plantillaRecurrente.updateMany({ data: { activo: false } })
  const owner = await db.cliente.create({
    data: {
      nombre: `Ana ${randomUUID().slice(0, 6)}`,
      telefono: randomUUID(),
      direccion: 'Casa propietaria',
      barrio: 'Norte',
      limitePedidosFiados: 999,
    },
  })
  const negocio = await db.negocio.create({
    data: {
      clienteId: owner.id,
      nombre: 'La Esquina 515',
      direccion: 'Calle del Negocio 12',
      barrio: 'Centro',
    },
  })
  const persona = await db.cliente.create({
    data: {
      nombre: 'Pedro Inactivo 515',
      telefono: randomUUID(),
      direccion: 'Calle 2',
    },
  })
  const futura = await db.cliente.create({
    data: {
      nombre: 'María Futura 515',
      telefono: randomUUID(),
      direccion: 'Calle 3',
    },
  })
  const hoy = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Bogota',
  })
  const prox = new Date(`${hoy}T00:00:00-05:00`)
  if (prox.getUTCDay() === 0) prox.setUTCDate(prox.getUTCDate() - 1)
  const admin = await db.user.findUniqueOrThrow({
    where: { username: 'admin' },
  })
  const pt = await db.plantillaRecurrente.create({
    data: {
      negocioId: negocio.id,
      activo: true,
      cadaNDias: 7,
      canal: 'DOMICILIO',
      tipo: 'ENVIO',
      proxGeneracion: prox,
      createdById: admin.id,
      productos: {
        create: [
          { producto: 'PACA_AGUA', cantidad: 3 },
          { producto: 'PACA_HIELO', cantidad: 2 },
        ],
      },
    },
  })
  const inactiva = await db.plantillaRecurrente.create({
    data: {
      clienteId: persona.id,
      activo: false,
      cadaNDias: 3,
      canal: 'PUNTO',
      proxGeneracion: prox,
      productos: { create: { producto: 'BOTELLON', cantidad: 3 } },
    },
  })
  const futuro = await db.plantillaRecurrente.create({
    data: {
      clienteId: futura.id,
      activo: true,
      cadaNDias: 7,
      canal: 'PUNTO',
      proxGeneracion: new Date(Date.now() + 10 * 86400000),
      productos: { create: { producto: 'BOLSA_HIELO', cantidad: 4 } },
    },
  })
  return { owner, negocio, pt, inactiva, futuro, admin }
}
async function abrir(
  page: Page,
  role: 'admin' | 'asistente' | 'repartidor' = 'admin',
  path = '/recurrentes',
) {
  await page.addInitScript(() =>
    localStorage.setItem('pwa-install-banner-dismissed', 'true'),
  )
  await skipBaseCaja(page)
  await applyCachedRoleAuth(page, role)
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
}
async function confirmar(page: Page, nombre = 'La Esquina 515') {
  await appMain(page)
    .getByRole('button', { name: 'Revisar antes de crear', exact: true })
    .click()
  const dialog = page.getByTestId('habituales-dialog')
  await expect(
    dialog.getByTestId(/^revision-habitual-/).filter({ hasText: nombre }),
  ).toBeVisible()
  await dialog
    .getByRole('button', { name: 'Revisar selección', exact: true })
    .click()
  await dialog
    .getByRole('button', { name: 'Confirmar selección', exact: true })
    .click()
  return dialog
}

export function definirCasosHabituales515() {
  test.describe('Habituales V6 (#515)', () => {
    test.skip(
      process.env.NEXT_PUBLIC_PEDIDOS_V2 !== 'true',
      'requiere el Hub activo en el build',
    )
    test.setTimeout(60000)
    test.beforeEach(() => resetTestDatabase())
    test.afterAll(async () => {
      await db.$disconnect()
    })
    test('catálogo completo con productos y cantidades; consulta no crea pedidos y cabe en escritorio y móvil', async ({
      page,
    }, info) => {
      const { pt, inactiva, futuro } = await preparar()
      let posts = 0
      page.on('request', (r) => {
        if (
          new URL(r.url()).pathname === '/api/pedidos/recurrentes' &&
          r.method() === 'POST'
        )
          posts++
      })
      await abrir(page)
      const catalogo = appMain(page).getByTestId('habituales-catalogo')
      await expect(catalogo.getByTestId(`habitual-${pt.id}`)).toContainText(
        '3 Paca de agua',
      )
      await expect(catalogo.getByTestId(`habitual-${pt.id}`)).toContainText(
        '2 Paca de hielo',
      )
      await expect(
        catalogo.getByTestId(`habitual-${inactiva.id}`),
      ).toContainText('Sin generación')
      await expect(catalogo.getByTestId(`habitual-${futuro.id}`)).toBeVisible()
      await expect(
        appMain(page).getByTestId('habituales-revision'),
      ).toContainText('1 para revisar')
      const widths = info.project.name.includes('mobile')
        ? [390, 320]
        : [1440, 1366]
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 })
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true)
        await page.screenshot({
          path: info.outputPath(`habituales-catalogo-${width}.png`),
          fullPage: true,
        })
      }
      expect(posts).toBe(0)
      expect(
        await db.pedido.count({
          where: { idOrigen: { in: [pt.id, inactiva.id, futuro.id] } },
        }),
      ).toBe(0)
    })
    test('el error de revisión no borra el catálogo ni muestra un falso cero', async ({
      page,
    }) => {
      const { pt } = await preparar()
      await page.route('**/api/pedidos/recurrentes', (r) =>
        r.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: { message: 'Consulta no disponible' },
          }),
        }),
      )
      await abrir(page)
      await expect(
        appMain(page).getByTestId('habituales-revision'),
      ).toContainText('Sin consulta vigente')
      await expect(appMain(page).getByTestId(`habitual-${pt.id}`)).toBeVisible()
      await expect(
        appMain(page).getByRole('button', {
          name: 'Revisar antes de crear',
          exact: true,
        }),
      ).toHaveCount(0)
      expect(await db.pedido.count({ where: { idOrigen: pt.id } })).toBe(0)
    })
    test('editar un negocio conserva productos, propietario y regreso a los filtros del catálogo', async ({
      page,
    }) => {
      const { owner, negocio, pt } = await preparar()
      await abrir(page)
      await appMain(page)
        .getByRole('searchbox', { name: 'Buscar cliente o negocio' })
        .fill(owner.nombre)
      await appMain(page)
        .getByRole('button', { name: 'Activos', exact: true })
        .click()
      await appMain(page)
        .getByTestId(`habitual-${pt.id}`)
        .getByRole('link', { name: 'Ver y ajustar →' })
        .click()
      await expect(appMain(page)).toContainText('Calle del Negocio 12')
      await expect(appMain(page)).not.toContainText('Casa propietaria')
      await appMain(page).getByRole('spinbutton').first().fill('9')
      await appMain(page)
        .getByRole('button', { name: 'Guardar cambios', exact: true })
        .click()
      await expect(page).toHaveURL(
        (u) =>
          u.pathname === '/recurrentes' &&
          u.searchParams.get('q') === owner.nombre &&
          u.searchParams.get('estado') === 'activos',
      )
      await expect(
        appMain(page).getByTestId(`habitual-${pt.id}`),
      ).toContainText('Cada 9 días')
      expect(
        await db.plantillaRecurrente.findUnique({ where: { id: pt.id } }),
      ).toMatchObject({ clienteId: null, negocioId: negocio.id, cadaNDias: 9 })
    })
    test('crear exige confirmación; genera solo el objetivo revisado, sin pago ficticio y con enlace al pedido exacto', async ({
      page,
    }) => {
      const { owner, negocio, pt, futuro } = await preparar()
      await abrir(page)
      await appMain(page)
        .getByRole('button', { name: 'Revisar antes de crear', exact: true })
        .click()
      const dialog = page.getByTestId('habituales-dialog')
      await expect(dialog).toContainText('3 Paca de agua')
      await expect(dialog).toContainText('2 Paca de hielo')
      expect(await db.pedido.count({ where: { idOrigen: pt.id } })).toBe(0)
      await dialog
        .getByRole('button', { name: 'Revisar selección', exact: true })
        .click()
      expect(await db.pedido.count({ where: { idOrigen: pt.id } })).toBe(0)
      await dialog
        .getByRole('button', { name: 'Confirmar selección', exact: true })
        .click()
      await expect(dialog).toContainText('Se comprobó el resultado', {
        timeout: 15000,
      })
      const pedidos = await db.pedido.findMany({
        where: { idOrigen: pt.id },
        include: { items: true, pagos: true },
      })
      expect(pedidos).toHaveLength(1)
      expect(pedidos[0]).toMatchObject({
        clienteId: owner.id,
        negocioId: negocio.id,
        estadoEntrega: 'PENDIENTE',
      })
      expect(Number(pedidos[0].totalPagado)).toBe(0)
      expect(pedidos[0].pagos).toHaveLength(0)
      expect(
        pedidos[0].items.map((i) => [i.producto, i.cantPedido]).sort(),
      ).toEqual([
        ['PACA_AGUA', 3],
        ['PACA_HIELO', 2],
      ])
      expect(await db.pedido.count({ where: { idOrigen: futuro.id } })).toBe(0)
      const link = dialog.getByRole('link', { name: 'Ver pedido →' })
      await expect(link).toHaveAttribute('href', `/pedidos/${pedidos[0].id}`)
      await link.click()
      await expect(appMain(page)).toContainText('La Esquina 515')
    })
    test('una respuesta perdida se consulta tras recargar y no vuelve a crear el pedido', async ({
      page,
    }) => {
      const { pt } = await preparar()
      let perdido = false
      let posts = 0
      await page.route('**/api/pedidos/recurrentes', async (route) => {
        if (route.request().method() === 'POST') {
          posts++
          if (!perdido) {
            const r = await route.fetch()
            expect(r.status()).toBe(201)
            perdido = true
            await route.abort('failed')
            return
          }
        }
        await route.continue()
      })
      await abrir(page)
      const dialog = await confirmar(page)
      await expect(
        dialog.getByRole('button', {
          name: 'Consultar resultado',
          exact: true,
        }),
      ).toBeEnabled()
      expect(await db.pedido.count({ where: { idOrigen: pt.id } })).toBe(1)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await appMain(page)
        .getByRole('button', { name: 'Comprobar envío anterior', exact: true })
        .click()
      await expect(page.getByTestId('habituales-dialog')).toContainText(
        'Se comprobó el resultado',
        { timeout: 15000 },
      )
      expect(posts).toBe(1)
      expect(await db.pedido.count({ where: { idOrigen: pt.id } })).toBe(1)
      await page
        .getByTestId('habituales-dialog')
        .getByRole('button', { name: 'Volver a habituales', exact: true })
        .click()
      await expect(page.getByTestId('habituales-dialog')).toHaveCount(0)
    })
    test('Saltar avanza una sola vez y el mismo lote se recupera sin crear pedidos', async ({
      page,
    }) => {
      const { pt } = await preparar()
      await abrir(page)
      await appMain(page)
        .getByRole('button', { name: 'Revisar antes de crear', exact: true })
        .click()
      const dialog = page.getByTestId('habituales-dialog')
      await dialog
        .getByRole('combobox', {
          name: 'Qué hacer con La Esquina 515',
          exact: true,
        })
        .selectOption('SALTAR')
      await dialog
        .getByRole('button', { name: 'Revisar selección', exact: true })
        .click()
      const request = page.waitForRequest(
        (r) =>
          new URL(r.url()).pathname === '/api/pedidos/recurrentes' &&
          r.method() === 'POST',
      )
      await dialog
        .getByRole('button', { name: 'Confirmar selección', exact: true })
        .click()
      const body = (await request).postDataJSON()
      await expect(dialog).toContainText('Saltado según tu selección')
      const primero = await db.plantillaRecurrente.findUniqueOrThrow({
        where: { id: pt.id },
      })
      const replay = await page.request.post('/api/pedidos/recurrentes', {
        data: body,
      })
      expect(replay.status()).toBe(200)
      expect(
        (
          await db.plantillaRecurrente.findUniqueOrThrow({
            where: { id: pt.id },
          })
        ).proxGeneracion,
      ).toEqual(primero.proxGeneracion)
      expect(await db.pedido.count({ where: { idOrigen: pt.id } })).toBe(0)
    })
    test('pausar y activar desde el editor conserva la misma recurrencia y no crea pedidos', async ({
      page,
    }) => {
      const { pt } = await preparar()
      await abrir(page, 'asistente')
      await appMain(page)
        .getByTestId(`habitual-${pt.id}`)
        .getByRole('link', { name: 'Ver y ajustar →' })
        .click()
      await appMain(page).getByText('Habitual activo', { exact: true }).click()
      await expect(
        appMain(page).getByRole('checkbox', {
          name: 'Habitual activo',
          exact: true,
        }),
      ).not.toBeChecked()
      await appMain(page)
        .getByRole('button', { name: 'Guardar cambios', exact: true })
        .click()
      await expect(
        appMain(page).getByTestId(`habitual-${pt.id}`),
      ).toContainText('Sin generación')
      expect(
        (
          await db.plantillaRecurrente.findUniqueOrThrow({
            where: { id: pt.id },
          })
        ).activo,
      ).toBe(false)
      await appMain(page)
        .getByRole('button', { name: 'Pausados / inactivos', exact: true })
        .click()
      await appMain(page)
        .getByTestId(`habitual-${pt.id}`)
        .getByRole('link', { name: 'Ver y ajustar →' })
        .click()
      await appMain(page).getByText('Habitual activo', { exact: true }).click()
      await expect(
        appMain(page).getByRole('checkbox', {
          name: 'Habitual activo',
          exact: true,
        }),
      ).toBeChecked()
      await appMain(page)
        .getByRole('button', { name: 'Guardar cambios', exact: true })
        .click()
      await expect(page).toHaveURL(
        (u) =>
          u.pathname === '/recurrentes' &&
          u.searchParams.get('estado') === 'inactivos',
      )
      await expect(appMain(page).getByTestId(`habitual-${pt.id}`)).toHaveCount(
        0,
      )
      await appMain(page)
        .getByRole('button', { name: 'Activos', exact: true })
        .click()
      await expect(
        appMain(page).getByTestId(`habitual-${pt.id}`),
      ).toContainText('Activo')
      expect(
        (
          await db.plantillaRecurrente.findUniqueOrThrow({
            where: { id: pt.id },
          })
        ).activo,
      ).toBe(true)
      expect(await db.pedido.count({ where: { idOrigen: pt.id } })).toBe(0)
    })
    test('ASISTENTE opera el flujo existente; REPARTIDOR no recibe catálogo, precios ni estado del envío', async ({
      page,
    }) => {
      const { pt } = await preparar()
      await abrir(page, 'asistente')
      const dialog = await confirmar(page)
      await expect(dialog).toContainText('Se comprobó el resultado', {
        timeout: 15000,
      })
      expect(await db.pedido.count({ where: { idOrigen: pt.id } })).toBe(1)
      const antes = await db.historial.findFirstOrThrow({
        where: { entidad: 'GeneracionRecurrentes' },
        orderBy: { fecha: 'desc' },
      })
      const batch = antes.registroId
      await page.context().clearCookies()
      await applyCachedRoleAuth(page, 'repartidor')
      for (const url of [
        '/api/recurrentes?incluirInactivos=true',
        '/api/pedidos/recurrentes',
        `/api/pedidos/recurrentes?offlineId=${batch}`,
      ]) {
        const response = await page.request.get(url)
        expect(response.status()).toBe(403)
        const data = await response.json()
        expect(data).not.toHaveProperty('preview')
        expect(data).not.toHaveProperty('recurrentes')
        expect(data).not.toHaveProperty('items')
      }
    })
  })
}
