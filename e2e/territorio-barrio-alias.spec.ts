// @tests F4 — Barrio: nombres alternativos y referencias territoriales.
// Caso de aceptación acordado con el equipo: "La Antillana" (canónico),
// alias "Antillana", referencias "Antillana 1" / "Antillana 2". Cubre el
// gate final del PR: resolución exacta/parcial consolidada, el chip
// inserta en Dirección solo por acción explícita (nunca automático, nunca
// duplica, nunca sobrescribe), Zona persiste solo barrioId, y el bloqueo
// duro de Alias contra otro Barrio.
import { test, expect, apiPost, apiGet, goto, sharedPageLogin, resetDatabase, createCliente } from './fixtures'
import type { Page } from '@playwright/test'

test.describe('F4 — Barrio: alias y referencias territoriales', () => {
  test.describe.configure({ mode: 'serial' })

  let p: Page
  let barrioAntillanaId: string
  let nombreZonaUno: string

  test.beforeAll(async ({ browser }) => {
    resetDatabase()
    p = await sharedPageLogin(browser)

    // Seed vía API (mismo usuario ADMIN ya logueado) — más rápido/estable
    // que recrear el catálogo a través de la UI de administración, que ya
    // se prueba por separado más abajo.
    const barrioRes = await apiPost(p, '/api/barrios', { nombre: 'La Antillana' })
    const barrioBody = await barrioRes.json()
    barrioAntillanaId = barrioBody.barrio.id

    await apiPost(p, `/api/barrios/${barrioAntillanaId}/alias`, { texto: 'Antillana' })
    await apiPost(p, `/api/barrios/${barrioAntillanaId}/referencias`, { texto: 'Antillana 1' })
    await apiPost(p, `/api/barrios/${barrioAntillanaId}/referencias`, { texto: 'Antillana 2' })

    await apiPost(p, '/api/barrios', { nombre: 'El Cafetal' })
  })

  test.afterAll(async () => {
    await p?.close()
  })

  test('Administración: el catálogo distingue "También se conoce como" de "Referencias comunes"', async () => {
    await goto(p, '/configuracion/barrios')

    // "Antillana 1"/"Antillana 2" son substrings inequívocos (no aparecen
    // en ningún otro texto de la página) — no hace falta exact:true, que
    // además fallaría igual: el chip real es <span>texto<button>×</button>
    // </span>, cuyo texto concatenado nunca es exactamente "texto" solo.
    await expect(p.getByText('También se conoce como')).toBeVisible()
    await expect(p.getByText('Referencias comunes').first()).toBeVisible()
    await expect(p.getByText('Antillana 1')).toBeVisible()
    await expect(p.getByText('Antillana 2')).toBeVisible()
  })

  test('Administración: bloqueo duro — un Alias que colisiona con otro Barrio no se crea', async () => {
    await goto(p, '/configuracion/barrios')

    const filaCafetal = p.locator('.divide-y > div').filter({ hasText: 'El Cafetal' })
    await filaCafetal.getByText('+ Agregar').click()
    // "Otro nombre para este barrio" ya es la opción por defecto.
    await p.getByPlaceholder('Texto').fill('Antillana')
    await p.getByRole('button', { name: 'Guardar' }).click()

    // "Antillana" ya es alias de La Antillana — la colisión alias-vs-alias
    // de OTRO barrio la garantiza la unique constraint de DB (P2002), no un
    // chequeo de servicio (ese caso cubre canónico/referencia de otro
    // barrio). Rechazado de cualquier forma — nunca confirmable, a
    // diferencia del solapamiento de Zona.
    await expect(p.getByText('Ese alias ya está en uso')).toBeVisible({ timeout: 5000 })
    await expect(p.getByPlaceholder('Texto')).toBeVisible() // el form sigue abierto, no se cerró como si hubiera guardado
  })

  test('Cliente: buscar "Antillana 2" encuentra La Antillana ("Coincide con") y muestra las referencias', async () => {
    await goto(p, '/clientes')
    await p.getByRole('button', { name: /Nuevo Cliente/ }).click()

    const nombre = `F4 Test ${Date.now() % 100000}`
    await p.getByRole('textbox', { name: /Ej: Juan/ }).or(p.locator('input[placeholder*="Ej: Juan"]')).fill(nombre)
    await p.locator('input[type="tel"]').first().or(p.locator('input[placeholder*="3111234567"]')).fill(`3${String(Date.now()).slice(-9)}`)

    await p.getByRole('tab', { name: 'Barrio y dirección' }).click()

    const barrioInput = p.getByPlaceholder('Ej: Centro, Las Flores')
    await barrioInput.fill('Antillana 2')

    // Sin exact:true: el botón del resultado concatena nombre + "Coincide
    // con: X" en el mismo elemento (misma razón que en el picker de Zona
    // más abajo) — substring es suficiente y robusto frente a eso. En este
    // punto es el único match posible en pantalla (dropdown recién abierto).
    const resultado = p.getByText('La Antillana')
    await expect(resultado).toBeVisible({ timeout: 5000 })
    await expect(p.getByText('Coincide con: Antillana 2')).toBeVisible()

    await resultado.click()

    // Tras seleccionar, aparecen las referencias del Barrio como chips.
    await expect(p.getByText('También se conoce como')).toBeVisible()
    await expect(p.getByText('Referencias comunes — toca una para agregarla a Dirección')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Antillana 1', exact: true })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Antillana 2', exact: true })).toBeVisible()
  })

  test('Cliente: el chip llena Dirección vacía, antepone sobre contenido existente, y nunca duplica', async () => {
    const direccion = p.getByPlaceholder('Calle, número, apartamento, referencias...')
    await expect(direccion).toHaveValue('')

    // 1) Dirección vacía → se llena con el texto exacto del chip.
    await p.getByRole('button', { name: 'Antillana 2', exact: true }).click()
    await expect(direccion).toHaveValue('Antillana 2')

    // 2) Ya hay contenido → el próximo chip antepone, preserva lo existente.
    await direccion.fill('Antillana 2, Cra 15 # 8-20')
    await p.getByRole('button', { name: 'Antillana 1', exact: true }).click()
    await expect(direccion).toHaveValue('Antillana 1, Antillana 2, Cra 15 # 8-20')

    // 3) Pulsar de nuevo una referencia ya presente no duplica — el chip
    //    queda deshabilitado (protección anti-duplicado normalizada).
    await expect(p.getByRole('button', { name: 'Antillana 1', exact: true })).toBeDisabled()
    await expect(direccion).toHaveValue('Antillana 1, Antillana 2, Cra 15 # 8-20')
  })

  test('Cliente: formulario válido sin elegir ninguna referencia (el chip es opcional)', async () => {
    const direccion = p.getByPlaceholder('Calle, número, apartamento, referencias...')
    await direccion.fill('Cra 20 # 5-10')

    const submitBtn = p.getByRole('button', { name: 'Crear cliente' })
    await submitBtn.click()
    await expect(submitBtn).toBeHidden({ timeout: 5000 })
  })

  test('Cliente: "antill" (parcial) consolida en un único resultado "La Antillana", no una fila por fuente', async () => {
    await goto(p, '/clientes')
    await p.getByRole('button', { name: /Nuevo Cliente/ }).click()
    await p.getByRole('tab', { name: 'Barrio y dirección' }).click()

    const barrioInput = p.getByPlaceholder('Ej: Centro, Las Flores')
    await barrioInput.fill('antill')

    // "antill" matchea nombre canónico + alias + ambas referencias a la
    // vez — el gate real es que consolida en UN SOLO resultado, no una
    // fila por fuente. Sin exact:true por la misma razón de concatenación.
    await expect(p.getByText('La Antillana')).toBeVisible({ timeout: 5000 })
    await expect(p.getByText('La Antillana')).toHaveCount(1)
  })

  test('Negocio: buscar "Antillana 2" encuentra La Antillana y muestra las referencias', async () => {
    const { cliente } = await createCliente(p, { nombre: `F4 Cliente Negocio ${Date.now() % 100000}` })
    await goto(p, `/clientes?openCliente=${cliente.id}`)
    await expect(p.getByRole('heading', { name: cliente.nombre })).toBeVisible()

    await p.getByRole('button', { name: 'Agregar' }).first().click()
    await p.locator('input[placeholder="Ej: Restaurante El Sabor"]').fill('Tienda F4 Test')

    const barrioInput = p.locator('input[placeholder="Ej: Centro"]')
    await barrioInput.fill('Antillana 2')

    // Mismo motivo que en Cliente/Zona: el botón del resultado concatena
    // nombre + "Coincide con: X" en el mismo elemento. Se acota al botón del
    // dropdown: la lista de clientes detrás del modal también muestra "La
    // Antillana" (cliente creado en tests previos) y getByText violaría strict mode.
    const resultado = p.getByRole('button', { name: /La Antillana.*Coincide con/ })
    await expect(resultado).toBeVisible({ timeout: 5000 })
    await expect(p.getByText('Coincide con: Antillana 2')).toBeVisible()
    await resultado.click()

    // Tras seleccionar, aparecen las referencias del Barrio como chips —
    // mismo componente compartido que en Cliente (BarrioReferenciasChips).
    await expect(p.getByText('También se conoce como')).toBeVisible()
    await expect(p.getByText('Referencias comunes — toca una para agregarla a Dirección')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Antillana 1', exact: true })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Antillana 2', exact: true })).toBeVisible()

    const direccion = p.locator('textarea[placeholder="Calle, número, referencias..."]')
    await expect(direccion).toHaveValue('')

    // El chip llena Dirección vacía (mismo contrato que en Cliente).
    await p.getByRole('button', { name: 'Antillana 2', exact: true }).click()
    await expect(direccion).toHaveValue('Antillana 2')

    // Ya hay contenido → el próximo chip antepone, preserva lo existente.
    await direccion.fill('Antillana 2, Local 3')
    await p.getByRole('button', { name: 'Antillana 1', exact: true }).click()
    await expect(direccion).toHaveValue('Antillana 1, Antillana 2, Local 3')

    // Pulsar de nuevo una referencia ya presente no duplica.
    await expect(p.getByRole('button', { name: 'Antillana 1', exact: true })).toBeDisabled()
    await expect(direccion).toHaveValue('Antillana 1, Antillana 2, Local 3')

    await p.getByRole('button', { name: /Crear negocio/ }).click()
    await expect(p.getByRole('button', { name: /Crear negocio/ })).toBeHidden({ timeout: 5000 })

    // Verificación de fondo: el Negocio quedó con barrioId del canónico (nunca
    // crea un Barrio nuevo a partir del texto buscado).
    const detalleRes = await apiGet(p, `/api/clientes/${cliente.id}`)
    const detalle = await detalleRes.json()
    const negocio = detalle.cliente.negocios[0]
    expect(negocio.barrioId).toBe(barrioAntillanaId)
    expect(negocio.direccion).toBe('Antillana 1, Antillana 2, Local 3')
  })

  test('Zona: el picker muestra "Coincide con" y persiste solo barrioId del canónico', async () => {
    await goto(p, '/configuracion/zonas')

    const nombreZona = `F4 Zona ${Date.now() % 100000}`
    nombreZonaUno = nombreZona
    await p.getByPlaceholder('Nombre de la nueva zona').fill(nombreZona)
    await p.getByRole('button', { name: '+ Nueva' }).click()

    // Crear la zona la selecciona automáticamente (setSelectedId en el
    // propio handler) — no hace falta un click adicional.
    await expect(p.getByText('Barrios de esta zona')).toBeVisible({ timeout: 5000 })
    const barrioInput = p.getByPlaceholder('Buscar o agregar barrio...')
    await barrioInput.fill('Antillana 2')

    // Sin exact:true — mismo motivo que en el picker de Cliente: el botón
    // del resultado concatena nombre + "Coincide con: X" en un solo nodo.
    const resultadoZona = p.getByText('La Antillana')
    await expect(resultadoZona).toBeVisible({ timeout: 5000 })
    await expect(p.getByText('Coincide con: Antillana 2')).toBeVisible()
    await resultadoZona.click()
    // Tras agregarlo, queda listado en "Barrios de esta zona" (sin "Coincide con", solo el nombre canónico).
    await expect(p.getByText('La Antillana', { exact: true })).toBeVisible({ timeout: 5000 })

    // Verificación de fondo: el vínculo persistido usa el barrioId real del
    // canónico, nunca el texto "Antillana 2" — nunca crea nada nuevo.
    const zonasRes = await apiGet(p, `/api/zonas?q=${encodeURIComponent(nombreZona)}`)
    const zonasBody = await zonasRes.json()
    const zonaId = zonasBody.data[0].id
    const detalleRes = await apiGet(p, `/api/zonas/${zonaId}`)
    const detalle = (await detalleRes.json()).zona
    expect(detalle.barrios).toHaveLength(1)
    expect(detalle.barrios[0].barrioId).toBe(barrioAntillanaId)
    expect(detalle.barrios[0].barrio.nombre).toBe('La Antillana')
  })

  test('Zona: agregar un Barrio resuelto por referencia a una SEGUNDA zona sigue exigiendo confirmación explícita de solapamiento', async () => {
    // Gate del equipo (punto 5): F4 (resolución por alias/referencia) no
    // debe debilitar el contrato de solapamiento de F3/#279 — el backend
    // SIEMPRE recalcula el solapamiento contra `barrioId`, sin importar si
    // la UI llegó a ese barrioId buscando por el nombre canónico o por una
    // referencia territorial.
    await goto(p, '/configuracion/zonas')

    const nombreZonaDos = `F4 Zona Dos ${Date.now() % 100000}`
    await p.getByPlaceholder('Nombre de la nueva zona').fill(nombreZonaDos)
    await p.getByRole('button', { name: '+ Nueva' }).click()
    await expect(p.getByText('Barrios de esta zona')).toBeVisible({ timeout: 5000 })

    const barrioInput = p.getByPlaceholder('Buscar o agregar barrio...')
    await barrioInput.fill('Antillana 1')
    const resultado = p.getByText('La Antillana')
    await expect(resultado).toBeVisible({ timeout: 5000 })
    await resultado.click()

    // Solapamiento detectado (La Antillana ya está en "F4 Zona ..."): el
    // modal de confirmación aparece, y el barrio NO queda agregado todavía.
    const modal = p.getByTestId('overlap-confirm-modal')
    await expect(modal).toBeVisible({ timeout: 5000 })
    await expect(modal.getByText('Barrio compartido')).toBeVisible()
    await expect(modal.getByText(`"La Antillana" ya pertenece a Zona ${nombreZonaUno}.`)).toBeVisible()

    await modal.getByRole('button', { name: `Agregar también a Zona ${nombreZonaDos}` }).click()
    await expect(modal).toBeHidden({ timeout: 5000 })
    await expect(p.getByText('La Antillana', { exact: true })).toBeVisible({ timeout: 5000 })

    // Verificación de fondo: ahora pertenece a AMBAS zonas (no se movió de la
    // primera, no se creó ni duplicó ningún Barrio) — compartido, no
    // reemplazado.
    const zonaDosRes = await apiGet(p, `/api/zonas?q=${encodeURIComponent(nombreZonaDos)}`)
    const zonaDosId = (await zonaDosRes.json()).data[0].id
    const detalleDosRes = await apiGet(p, `/api/zonas/${zonaDosId}`)
    const detalleDos = (await detalleDosRes.json()).zona
    expect(detalleDos.barrios).toHaveLength(1)
    expect(detalleDos.barrios[0].barrioId).toBe(barrioAntillanaId)

    const zonaUnoRes = await apiGet(p, `/api/zonas?q=${encodeURIComponent(nombreZonaUno)}`)
    const zonaUnoId = (await zonaUnoRes.json()).data[0].id
    const detalleUnoRes = await apiGet(p, `/api/zonas/${zonaUnoId}`)
    const detalleUno = (await detalleUnoRes.json()).zona
    expect(detalleUno.barrios).toHaveLength(1)
    expect(detalleUno.barrios[0].barrioId).toBe(barrioAntillanaId)
  })

  test('Verificación de fondo: el Cliente creado quedó con barrioId del canónico y Dirección correcta', async () => {
    const res = await apiGet(p, `/api/clientes?search=${encodeURIComponent('F4 Test')}`)
    const body = await res.json()
    const cliente = body.clientes[0]
    expect(cliente.barrioId).toBe(barrioAntillanaId)
    expect(cliente.direccion).toBe('Cra 20 # 5-10')
  })
})
