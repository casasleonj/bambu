// QA real de #811 contra el ERP levantado en localhost:3000.
// Recorre el alta de cliente como una persona: login, abrir el formulario,
// guardar con el Nombre vacío, crear el cliente y comprobarlo en móvil.
//
// Se lanza con --lang=es para que el navegador dé sus mensajes nativos en
// español, como el Chrome de un usuario colombiano. Con el binario de pruebas
// en inglés el globo diría «Please fill out this field» y la captura no
// representaría al producto.
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const BASE = process.env.QA_BASE || 'http://localhost:3000'
const CHROME = '/root/.agent-browser/browsers/chrome-157.0.8103.78/chrome'
const SALIDA = '/root/bambu/.qa/811'
fs.mkdirSync(SALIDA, { recursive: true })

const pasos = []
const anota = (paso, dato) => {
  pasos.push({ paso, ...dato })
  console.log(`· ${paso}: ${JSON.stringify(dato)}`)
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--lang=es', '--accept-lang=es-CO,es'],
  env: { ...process.env, LANGUAGE: 'es_CO:es', LANG: 'es_CO.UTF-8' },
})

// El banner de notificaciones («Activar / Más tarde») y otros avisos dejan
// botones sobre el contenido. Se descartan antes de pulsar nada.
async function cerrarOverlays(pg) {
  for (const t of ['Más tarde', 'Ahora no', 'Cerrar']) {
    const b = pg.getByRole('button', { name: t, exact: true })
    if (await b.count() > 0) {
      await b.first().click({ timeout: 5000 }).catch(() => {})
      await pg.waitForTimeout(500)
    }
  }
}

async function entrar(pg) {
  await pg.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await pg.waitForTimeout(1500)
  await pg.fill('input[type="text"], input[name="username"], input[id="username"]', 'admin')
  await pg.fill('input[type="password"]', 'admin123')
  await Promise.all([
    pg.waitForURL(u => !u.pathname.includes('/login'), { timeout: 30000 }).catch(() => {}),
    pg.click('button[type="submit"]'),
  ])
}

async function irAClientes(pg) {
  await pg.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await pg.waitForTimeout(5000)
  await cerrarOverlays(pg)
}

async function abrirAlta(pg) {
  const loc = pg.locator('button', { hasText: /Nuevo Cliente/i })
  for (let intento = 0; intento < 10; intento++) {
    const n = await loc.count()
    for (let i = 0; i < n; i++) {
      const c = loc.nth(i)
      if (await c.isVisible().catch(() => false)) {
        await c.scrollIntoViewIfNeeded().catch(() => {})
        await c.click({ timeout: 20000 })
        await pg.waitForTimeout(1800)
        return
      }
    }
    await pg.waitForTimeout(1000)
    await cerrarOverlays(pg)
  }
  throw new Error('No hay botón «Nuevo Cliente» visible')
}

const botonCrear = (pg) => pg.locator('button', { hasText: /Crear cliente|Guardar/i }).first()

// ---------------- escritorio ----------------
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'es-CO',
  extraHTTPHeaders: { 'Accept-Language': 'es-CO,es' },
})
const page = await ctx.newPage()

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
anota('login: página cargada', { url: page.url() })

await entrar(page)
anota('login: enviado', { url: page.url() })
await page.screenshot({ path: `${SALIDA}/1-tras-login.png` })

await irAClientes(page)
anota('clientes: cargado', { url: page.url() })

await abrirAlta(page)
anota('alta: formulario abierto', { ok: true })
await page.screenshot({ path: `${SALIDA}/2-formulario.png` })

// ---- estado real del DOM ----
const estado = await page.evaluate(() => Array.from(document.querySelectorAll('input'))
  .map(i => ({
    ph: i.placeholder || '',
    required: i.required,
    ariaRequired: i.getAttribute('aria-required'),
    id: i.id || '',
    tieneLabel: i.id ? !!document.querySelector(`label[for="${i.id}"]`) : false,
    visible: !!(i.offsetWidth || i.offsetHeight),
  }))
  .filter(x => x.visible))
anota('formulario: estado de required', { campos: estado })

// ---- caso del issue: teléfono lleno, Nombre vacío ----
const telUnico = '30' + String(Date.now()).slice(-8)
await page.fill('input[placeholder="Ej: 310 292 1234"]', telUnico)
await page.waitForTimeout(400)

const crear = botonCrear(page)
await crear.waitFor({ state: 'visible', timeout: 20000 })
await crear.click()
await page.waitForTimeout(1500)

const trasGuardar = await page.evaluate(() => {
  const nombre = document.querySelector('input[placeholder="Ej: Juan"]')
  const form = nombre?.closest('form')
  return {
    url: location.pathname,
    nombre_invalido: nombre ? nombre.matches(':invalid') : null,
    mensaje_navegador: nombre ? nombre.validationMessage : null,
    foco_en_nombre: document.activeElement === nombre,
    form_valido: form ? form.checkValidity() : null,
    aviso_app: document.body.innerText.includes('El nombre es obligatorio'),
  }
})
anota('guardar con nombre vacío', trasGuardar)
await page.screenshot({ path: `${SALIDA}/3-nombre-vacio.png` })

// ---- ahora con el Nombre lleno: debe crear ----
const nombreQA = 'Cliente QA ' + telUnico.slice(-4)
await page.fill('input[placeholder="Ej: Juan"]', nombreQA)
await page.waitForTimeout(400)
await crear.click()
// El guardado real tarda: se espera a que el modal desaparezca o a 15 s.
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(500)
  const abierto = await page.evaluate(() => !!document.querySelector('input[placeholder="Ej: Juan"]'))
  if (!abierto) break
}
const creado = await page.evaluate(() => ({
  modal_abierto: !!document.querySelector('input[placeholder="Ej: Juan"]'),
  error_visible: Array.from(document.querySelectorAll('[class*="red"]'))
    .map(e => e.textContent?.trim()).filter(t => t && t.length > 3).slice(0, 3),
}))
anota('guardar con nombre lleno', { url_final: page.url(), ...creado, nombre: nombreQA })
await page.screenshot({ path: `${SALIDA}/4-creado.png` })

// ---- persiste tras recarga ----
await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
const persiste = await page.evaluate(n => document.body.innerText.includes(n), nombreQA)
anota('recarga: el cliente persiste', { persiste, nombre: nombreQA })

// ---------------- móvil 390x844 ----------------
const mctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'es-CO',
  extraHTTPHeaders: { 'Accept-Language': 'es-CO,es' },
})
const mp = await mctx.newPage()
await mp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await mp.waitForTimeout(1200)
await entrar(mp)
await irAClientes(mp)
await abrirAlta(mp)
await botonCrear(mp).waitFor({ state: 'visible', timeout: 20000 })
await botonCrear(mp).click()
await mp.waitForTimeout(1500)
const movil = await mp.evaluate(() => {
  const n = document.querySelector('input[placeholder="Ej: Juan"]')
  return {
    nombre_invalido: n ? n.matches(':invalid') : null,
    mensaje_navegador: n ? n.validationMessage : null,
    foco_en_nombre: document.activeElement === n,
    hay_desborde_horizontal: document.documentElement.scrollWidth > window.innerWidth + 2,
    ancho_documento: document.documentElement.scrollWidth,
    ancho_ventana: window.innerWidth,
  }
})
anota('móvil 390x844: nombre vacío', movil)
await mp.screenshot({ path: `${SALIDA}/5-movil.png` })

await mctx.close().catch(() => {})
await ctx.close().catch(() => {})
await browser.close()
console.log('--- QA terminado ---')
