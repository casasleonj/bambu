// @tests F2.2: Concurrent cierre de día — 2 admins intentan cerrar el mismo día
// Falla si no hay advisory lock, race en getNextNumero para factura, etc.
import { test, expect, fullLogin, apiPost, apiGet, resetTestDatabase } from '../fixtures'

test.describe('Race Condition: Cierre de Día Concurrente', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(() => {
    resetTestDatabase()
  })

  // ─── 1. Doble cierre del mismo día: 1 debe tener éxito, el otro debe fallar ──

  test('dos cierres concurrentes del mismo día: 1 OK, 1 conflict', async ({ browser }) => {
    test.setTimeout(120000)

    // Crea dos contextos (dos sesiones independientes de admin)
    const ctx1 = await browser.newContext()
    const ctx2 = await browser.newContext()
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    try {
      await fullLogin(page1)
      await fullLogin(page2)

      // Asegurar que no hay embarques abiertos del seed
      // (El seed test crea embarques que pueden impedir el cierre)
      const fecha = new Date().toISOString().split('T')[0]

      // Cerrar cualquier embarque abierto existente
      const embarquesRes = await apiGet(page1, '/api/embarques?estado=ABIERTO&all=true')
      const embarquesBody = await embarquesRes.json()
      const embarquesAbiertos = embarquesBody.embarques || []
      for (const emb of embarquesAbiertos) {
        await apiPost(page1, `/api/embarques/${emb.id}/cerrar`, {
          pedidos: [],
          ventasLibres: [],
          productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
          gastos: [],
          dineroEntregado: 0,
        }).catch(() => null) // best-effort
      }

      // Esperar a que los efectos se propaguen
      await page1.waitForTimeout(1000)

      // Payload mínimo válido para cierre
      const cierrePayload = {
        fecha,
        baseDia: 100000,
        stockIniAgua: 100,
        prodAgua: 50,
        stockFinAgua: 80,
        stockIniHielo: 50,
        prodHielo: 30,
        stockFinHielo: 40,
        comisiones: 0,
        salarios: 0,
        reporte: '{}',
      }

      // Lanzar dos cierres en paralelo
      const [res1, res2] = await Promise.all([
        apiPost(page1, '/api/cierre', cierrePayload),
        apiPost(page2, '/api/cierre', cierrePayload),
      ])

      // Uno debe ser 201, el otro 400 o 409
      const status1 = res1.status()
      const status2 = res2.status()

      console.log(`[race-cierre] res1=${status1}, res2=${status2}`)

      // Aceptar cualquier combinación de (201, 400|409)
      const oneSuccess = status1 === 201 || status2 === 201
      const oneRejected = status1 === 400 || status1 === 409 || status2 === 400 || status2 === 409

      expect(oneSuccess).toBe(true)
      expect(oneRejected).toBe(true)
      // Verificación explícita de los statuses (para debugging)
      console.log('[race-cierre]', { status1, status2 })
    } finally {
      await ctx1.close()
      await ctx2.close()
    }
  })
})
