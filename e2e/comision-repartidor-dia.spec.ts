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
  test.beforeAll(async () => {
    resetTestDatabase()
    // #688: el cierre solo lee la base de caja del día; la de hoy se registra como lo haría «Caja base».
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    await prisma.config.upsert({ where: { clave: `BASE_DIA_${hoy}` }, update: { valor: '100000' }, create: { clave: `BASE_DIA_${hoy}`, valor: '100000' } })
  })
  test.afterAll(async () => { await prisma.$disconnect() })

  test('el ADMIN ve la comisión del día, la paga con un toque confirmado y la base lo registra', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const r = await repartidorConEntrega(page, `Pago E2E ${Date.now()}`, 2)

    await goto(page, '/cierre')
    const fila = page.getByTestId(`comision-${r.id}`)
    await expect(fila).toBeVisible({ timeout: 30000 })
    await expect(fila.getByTestId('comision-pendiente')).toContainText('800')
    await fila.getByText('Ver entregas y cálculo').click()
    await expect(fila).toContainText('2 unidades ×')
    const fuente = fila.getByRole('link', { name: /Pedido sin embarque/ }) // #622: el encabezado de la fuente
    await expect(fuente).toHaveAttribute('href', /\/pedidos\/[^/]+$/)
    const enlace = await fuente.getAttribute('href')
    const detalle = await page.request.get(enlace!)
    expect(detalle.status()).toBe(200)
    const ancho = await page.evaluate(() => ({ ventana: innerWidth, contenido: document.documentElement.scrollWidth }))
    expect(ancho.contenido).toBeLessThanOrEqual(ancho.ventana + 1)
    await fila.screenshot({ path: test.info().outputPath('comision-detalle.png') })

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
    await expect(page.getByTestId('cierre-efectivo-esperado')).toContainText('800')
    await page.reload()
    await expect(page.getByTestId(`comision-${r.id}`).getByTestId('comision-pagado')).toContainText('800', { timeout: 30000 })
  })

  test('el CONTADOR también ve y puede pagar; la ASISTENTE recibe 403 por la API y no se registra nada', async ({ browser }) => {
    const admin = await sharedLoginAs(browser, 'admin')
    const r = await repartidorConEntrega(admin, `Roles E2E ${Date.now()}`, 1)

    const contador = await sharedLoginAs(browser, 'contador')
    await goto(contador, '/cierre')
    const fila = contador.getByTestId(`comision-${r.id}`)
    await expect(fila).toBeVisible({ timeout: 30000 })
    await expect(fila.getByTestId('comision-pendiente')).toContainText('400')
    await expect(fila.getByTestId(`pagar-comision-${r.id}`)).toBeVisible()

    // La ASISTENTE no paga comisiones: la API lo rechaza (el servidor decide, no la pantalla).
    const asistente = await sharedLoginAs(browser, 'asistente')
    const res = await apiPost(asistente, '/api/nomina/dia/pagar', {
      trabajadorId: r.id, fecha: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }), offlineId: `a-${Date.now()}-xxxx`,
    })
    expect(res.status()).toBe(403)
    expect(await prisma.pagoComisionRepartidor.count({ where: { trabajadorId: r.id } })).toBe(0)
  })

  test('#669: muestra 206 con una entrega parcial, abre el pedido y paga solo las 3 unidades nuevas', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await prisma.config.upsert({ where: { clave: 'GESTION_ADMIN_SIN_EMBARQUE' },
      create: { clave: 'GESTION_ADMIN_SIN_EMBARQUE', valor: 'true' }, update: { valor: 'true' } })
    const r = await repartidorConEntrega(page, `Parciales E2E ${Date.now()}`, 203)
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const previo = await apiPost(page, '/api/nomina/dia/pagar', { trabajadorId: r.id, fecha,
      offlineId: `cp669-previo-${Date.now()}`, montoEsperado: 203 * TARIFA })
    expect(previo.status()).toBe(201)

    const { cliente } = await createCliente(page, { nombre: 'Cliente parcial sintético', telefono: `3${String(Date.now()).slice(-9)}` })
    const creado = await apiPost(page, '/api/pedidos', { clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }], offlineId: `cp669-pedido-${Date.now()}` })
    expect(creado.ok()).toBe(true)
    const cuerpo = await creado.json()
    const p = cuerpo.data?.pedido ?? cuerpo.pedido
    const entregado = await apiPost(page, `/api/pedidos/${p.id}/gestion-admin/entrega`, {
      repartidorId: r.id, itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 3 }],
      promesaPagoFecha: new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
      offlineId: `cp669-entrega-${Date.now()}`,
    })
    expect(entregado.status()).toBe(200)
    expect((await prisma.pedido.findUniqueOrThrow({ where: { id: p.id } })).estadoEntrega).toBe('PENDIENTE')

    await goto(page, '/cierre')
    const fila = page.getByTestId(`comision-${r.id}`)
    await expect(fila.getByTestId('comision-pagado')).toContainText('81.200')
    await expect(fila.getByTestId('comision-pendiente')).toContainText('1.200')
    await fila.getByText('Ver entregas y cálculo').click()
    await expect(fila).toContainText('206 unidades ×')
    // #622: el pedido aparece con su cliente, lo entregado en esta comisión (3, no los 5 pedidos) y lo pendiente
    const filaPedido = fila.getByTestId(`comision-pedido-${p.id}`)
    await expect(filaPedido).toContainText('Cliente parcial sintético')
    await expect(filaPedido).toContainText('Parcial')
    await expect(filaPedido).toContainText('En esta comisión: agua 3')
    await expect(filaPedido).toContainText('Lleva agua 3 de 5')
    await expect(filaPedido).toContainText('Pendiente de entregar: agua 2')
    const enlace = filaPedido.getByRole('link', { name: `#${p.numero}`, exact: true })
    await expect(enlace).toHaveAttribute('href', `/pedidos/${p.id}`)
    await enlace.click()
    // La ruta canónica redirige al detalle sobre la lista (#377). Comprobar
    // el pedido abierto, no aceptar como éxito su URL transitoria de redirección.
    await expect(page.getByRole('dialog', { name: `Pedido #${p.numero}`, exact: true })).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveURL(url => url.pathname === '/pedidos')
    await page.goBack()
    await expect(fila.getByTestId('comision-pendiente')).toContainText('1.200')

    await fila.getByTestId(`pagar-comision-${r.id}`).click()
    await page.getByRole('button', { name: 'Sí, ya le pagué' }).click()
    await expect(fila.getByTestId('comision-pagado')).toContainText('82.400')
    await expect(fila.getByTestId('comision-pendiente')).toHaveCount(0)
    const pagos = await prisma.pagoComisionRepartidor.findMany({ where: { trabajadorId: r.id } })
    expect(pagos).toHaveLength(2)
    expect(pagos.reduce((s, p) => s + Number(p.monto), 0)).toBe(206 * TARIFA)
  })
  test('#622: un pedido que se completa al día siguiente muestra lo de cada día y no se vuelve completo el día anterior', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    await prisma.config.upsert({ where: { clave: 'GESTION_ADMIN_SIN_EMBARQUE' },
      create: { clave: 'GESTION_ADMIN_SIN_EMBARQUE', valor: 'true' }, update: { valor: 'true' } })
    const repartidor = await prisma.trabajador.create({
      data: { nombre: `Dos días E2E ${Date.now()}`, rol: 'REPARTIDOR', usaMoto: true, tipoPago: 'COMISION', comRepartAgua: TARIFA },
    })
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const ayer = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const { cliente } = await createCliente(page, { nombre: 'Hotel Sol sintético', telefono: `3${String(Date.now()).slice(-9)}` })
    const creado = await apiPost(page, '/api/pedidos', { clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }], offlineId: `c622-pedido-${Date.now()}` })
    expect(creado.ok()).toBe(true)
    const cuerpo = await creado.json()
    const p = cuerpo.data?.pedido ?? cuerpo.pedido
    const entrega = async (dia: string, cantidad: number) => {
      const r = await apiPost(page, `/api/pedidos/${p.id}/gestion-admin/entrega`, {
        repartidorId: repartidor.id, itemsEntregados: [{ producto: 'PACA_AGUA', cantidad }],
        // Hoy no puede ser futura: antes del mediodía de Bogotá «hoy 12:00» aún no ocurrió, así que se usa el instante actual.
        fechaEntrega: (dia === hoy ? new Date(Date.now() - 60_000) : new Date(`${dia}T12:00:00-05:00`)).toISOString(), precisionFecha: 'DIA',
        promesaPagoFecha: new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
        offlineId: `c622-entrega-${dia}-${Date.now()}`,
      })
      expect(r.status(), await r.text()).toBe(200)
    }
    await entrega(ayer, 5)
    await entrega(hoy, 5)

    // Hoy: solo lo de hoy cuenta (5 × 400), el pedido queda 10 de 10 y se dice que se completó aquí.
    await goto(page, '/cierre')
    const fila = page.getByTestId(`comision-${repartidor.id}`)
    await expect(fila).toBeVisible({ timeout: 30000 })
    await expect(fila.getByTestId('comision-pendiente')).toContainText('2.000')
    await fila.getByText('Ver entregas y cálculo').click()
    const filaPedido = fila.getByTestId(`comision-pedido-${p.id}`)
    await expect(filaPedido).toContainText('Hotel Sol sintético')
    await expect(filaPedido).toContainText('Completó hoy')
    await expect(filaPedido).toContainText('En esta comisión: agua 5')
    await expect(fila.getByTestId(`comision-dias-${p.id}`)).toContainText('· 5 ← esta comisión')
    await expect(fila.getByTestId(`comision-dias-${p.id}`)).toContainText('Total agua 10 de 10')
    await expect(filaPedido).toContainText('Con esta entrega se completó el pedido')
    await expect(filaPedido).not.toContainText('Pendiente de entregar')

    // En móvil no hay solapamientos ni scroll horizontal.
    await page.setViewportSize({ width: 360, height: 800 })
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 6).map(e => `${e.tagName}.${(e.className || '').toString().slice(0, 60)}`))).toEqual([])
    if (process.env.SHOT_DIR) { await fila.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT_DIR}/comision-movil.png` }) }
    await page.setViewportSize({ width: 1280, height: 900 })
    if (process.env.SHOT_DIR) await fila.screenshot({ path: `${process.env.SHOT_DIR}/comision-escritorio.png` })

    // Ayer: lo mismo en la base y en la API — 5 de 10 a ese día, NO completo, y avisa que se completó después.
    const resp = await page.request.get(`/api/nomina/dia?fecha=${ayer}`)
    expect(resp.status()).toBe(200)
    const dataAyer = await resp.json()
    const filas = (dataAyer.data?.repartidores ?? dataAyer.repartidores ?? dataAyer.data ?? []) as Array<{ trabajadorId: string; fuentes: Array<{ pedidos?: Array<{ id: string; unidades: { agua: number }; alDia?: { agua: number }; pendiente?: { agua: number }; completoAqui: boolean; completadoDespues?: string }> }> }>
    const deAyer = filas.find(f => f.trabajadorId === repartidor.id)?.fuentes.flatMap(f => f.pedidos ?? []).find(x => x.id === p.id)
    expect(deAyer, JSON.stringify(dataAyer).slice(0, 400)).toBeTruthy()
    expect(deAyer!.unidades.agua).toBe(5)
    expect(deAyer!.alDia?.agua).toBe(5)
    expect(deAyer!.pendiente?.agua).toBe(5)
    expect(deAyer!.completoAqui).toBe(false)
    expect(deAyer!.completadoDespues).toBe(hoy)
  })

  test('las entregas por conciliar se explican, enlazan al embarque y no permiten pagar', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const r = await repartidorConEntrega(page, `Conciliación E2E ${Date.now()}`, 1)
    const e = await prisma.embarque.create({ data: { trabajadorId: r.id, fecha: new Date(), estado: 'CERRADO' } })
    await prisma.embarqueMovimiento.createMany({ data: [
      { embarqueId: e.id, tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 1, metadata: { captura: 'CIERRE' } },
      { embarqueId: e.id, tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 1 },
    ] })
    await goto(page, '/cierre')
    const fila = page.getByTestId(`comision-${r.id}`)
    await expect(fila).toContainText('Por conciliar')
    await expect(fila.getByTestId(`pagar-comision-${r.id}`)).toHaveCount(0)
    await fila.getByText('Ver entregas y cálculo').click()
    await expect(fila).toContainText('sin identidad verificable')
    await expect(fila.getByRole('link', { name: 'Revisar embarque' })).toHaveAttribute('href', `/embarques/${e.id}`)
    const res = await apiPost(page, '/api/nomina/dia/pagar', { trabajadorId: r.id, fecha: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }), offlineId: `no-pagar-${Date.now()}` })
    expect(res.status()).toBe(409)
    expect(await prisma.pagoComisionRepartidor.count({ where: { trabajadorId: r.id } })).toBe(0)
    await fila.screenshot({ path: test.info().outputPath('comision-conciliacion.png') })
  })

})

test.describe('Medio de pago de la comisión (#305)', () => {
  test.beforeAll(async () => {
    resetTestDatabase()
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    await prisma.config.upsert({ where: { clave: `BASE_DIA_${hoy}` }, update: { valor: '100000' }, create: { clave: `BASE_DIA_${hoy}`, valor: '100000' } })
  })

  test('pagar por Nequi queda guardado con ese medio y no baja el efectivo que debe haber; en efectivo sí', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const nequi = await repartidorConEntrega(page, `Nequi E2E ${Date.now()}`, 2)
    const efectivo = await repartidorConEntrega(page, `Efectivo E2E ${Date.now()}`, 3)

    await goto(page, '/cierre')
    const debeHaber = page.getByTestId('efectivo-debe-haber')
    await expect(debeHaber).toBeVisible({ timeout: 30000 })
    const antes = (await debeHaber.textContent())?.replace(/\D/g, '')

    // Elegir el medio: opciones a la vista en móvil, lista desplegable en escritorio.
    const elegir = async (id: string, valor: 'NEQUI' | 'EFECTIVO') => {
      const opcion = page.getByTestId(`comision-medio-${id}-${valor}`)
      if (await opcion.isVisible()) await opcion.click()
      else await page.getByTestId(`comision-medio-select-${id}`).selectOption(valor)
    }

    const filaNequi = page.getByTestId(`comision-${nequi.id}`)
    await expect(filaNequi).toBeVisible({ timeout: 30000 })
    await elegir(nequi.id, 'NEQUI')
    await expect(filaNequi.getByTestId(`pagar-comision-${nequi.id}`)).toContainText('por Nequi')
    await filaNequi.getByTestId(`pagar-comision-${nequi.id}`).click()
    await expect(page.getByText(/no se resta de la caja del día/)).toBeVisible()
    await page.getByRole('button', { name: 'Sí, ya le pagué' }).click()
    await expect(filaNequi.getByTestId('comision-pagado')).toContainText('800', { timeout: 20000 })

    const pagoNequi = await prisma.pagoComisionRepartidor.findMany({ where: { trabajadorId: nequi.id } })
    expect(pagoNequi).toHaveLength(1)
    expect(pagoNequi[0].metodo).toBe('NEQUI')
    expect(Number(pagoNequi[0].monto)).toBe(2 * TARIFA)
    // El pago por Nequi no movió la caja física.
    expect((await debeHaber.textContent())?.replace(/\D/g, '')).toBe(antes)

    // En efectivo sí sale de la caja (3 × 400 = 1.200).
    const filaEfectivo = page.getByTestId(`comision-${efectivo.id}`)
    await elegir(efectivo.id, 'EFECTIVO')
    await filaEfectivo.getByTestId(`pagar-comision-${efectivo.id}`).click()
    await page.getByRole('button', { name: 'Sí, ya le pagué' }).click()
    await expect(filaEfectivo.getByTestId('comision-pagado')).toContainText('1.200', { timeout: 20000 })
    const pagoEfectivo = await prisma.pagoComisionRepartidor.findMany({ where: { trabajadorId: efectivo.id } })
    expect(pagoEfectivo[0].metodo).toBe('EFECTIVO')
    await expect.poll(async () => Number((await debeHaber.textContent())?.replace(/\D/g, '')), { timeout: 20000 }).toBe(Number(antes) - 3 * TARIFA)
  })
})
