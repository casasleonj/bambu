import { test, sharedLoginAs, resetTestDatabase } from './fixtures'
import { comprobarPrecioDecimal } from './precio-decimal-795.casos'

test.describe('#795 · precio decimal: formulario → DB → factura', () => {
  test.describe.configure({mode:'default'})
  test.beforeAll(() => resetTestDatabase())
  for (const flujo of ['pedido','rapida'] as const) {
    test(`${flujo}: 63 unidades por $138.000 exactos y precio conservado al reabrir`, async ({browser}) => {
      const page = await sharedLoginAs(browser,'admin')
      await comprobarPrecioDecimal(page,flujo)
    })
  }

  test('error de servidor conserva precio y cantidades; reintentar crea una sola operación', async ({browser}) => {
    const page = await sharedLoginAs(browser,'admin')
    await comprobarPrecioDecimal(page,'pedido',true)
  })
})
