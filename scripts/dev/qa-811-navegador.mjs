// QA real de #811 contra el ERP levantado en localhost:3000.
// Recorre el alta de cliente como una persona: login, abrir el formulario,
// guardar con el nombre vacío y comprobar qué hace el navegador.
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

// --lang=es para que el navegador dé sus mensajes nativos en español, como el
// Chrome real de un usuario colombiano. Sin esto el binario de pruebas
// responde en inglés y la captura no representa al producto.
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--lang=es', '--accept-lang=es-CO,es'],
  env: { ...process.env, LANGUAGE: 'es_CO:es', LANG: 'es_CO.UTF-8' },
})

async function sesion(viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'es-CO', extraHTTPHeaders: { 'Accept-Language': 'es-CO,es' } })
  const page = await ctx.newPage()
  return { ctx, page }
}

// ---------- 1. login con rol admin ----------
const { ctx, page } = await sesion({ width: 1440, height: 900 })
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
anota('login: página cargada', { url: page.url() })

await page.fill('input[type="text"], input[name="username"], input[id="username"]', 'admin')
await page.fill('input[type="password"]', 'admin123')
await Promise.all([
  page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 30000 }).catch(() => {}),
  page.click('button[type="submit"]'),
])
anota('login: enviado', { url: page.url() })
await page.screenshot({ path: `${SALIDA}/1-tras-login.png`, fullPage: false })

// ---------- 2. abrir el alta de cliente ----------
await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
anota('clientes: cargado', { url: page.url() })

// El botón de alta puede variar; se prueban los nombres razonables.
const candidatos = [
  'Nuevo cliente', 'Nuevo Cliente', 'Crear cliente', 'Agregar cliente', '+ Nuevo',
]
let abierto = false
for (const nombre of candidatos) {
  const btn = page.getByRole('button', { name: nombre })
  if (await btn.count() > 0) {
    await btn.first().click()
    abierto = true
    anota('alta: botón pulsado', { boton: nombre })
    break
  }
}
if (!abierto) {
  const b = page.locator('button:has-text("cliente")').first()
  if (await b.count() > 0) { await b.click(); abierto = true; anota('alta: botón por texto', { ok: true }) }
}
await page.waitForTimeout(1500)
await page.screenshot({ path: `${SALIDA}/2-formulario.png`, fullPage: false })

// ---------- 3. estado de required en el formulario real ----------
const estado = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll('input'))
  return inputs.map(i => ({
    ph: i.placeholder || '',
    required: i.required,
    ariaRequired: i.getAttribute('aria-required'),
    id: i.id || '',
    tieneLabel: i.id ? !!document.querySelector(`label[for="${i.id}"]`) : false,
    visible: !!(i.offsetWidth || i.offsetHeight),
  })).filter(x => x.visible)
})
anota('formulario: estado de required', { campos: estado })

// ---------- 4. guardar con el NOMBRE vacío y el teléfono lleno ----------
// Este es el caso del issue: antes el error del nombre sólo aparecía después
// de corregir el teléfono.
const p2 = await ctx.newPage()
await p2.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
await p2.waitForTimeout(4000)
await p2.getByRole('button', { name: 'Nuevo cliente' }).first().click()
await p2.waitForTimeout(1500)

let envios = 0
await p2.exposeFunction('__contarEnvio', () => { envios += 1 })

// Teléfono lleno, nombre vacío
const telUnico = '30' + String(Date.now()).slice(-8)
await p2.fill('input[placeholder="Ej: 310 292 1234"]', telUnico)
await p2.waitForTimeout(300)

const botonGuardar = p2.getByRole('button', { name: /Crear cliente|Guardar/ }).first()
await botonGuardar.waitFor({ state: 'visible', timeout: 20000 })
await botonGuardar.click()
await p2.waitForTimeout(1200)

const trasGuardar = await p2.evaluate(() => {
  const nombre = document.querySelector('input[placeholder="Ej: Juan"]')
  const form = nombre?.closest('form')
  return {
    url: location.pathname,
    nombre_invalido: nombre ? nombre.matches(':invalid') : null,
    mensaje_navegador: nombre ? nombre.validationMessage : null,
    foco_en_nombre: document.activeElement === nombre,
    form_valido: form ? form.checkValidity() : null,
    // ¿apareció el aviso propio de la app?
    aviso_app: document.body.innerText.includes('El nombre es obligatorio'),
  }
})
anota('guardar con nombre vacío', trasGuardar)
await p2.screenshot({ path: `${SALIDA}/3-nombre-vacio.png`, fullPage: false })

// ---------- 5. ahora sí, llenar el nombre y guardar ----------
await p2.fill('input[placeholder="Ej: Juan"]', 'Cliente QA ' + telUnico.slice(-4))
await p2.waitForTimeout(300)
const bg2 = p2.getByRole('button', { name: /Crear cliente|Guardar/ }).first()
await bg2.waitFor({ state: 'visible', timeout: 20000 })
await bg2.click()
// Esperar a que el guardado termine de verdad: el modal se cierra o aparece error
await p2.waitForTimeout(8000)
const cierre = await p2.evaluate(() => ({
  modal_abierto: !!document.querySelector('form#cliente-form'),
  texto_guardando: document.body.innerText.includes('Guardando'),
  error_visible: Array.from(document.querySelectorAll('[class*="red"]'))
    .map(e => e.textContent?.trim()).filter(t => t && t.length > 3).slice(0, 3),
}))
anota('guardar con nombre lleno', { url_final: p2.url(), ...cierre })
await p2.screenshot({ path: `${SALIDA}/4-creado.png`, fullPage: false })



// ---------- 6. persiste tras recarga ----------
await p2.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
await p2.waitForTimeout(4000)
const persiste = await p2.evaluate(() => document.body.innerText.includes('Cliente QA'))
anota('recarga: el cliente persiste', { persiste })

// ---------- 7. móvil 390x844 ----------
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO', extraHTTPHeaders: { 'Accept-Language': 'es-CO,es' } })
const mp = await mctx.newPage()
await mp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await mp.waitForTimeout(1200)
await mp.fill('input[type="text"], input[name="username"], input[id="username"]', 'admin')
await mp.fill('input[type="password"]', 'admin123')
await Promise.all([
  mp.waitForURL(u => !u.pathname.includes('/login'), { timeout: 30000 }).catch(() => {}),
  mp.click('button[type="submit"]'),
])
await mp.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
await mp.waitForTimeout(4000)
await mp.getByRole('button', { name: 'Nuevo cliente' }).first().click()
await mp.waitForTimeout(1500)
const bm = mp.getByRole('button', { name: /Crear cliente|Guardar/ }).first()
await bm.waitFor({ state: 'visible', timeout: 20000 })
await bm.click()
await mp.waitForTimeout(1200)
const movil = await mp.evaluate(() => {
  const n = document.querySelector('input[placeholder="Ej: Juan"]')
  return {
    nombre_invalido: n ? n.matches(':invalid') : null,
    foco_en_nombre: document.activeElement === n,
    hay_desborde_horizontal: document.documentElement.scrollWidth > window.innerWidth + 2,
    ancho_documento: document.documentElement.scrollWidth,
    ancho_ventana: window.innerWidth,
  }
})
anota('móvil 390x844: nombre vacío', movil)
await mp.screenshot({ path: `${SALIDA}/5-movil.png`, fullPage: false })

await mctx.close().catch(() => {})
await ctx.close().catch(() => {})
await browser.close()
console.log('--- QA terminado ---')
