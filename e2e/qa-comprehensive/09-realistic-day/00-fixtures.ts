/**
 * 09-realistic-day/00-fixtures.ts
 *
 * Helpers para tests E2E "realistas" — simulan el día a día de cada rol
 * de la app Agua Bambú. Se diferencia de los tiers 01-08 en que NO es
 * destructivo ni adversarial: simula uso humano real.
 *
 * Re-exporta helpers de los fixtures existentes y agrega los específicos
 * para esta suite:
 *
 *  - `fillBaseCajaModal`    Llena el modal de base de caja (NO skip)
 *  - `simulateDay`          Wrapper de time-travel con cleanup
 *  - `setOffline`           Corta/Restablece la red
 *  - `waitForSync`          Espera a que drenen las requestQueue
 *  - `getQueueSize`         Cuenta items en Dexie requestQueue
 *  - `clearRequestQueue`    Limpia IndexedDB
 *  - `seedDay`              Setup completo del día (clientes base + repartidor)
 *  - `waitForKpiUpdate`     Espera que un KPI del dashboard cambie
 *  - Helpers de API con shapes correctas de Zod schemas reales
 */

import { test as base, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import { resolve } from 'path'
import {
  BASE,
  login as baseLogin,
  handleBaseCaja,
  apiPost,
  apiGet,
  apiPut,
  apiDelete,
  resetTestDatabase,
  resetDatabase,
  skipBaseCaja,
} from '../../fixtures'

// ─── Re-exports de los fixtures existentes ────────────────────────────────────
export {
  BASE,
  expect,
  apiPost,
  apiGet,
  apiPut,
  apiDelete,
  resetTestDatabase,
  resetDatabase,
  handleBaseCaja,
  skipBaseCaja,
}

// ─── Credenciales (alineado con prisma/seed.ts) ───────────────────────────────
export const CREDENTIALS = {
  admin:     { user: 'admin',      pass: 'admin123' },
  asistente: { user: 'asistente',  pass: 'asist123' },
  contador:  { user: 'contador',   pass: 'cont123' },
  repartidor:{ user: 'repartidor', pass: 'rep123'   },
  sellador:  { user: 'sellador',   pass: 'sell123'  },
} as const

export type TestRole = keyof typeof CREDENTIALS

// ─── Date Helpers ────────────────────────────────────────────────────────────

/** Fecha de hoy en formato YYYY-MM-DD (zona horaria del server) */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

/** Fecha hace N días */
export function daysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

/** Fecha en N días */
export function daysFromNowISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

/** Date.now() para usar como sufijo único */
export function nowTimestamp(): string {
  return Date.now().toString(36)
}

// ─── Auth (wrapper) ─────────────────────────────────────────────────────────

/**
 * Limpia el estado de la DB que puede romper los tests realistic-day:
 * - CierreDia futuros y recientes (para que el modal NO redirija)
 * - Config BASE_DIA_* (para que el modal SI aparezca)
 *
 * Se ejecuta vía child_process porque Prisma Client no es trivial de
 * importar desde el contexto de Playwright test runner.
 */
export function cleanTestState() {
  const cwd = resolve(__dirname, '../..', '..')
  const env = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://app_write:bambu_app_write@localhost:5433/bambu',
  }
  try {
    execSync(
      'npx tsx e2e/qa-comprehensive/09-realistic-day/clean-test-state.ts',
      { cwd, env, stdio: 'pipe' }
    )
  } catch (err) {
    console.error('[cleanTestState] failed:', err)
  }
}

/**
 * Login + llena el modal de base caja con un monto realista.
 * Si el rol no ve el modal (REPARTIDOR/CONTADOR), solo hace login.
 *
 * @param amount Monto de base de caja en COP (default: 50.000)
 */
export async function fullLoginRealistic(
  page: Page,
  role: TestRole,
  amount: number = 50_000
) {
  // Pre-cleanup: borrar cierres/configs que pueden romper el modal
  cleanTestState()

  const { user, pass } = CREDENTIALS[role]
  await baseLogin(page, user, pass)
  // Después del login, esperar a que el modal aparezca o a que cargue la página
  await page.waitForTimeout(500)
  await fillBaseCajaModal(page, amount)
}

/**
 * Llena el modal de base caja si está visible.
 * No falla si no está (porque REPARTIDOR/CONTADOR no lo ven).
 */
export async function fillBaseCajaModal(page: Page, amount: number = 50_000) {
  // El modal tiene id="base-dia-input" según base-caja-modal.tsx línea 171
  // Esperar hasta 3 segundos a que aparezca
  const input = page.locator('#base-dia-input')
  try {
    await input.waitFor({ state: 'visible', timeout: 3000 })
  } catch {
    // No apareció (rol no ve modal, o ya está seteada)
    return false
  }
  await input.fill(String(amount))
  // Esperar 100ms para que React actualice
  await page.waitForTimeout(150)
  // Click en "Continuar →"
  const submit = page.locator('button[type="submit"]:has-text("Continuar")')
  await submit.click()
  // Esperar a que el modal desaparezca
  await page.waitForSelector('#base-dia-input', { state: 'detached', timeout: 5000 })
  return true
}

// ─── Offline (Dexie + network) ───────────────────────────────────────────────

/**
 * Corta/Restablece la red para simular offline.
 * Usa context.setOffline() de Playwright.
 */
export async function setOffline(page: Page, offline: boolean = true) {
  await page.context().setOffline(offline)
}

/**
 * Espera a que la requestQueue drene (todos los items enviados al server).
 * Polling al endpoint /api/health cada 500ms; timeout 30s por default.
 *
 * NOTA: No podemos leer IndexedDB directamente desde Node, pero sí podemos
 * verificar que la red responde. La forma robusta es esperar a que
 * el toast "Conectado" aparezca o a que el counter del connectivity-indicator
 * vuelva a 0.
 */
export async function waitForSync(page: Page, timeoutMs: number = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    // El ConnectivityIndicator muestra un badge con el count de items pendientes.
    // Si no hay badge visible, no hay pendientes.
    const pendingBadge = page.locator('[data-testid="pending-sync-count"]')
    if ((await pendingBadge.count()) === 0) {
      // Verificar también haciendo un GET de health
      try {
        const res = await page.request.get(`${BASE}/api/health`)
        if (res.ok()) return true
      } catch {
        // todavía offline
      }
    }
    await page.waitForTimeout(500)
  }
  return false
}

/**
 * Cuenta items en la requestQueue de Dexie ejecutando JS en el browser.
 * Devuelve { count, items: [{ offlineId, url, method }] }
 */
export async function getQueueSize(page: Page): Promise<{ count: number; items: any[] }> {
  return page.evaluate(async () => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return { count: 0, items: [] }
    }
    // Abrir la DB manualmente porque no tenemos acceso al módulo offlineDb
    const dbReq = indexedDB.open('AguaBambuOfflineDB')
    return new Promise<{ count: number; items: any[] }>((resolve) => {
      dbReq.onsuccess = () => {
        const db = dbReq.result
        if (!db.objectStoreNames.contains('requestQueue')) {
          db.close()
          resolve({ count: 0, items: [] })
          return
        }
        const tx = db.transaction('requestQueue', 'readonly')
        const store = tx.objectStore('requestQueue')
        const req = store.getAll()
        req.onsuccess = () => {
          const items = (req.result || []).map((it: any) => ({
            offlineId: it.offlineId,
            url: it.url,
            method: it.method,
            localEndpoint: it.localEndpoint,
          }))
          db.close()
          resolve({ count: items.length, items })
        }
        req.onerror = () => {
          db.close()
          resolve({ count: 0, items: [] })
        }
      }
      dbReq.onerror = () => resolve({ count: 0, items: [] })
    })
  })
}

/** Limpia la requestQueue de Dexie (para tests que empiezan offline-limpio) */
export async function clearRequestQueue(page: Page) {
  await page.evaluate(async () => {
    return new Promise<void>((resolve) => {
      const dbReq = indexedDB.open('AguaBambuOfflineDB')
      dbReq.onsuccess = () => {
        const db = dbReq.result
        if (!db.objectStoreNames.contains('requestQueue')) {
          db.close()
          resolve()
          return
        }
        const tx = db.transaction('requestQueue', 'readwrite')
        tx.objectStore('requestQueue').clear()
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          resolve()
        }
      }
      dbReq.onerror = () => resolve()
    })
  })
}

// ─── Day Simulation ──────────────────────────────────────────────────────────

/**
 * Simula que el navegador está en una fecha específica.
 *
 * NOTA IMPORTANTE: Esto NO cambia la fecha del server. El server siempre
 * usa NOW() en zona horaria Bogota. Por lo tanto:
 *
 * - Para fechas PASADAS: crear entidades via API con sus timestamps ya
 *   pasados. `simulateDay(date, fn)` es principalmente para tests UI
 *   donde querés ver el calendario con otra fecha.
 *
 * - Para el día de HOY: no hace falta simular, ambos relojes coinciden.
 *
 * - Para fechas FUTURAS: no se puede simular en la app real (el server
 *   rechaza). Solo se usa para verificar que la UI no rompe.
 */
export async function simulateDay(page: Page, date: string | Date) {
  const target = typeof date === 'string' ? new Date(date + 'T12:00:00') : date
  // Sobrescribir Date.now() en el browser. Funciona para new Date() y Date.now().
  // NO afecta a performance.now() ni a timers internos del browser.
  await page.addInitScript((fakeNow: number) => {
    const RealDate = Date
    // @ts-expect-error - patching global
    globalThis.Date = class extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(fakeNow)
        } else {
          // @ts-expect-error - spread
          super(...args)
        }
      }
      static now() {
        return fakeNow
      }
    }
  }, target.getTime())
}

// ─── Seed del día ────────────────────────────────────────────────────────────

/**
 * Setup completo para simular un día normal.
 * Crea: 1 repartidor (ya viene en seed-test), 3 clientes, 2 productos extra.
 * Retorna los IDs de las entidades creadas.
 */
export async function seedDay(page: Page, overrides?: {
  clientesCount?: number
  baseCaja?: number
}) {
  const clientesCount = overrides?.clientesCount ?? 3
  const baseCaja = overrides?.baseCaja ?? 50_000

  // 1. Llenar base de caja con el monto dado
  await fillBaseCajaModal(page, baseCaja)

  // 2. Crear N clientes
  const clientes: Array<{ id: string; nombre: string }> = []
  for (let i = 0; i < clientesCount; i++) {
    const r = await apiPost(page, '/api/clientes', {
      nombre: `Cliente ${nowTimestamp()}-${i}`,
      telefono: `3${String(Date.now() + i).slice(-9)}`,
      direccion: `Calle ${100 + i} #${15 + i}-${20 + i}`,
      barrio: i % 2 === 0 ? 'Centro' : 'Chapinero',
    })
    const body = await r.json()
    const clienteId = body.cliente?.id || body.id
    if (clienteId) {
      clientes.push({ id: clienteId, nombre: body.cliente?.nombre || body.nombre })
    }
  }

  // 3. Obtener primer repartidor existente
  const trabRes = await apiGet(page, '/api/trabajadores?rol=REPARTIDOR&activo=true')
  const trabBody = await trabRes.json()
  const repartidor = trabBody.trabajadores?.[0]

  return {
    clientes,
    repartidor,
    baseCaja,
  }
}

// ─── KPI Helpers ────────────────────────────────────────────────────────────

/**
 * Espera a que un KPI del dashboard cambie al valor esperado.
 *
 * @param selector Selector del KPI (texto o elemento)
 * @param expectedText Texto que debe contener
 * @param timeoutMs Default 10s
 */
export async function waitForKpiUpdate(
  page: Page,
  selector: string,
  expectedText: string | RegExp,
  timeoutMs: number = 10_000
) {
  const el = page.locator(selector)
  await el.waitFor({ state: 'visible', timeout: timeoutMs })
  if (typeof expectedText === 'string') {
    await expect(el).toContainText(expectedText, { timeout: timeoutMs })
  } else {
    await expect(el).toContainText(expectedText, { timeout: timeoutMs })
  }
}

// ─── Entity Creators (shape-aware según Zod schemas reales) ─────────────────

/** Crea un cliente vía API con shape validada (ClienteCreateSchema) */
export async function createClienteReal(
  page: Page,
  data: {
    nombre: string
    telefono: string
    apellido?: string
    direccion?: string
    barrio?: string
    fuente?: string
    linkUbicacion?: string
    notas?: string
  }
) {
  const res = await apiPost(page, '/api/clientes', data)
  return res.json() as Promise<{
    cliente?: { id: string; nombre: string }
    id?: string
  }>
}

/** Crea un pedido vía API con shape validada (PedidoCreateSchema) */
export async function createPedidoReal(
  page: Page,
  data: {
    clienteId: string
    items: Array<{ producto: 'PACA_AGUA' | 'PACA_HIELO' | 'BOTELLON'; cantidad: number }>
    canal?: 'PUNTO' | 'DOMICILIO'
    pagos?: Array<{ metodo: 'EFECTIVO' | 'TRANSFERENCIA' | 'NEQUI' | 'DAVIPLATA' | 'BONO'; monto: number }>
    obs?: string
  }
) {
  const res = await apiPost(page, '/api/pedidos', {
    clienteId: data.clienteId,
    items: data.items,
    canal: data.canal ?? 'DOMICILIO',
    pagos: data.pagos,
    obs: data.obs,
  })
  return res.json() as Promise<{
    pedido?: { id: string; numero: string; total: number }
    id?: string
  }>
}

/** Crea un embarque vía API con shape validada (EmbarqueCreateSchema) */
export async function createEmbarqueReal(
  page: Page,
  data: {
    trabajadorId: string
    horaSalida?: string
    baseDinero?: number
    carga: Array<{ producto: 'PACA_AGUA' | 'PACA_HIELO'; cargadas: number; devueltas?: number }>
    pedidoIds?: string[]
    obs?: string
  }
) {
  const res = await apiPost(page, '/api/embarques', {
    trabajadorId: data.trabajadorId,
    horaSalida: data.horaSalida ?? '08:00',
    baseDinero: data.baseDinero ?? 50000,
    carga: data.carga,
    obs: data.obs,
  })
  return res.json() as Promise<{
    embarque?: { id: string; numero: string; estado: string }
    id?: string
  }>
}

/**
 * Obtiene el repartidor del SEED (usuario 'repartidor' linkeado).
 * Único, estable entre tests, tiene userId asociado para login.
 * A diferencia de `trabajadores?.[0]` que devuelve un random.
 */
export async function getRepartidorSeed(page: Page) {
  const res = await apiGet(page, '/api/trabajadores?rol=REPARTIDOR&activo=true')
  const body = await res.json()
  const trabajadores = body.trabajadores || []
  // Buscar el que tenga userId (linkeado al User 'repartidor' del seed)
  const linked = trabajadores.find((t: any) => t.userId)
  return linked || trabajadores[0]
}

/**
 * Crea un embarque para el repartidor del SEED, evitando el conflicto
 * "ya tiene un embarque abierto" cerrando los previos.
 *
 * El schema de cerrar (CerrarEmbarqueSchema en validators.ts:450) requiere
 * `pedidos: []` y `productos: [{...}]` con al menos 1 producto.
 */
export async function createEmbarqueParaRepartidorSeed(
  page: Page,
  opts?: { horaSalida?: string; baseDinero?: number }
) {
  const repartidor = await getRepartidorSeed(page)
  if (!repartidor) {
    throw new Error('No se encontró repartidor del SEED')
  }
  // Cerrar embarques abiertos de este repartidor (de tests anteriores)
  const embRes = await apiGet(page, `/api/embarques?trabajadorId=${repartidor.id}&estado=ABIERTO`)
  const embBody = await embRes.json()
  for (const emb of embBody.embarques || []) {
    await apiPost(page, `/api/embarques/${emb.id}/cerrar`, {
      pedidos: [],
      productos: [
        { producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 },
        { producto: 'PACA_HIELO', devueltas: 0, cambios: 0, rotas: 0 },
      ],
      dineroEntregado: 0,
    }).catch(() => {})
  }
  return createEmbarqueReal(page, {
    trabajadorId: repartidor.id,
    horaSalida: opts?.horaSalida ?? '08:00',
    baseDinero: opts?.baseDinero ?? 50000,
    carga: [{ producto: 'PACA_AGUA', cargadas: 10 }],
  })
}

/** Crea un trabajador (repartidor o sellador) vía API */
export async function createTrabajadorReal(
  page: Page,
  data: {
    nombre: string
    rol: 'REPARTIDOR' | 'SELLADOR' | 'ADMIN' | 'ASISTENTE'
    usaMoto?: boolean
    capacidadKg?: number
    tipoPago?: 'COMISION' | 'FIJO' | 'MIXTO'
    telefono?: string
  }
) {
  const res = await apiPost(page, '/api/trabajadores', {
    nombre: data.nombre,
    rol: data.rol,
    usaMoto: data.usaMoto ?? (data.rol === 'REPARTIDOR'),
    capacidadKg: data.capacidadKg ?? 500,
    tipoPago: data.tipoPago ?? 'COMISION',
    telefono: data.telefono,
  })
  return res.json() as Promise<{
    trabajador?: { id: string; nombre: string }
    id?: string
  }>
}

/** Crea un gasto vía API */
export async function createGastoReal(
  page: Page,
  data: {
    categoria: 'ARRIENDO' | 'SERVICIOS' | 'INSUMOS' | 'MANTENIMIENTO' | 'TRANSPORTE' | 'NOMINA' | 'OTRO'
    descripcion: string
    monto: number
    responsable?: string
    notas?: string
  }
) {
  const res = await apiPost(page, '/api/gastos', data)
  return res.json()
}

/** Crea una compra a proveedor */
export async function createCompraReal(
  page: Page,
  data: {
    proveedorId: string
    insumoId: string
    cantidad: number
    montoTotal: number
    notas?: string
  }
) {
  const res = await apiPost(page, '/api/compras', data)
  return res.json()
}

/** Crea un insumo (necesita proveedor) */
export async function createInsumoReal(
  page: Page,
  data: {
    nombre: string
    unidad?: 'UNIDAD' | 'LITRO' | 'KG' | 'PACA' | 'BOLSA' | 'CAJA'
    stock?: number
    stockMin?: number
    precioUnit?: number
    proveedorId?: string
  }
) {
  const res = await apiPost(page, '/api/insumos', {
    nombre: data.nombre,
    unidad: data.unidad ?? 'UNIDAD',
    stock: data.stock ?? 100,
    stockMin: data.stockMin ?? 10,
    precioUnit: data.precioUnit ?? 5000,
    proveedorId: data.proveedorId,
  })
  return res.json() as Promise<{
    insumo?: { id: string; nombre: string }
    id?: string
  }>
}

/** Crea un proveedor */
export async function createProveedorReal(
  page: Page,
  data?: { nombre?: string; telefono?: string }
) {
  const res = await apiPost(page, '/api/proveedores', {
    nombre: data?.nombre || `Proveedor Test ${nowTimestamp()}`,
    telefono: data?.telefono || `3${String(Date.now()).slice(-9)}`,
  })
  return res.json() as Promise<{
    proveedor?: { id: string; nombre: string }
    id?: string
  }>
}

// ─── Test fixture: setup por test ───────────────────────────────────────────

/**
 * Fixture base de Playwright con auto-cleanup de la requestQueue
 * antes de cada test, y reset de la base de datos entre grupos.
 */
export const test = base.extend<{ dayReady: void }>({
  dayReady: [
    async ({ page }, use) => {
      // Antes del test: limpiar la cola residual de tests previos
      await page.context().addInitScript(() => {
        // Service worker bypass para tests deterministas
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then((regs) => {
            regs.forEach((reg) => reg.unregister())
          })
        }
      })
      await use()
      // Después del test: limpiar la cola (no contaminear otros tests)
      try {
        await clearRequestQueue(page)
      } catch {
        // page puede estar cerrado
      }
    },
    { auto: true },
  ],
})
