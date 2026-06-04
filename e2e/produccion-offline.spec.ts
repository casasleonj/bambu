// @tests api/produccion (dedup por offlineId) + offline-first behavior
// @requires Bloque 5: Produccion.offlineId + fetchResilient en wizard
import { test, expect, fullLogin, apiPost, apiGet, createSellador } from './fixtures'

test.describe('Produccion — offline-first (Bloque 5)', () => {
  test('POST con offlineId nuevo → 201 (crea Produccion)', async ({ page }) => {
    await fullLogin(page)
    const sellador = await createSellador(page)
    const selladorId = sellador?.trabajador?.id || sellador?.id
    if (!selladorId) test.skip(true, 'No se pudo crear sellador')

    const offlineId = `offline-new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const res = await apiPost(page, '/api/produccion', {
      turno: 'MANANA',
      trabajadorId: selladorId,
      obs: 'Test offlineId nuevo',
      offlineId,
      items: [
        { producto: 'PACA_AGUA', stockIni: 0, conteoA: 50, conteoB: 50, stockFinFisico: 50 },
        { producto: 'PACA_HIELO', stockIni: 0, conteoA: 25, conteoB: 25, stockFinFisico: 25 },
      ],
    })
    expect([200, 201]).toContain(res.status())
    const body = await res.json()
    expect(body.produccion).toBeDefined()
    expect(body.produccion.offlineId).toBe(offlineId)
    // Si vino 200 con deduped=true, falla; si vino 201 sin deduped, OK
    expect(body.deduped).toBeFalsy()
  })

  test('POST con mismo offlineId → 200 con deduped=true (no duplica)', async ({ page }) => {
    await fullLogin(page)
    const sellador = await createSellador(page)
    const selladorId = sellador?.trabajador?.id || sellador?.id
    if (!selladorId) test.skip(true, 'No se pudo crear sellador')

    const offlineId = `offline-dup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const payload = {
      turno: 'TARDE',
      trabajadorId: selladorId,
      obs: 'Test offlineId duplicado',
      offlineId,
      items: [
        { producto: 'PACA_AGUA', stockIni: 0, conteoA: 60, conteoB: 60, stockFinFisico: 60 },
        { producto: 'PACA_HIELO', stockIni: 0, conteoA: 30, conteoB: 30, stockFinFisico: 30 },
      ],
    }

    // Primera vez → 201
    const r1 = await apiPost(page, '/api/produccion', payload)
    expect([200, 201]).toContain(r1.status())
    const b1 = await r1.json()
    expect(b1.deduped).toBeFalsy()
    const produccionId = b1.produccion?.id
    expect(produccionId).toBeDefined()

    // Segunda vez con mismo offlineId → 200 deduped=true
    const r2 = await apiPost(page, '/api/produccion', payload)
    expect(r2.status()).toBe(200)
    const b2 = await r2.json()
    expect(b2.deduped).toBe(true)
    expect(b2.produccion.id).toBe(produccionId) // MISMO id
  })

  test('GET /api/produccion incluye offlineId en registros', async ({ page }) => {
    await fullLogin(page)
    const sellador = await createSellador(page)
    const selladorId = sellador?.trabajador?.id || sellador?.id
    if (!selladorId) test.skip(true, 'No se pudo crear sellador')

    const offlineId = `offline-get-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const postRes = await apiPost(page, '/api/produccion', {
      turno: 'NOCHE',
      trabajadorId: selladorId,
      obs: 'Test GET offlineId',
      offlineId,
      items: [
        { producto: 'PACA_AGUA', stockIni: 0, conteoA: 40, conteoB: 40, stockFinFisico: 40 },
        { producto: 'PACA_HIELO', stockIni: 0, conteoA: 20, conteoB: 20, stockFinFisico: 20 },
      ],
    })
    expect([200, 201]).toContain(postRes.status())

    // FIX TZ Bogotá: usar toLocaleDateString para evitar drift de UTC
    // (Bogotá es UTC-5; a las 19:00+ hora local, new Date().toISOString()
    // devuelve el día siguiente en UTC, no el día actual en Colombia).
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const getRes = await apiGet(page, `/api/produccion?fecha=${today}`)
    expect(getRes.status()).toBe(200)
    const body = await getRes.json()
    const found = (body.produccion || []).find((p: any) => p.offlineId === offlineId)
    expect(found).toBeDefined()
    expect(found.trabajadorId).toBe(selladorId)
  })

  test('POST sin offlineId → 201 normal (backward compat)', async ({ page }) => {
    await fullLogin(page)
    const sellador = await createSellador(page)
    const selladorId = sellador?.trabajador?.id || sellador?.id
    if (!selladorId) test.skip(true, 'No se pudo crear sellador')

    // Mismo shape que el wizard antes de Bloque 5 (sin offlineId)
    const res = await apiPost(page, '/api/produccion', {
      turno: 'MANANA',
      trabajadorId: selladorId,
      obs: 'Test sin offlineId (backward compat)',
      items: [
        { producto: 'PACA_AGUA', stockIni: 0, conteoA: 30, conteoB: 30, stockFinFisico: 30 },
        { producto: 'PACA_HIELO', stockIni: 0, conteoA: 15, conteoB: 15, stockFinFisico: 15 },
      ],
    })
    expect([200, 201]).toContain(res.status())
    const body = await res.json()
    expect(body.produccion).toBeDefined()
    // offlineId es null cuando no se envía
    expect(body.produccion.offlineId).toBeFalsy()
  })

  test('POST con offlineId vacío string → 400 (Zod strict)', async ({ page }) => {
    await fullLogin(page)
    const sellador = await createSellador(page)
    const selladorId = sellador?.trabajador?.id || sellador?.id
    if (!selladorId) test.skip(true, 'No se pudo crear sellador')

    const res = await apiPost(page, '/api/produccion', {
      turno: 'TARDE',
      trabajadorId: selladorId,
      offlineId: '', // min(1) → debe rechazar
      items: [
        { producto: 'PACA_AGUA', stockIni: 0, conteoA: 10, conteoB: 10, stockFinFisico: 10 },
        { producto: 'PACA_HIELO', stockIni: 0, conteoA: 5, conteoB: 5, stockFinFisico: 5 },
      ],
    })
    expect(res.status()).toBe(400)
  })
})
