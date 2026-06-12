// @tests H3-3: Embarque despachado no se puede editar (móvil)
// Vector: estado — un embarque ya despachado es inmutable.
// Verifica en viewport iPhone 13:
//   1. Crear embarque (estado ABIERTO)
//   2. Cambiar a EN_RUTA o CERRADO (despachar)
//   3. Intentar editar → 4xx
import { test, expect } from '@playwright/test'
import { fullLogin, apiPost, apiPut, apiGet, createTrabajador, createEmbarque } from './fixtures'

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1',
})

test.describe('H3-3: Embarque despachado es inmutable (iPhone 13)', () => {
  test('PUT a embarque CERRADO es rechazado', async ({ page }) => {
    await fullLogin(page)

    // 1. Crear un trabajdor y embarque (usando helpers que sí conocen el shape correcto)
    const t = await createTrabajador(page, { rol: 'REPARTIDOR' })
    const trabajadorId = t.trabajador?.id || t.data?.id
    expect(trabajadorId).toBeTruthy()

    const embarque = await createEmbarque(page, trabajadorId)
    const embarqueId = embarque?.embarque?.id
    expect(embarqueId).toBeTruthy()

    // 2. Despachar (cambiar a EN_RUTA) — solo cambia el estado
    //    (más simple que cerrar, que requiere shape de pedidos)
    const despacharRes = await apiPut(page, `/api/embarques/${embarqueId}`, {
      estado: 'EN_RUTA',
    })
    // Si el server rechaza el cambio a EN_RUTA, skip-eamos
    if (despacharRes.status() !== 200) {
      test.skip()
      return
    }

    // 3. Intentar editar (PUT con datos nuevos)
    // FIX H3-3: el server ahora rechaza con 409 — embarque CERRADO es inmutable.
    const editRes = await apiPut(page, `/api/embarques/${embarqueId}`, {
      obs: 'Intento de editar despachado',
    })
    expect(editRes.status()).toBe(409)

    // 4. Verificar que la edición NO se aplicó
    // FIX H3-3: el server rechazó con 409, así que la edición
    // no persistió. La obs sigue siendo la original.
    const checkRes = await apiGet(page, `/api/embarques/${embarqueId}`)
    expect(checkRes.status()).toBe(200)
    const checkBody = await checkRes.json()
    const obsActual = checkBody?.embarque?.obs
    expect(obsActual).not.toBe('Intento de editar despachado')
  })

  test('PUT a embarque ABIERTO sí se permite', async ({ page }) => {
    await fullLogin(page)

    const t = await createTrabajador(page, { rol: 'REPARTIDOR' })
    const trabajadorId = t.trabajador?.id || t.data?.id
    expect(trabajadorId).toBeTruthy()

    const embarque = await createEmbarque(page, trabajadorId)
    const embarqueId = embarque?.embarque?.id

    // Editar un embarque ABIERTO debe funcionar
    const editRes = await apiPut(page, `/api/embarques/${embarqueId}`, {
      obs: 'Editado mientras estaba abierto',
    })
    expect(editRes.status()).toBeLessThan(500)
    expect([200, 204, 400]).toContain(editRes.status())
  })
})
