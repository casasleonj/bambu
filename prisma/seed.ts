/**
 * Seed: Agua Bambú v2.
 *
 * - 5 users (admin, asis, sell, repar, cont) — mustChangePassword = false
 * - 6 trabajadores (Kevin, Yesid, Jhonnatan, Romel, Edwin, Jose)
 *   * Edwin (EMPACADOR) and Jose (ENTUBADOR) have no User
 *   * Lilia (User asis) has no Trabajador
 *   * The other 4 Users link to their Trabajador via userId
 * - 12+ Config rows (empresa, alertas, foto, bloqueo)
 * - 5 Productos + PrecioVolumen + PrecioHistorial
 *
 * Idempotent: uses upsert where unique exists, findFirst+create otherwise.
 * Safe to run twice in dev.
 */
import { PrismaClient, RolUsuario, TipoPagoTrabajador } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const SALT_ROUNDS = 12

const HASH_CACHE = new Map<string, string>()
async function hashPassword(plain: string): Promise<string> {
  const cached = HASH_CACHE.get(plain)
  if (cached) return cached
  const hashed = await bcrypt.hash(plain, SALT_ROUNDS)
  HASH_CACHE.set(plain, hashed)
  return hashed
}

interface UserSeed {
  username: string
  password: string
  rol: RolUsuario
  nombre: string
  apellido: string
  /** If set, the user will be linked to the Trabajador with this nombre (and rol) */
  linkToTrabajador?: { nombre: string; rol: string }
}

interface TrabajadorSeed {
  nombre: string
  telefono: string
  rol: 'REPARTIDOR' | 'SELLADOR' | 'EMPACADOR' | 'ENTUBADOR' | 'ADMIN'
  usaMoto: boolean
  capacidadKg: number
  tipoPago: TipoPagoTrabajador
  /** If set, link Trabajador.userId to the user with this username */
  linkToUsername?: string
}

const USERS: UserSeed[] = [
  {
    username: 'admin',
    password: 'admin123',
    rol: RolUsuario.ADMIN,
    nombre: 'Jhonnatan',
    apellido: 'Quispe',
    linkToTrabajador: { nombre: 'Jhonnatan Quispe', rol: 'ADMIN' },
  },
  {
    username: 'asistente',
    password: 'asist123',
    rol: RolUsuario.ASISTENTE,
    nombre: 'Lilia',
    apellido: 'Castilla',
    // No Trabajador link — Lilia is user-only
  },
  {
    username: 'sellador',
    password: 'sell123',
    rol: RolUsuario.SELLADOR,
    nombre: 'Kevin',
    apellido: 'Caballero',
    linkToTrabajador: { nombre: 'Kevin Caballero', rol: 'SELLADOR' },
  },
  {
    username: 'repartidor',
    password: 'rep123',
    rol: RolUsuario.REPARTIDOR,
    nombre: 'Yesid',
    apellido: 'Ramírez',
    linkToTrabajador: { nombre: 'Yesid Ramírez', rol: 'REPARTIDOR' },
  },
  {
    username: 'contador',
    password: 'cont123',
    rol: RolUsuario.CONTADOR,
    nombre: 'Romel',
    apellido: 'Torres',
    linkToTrabajador: { nombre: 'Romel Torres', rol: 'ADMIN' },
  },
]

const TRABAJADORES: TrabajadorSeed[] = [
  {
    nombre: 'Kevin Caballero',
    telefono: '3001110001',
    rol: 'SELLADOR',
    usaMoto: false,
    capacidadKg: 0,
    tipoPago: TipoPagoTrabajador.FIJO,
    linkToUsername: 'sellador',
  },
  {
    nombre: 'Yesid Ramírez',
    telefono: '3001110002',
    rol: 'REPARTIDOR',
    usaMoto: true,
    capacidadKg: 500,
    tipoPago: TipoPagoTrabajador.COMISION,
    linkToUsername: 'repartidor',
  },
  {
    nombre: 'Jhonnatan Quispe',
    telefono: '3001110003',
    rol: 'ADMIN',
    usaMoto: false,
    capacidadKg: 0,
    tipoPago: TipoPagoTrabajador.FIJO,
    linkToUsername: 'admin',
  },
  {
    nombre: 'Romel Torres',
    telefono: '3001110004',
    rol: 'ADMIN',
    usaMoto: false,
    capacidadKg: 0,
    tipoPago: TipoPagoTrabajador.FIJO,
    linkToUsername: 'contador',
  },
  // Edwin y Jose son SOLO Trabajadores (sin User)
  {
    nombre: 'Edwin Vargas',
    telefono: '3001110005',
    rol: 'EMPACADOR',
    usaMoto: false,
    capacidadKg: 0,
    tipoPago: TipoPagoTrabajador.FIJO,
  },
  {
    nombre: 'Jose Mendoza',
    telefono: '3001110006',
    rol: 'ENTUBADOR',
    usaMoto: false,
    capacidadKg: 0,
    tipoPago: TipoPagoTrabajador.FIJO,
  },
]

const CONFIGS: Array<{ clave: string; valor: string; descripcion?: string }> = [
  // Operación
  { clave: 'BASE_DIA', valor: '50000', descripcion: 'Base diaria para cálculo de comisiones mixtas' },
  { clave: 'DIAS_ALERTA_NO_VERIFICADO', valor: '15', descripcion: 'Días para alertar clientes no verificados' },
  { clave: 'DIAS_VENCIMIENTO_PROMESA', valor: '2', descripcion: 'Días antes de marcar promesa de pago vencida' },
  { clave: 'MAX_PEDIDOS_DIA_ALERTA', valor: '2', descripcion: 'Máx pedidos/día antes de alerta' },
  { clave: 'LIMITE_PEDIDOS_FIADOS_DEFAULT', valor: '3', descripcion: 'Límite default de pedidos fiados por cliente' },

  // Umbrales de alertas antifraude (Bloque: Sistema de Alertas)
  { clave: 'MULTIPLICADOR_MONTO_ANOMALO', valor: '2', descripcion: 'Multiplicador sobre mediana para disparar alerta MONTO_ANOMALO' },
  { clave: 'VARIACION_PRECIO_BRUSCO_PCT', valor: '30', descripcion: '% máximo de variación de precio vs último pedido sin alerta (1-100)' },
  { clave: 'UMBRAL_DEUDA_REPARTIDOR_PACAS', valor: '50', descripcion: 'Umbral de deuda acumulada (pacas) para alerta REPARTIDOR_DEUDA_ALTA' },
  { clave: 'DIAS_SIN_JUSTIFICAR_DESCUENTO', valor: '2', descripcion: 'Días sin justificar para alerta DESCUENTO_NO_JUSTIFICADO' },
  { clave: 'PCT_DEVOLUCIONES_ANORMALES', valor: '2', descripcion: 'Multiplicador sobre promedio de devoluciones/roturas para alerta (>=1)' },

  // Reglas de negocio activables
  { clave: 'BLOQUEAR_PRECIOS_REPARTIDOR', valor: 'true', descripcion: 'Si true, REPARTIDOR no ve ni modifica precios' },
  { clave: 'REQUIERE_FOTO_ENTREGA', valor: 'true', descripcion: 'Si true, REPARTIDOR y trabajadores con moto deben tomar foto' },

  // Empresa
  { clave: 'empresa_nombre', valor: 'Agua Bambú' },
  { clave: 'empresa_nit', valor: '49008664', descripcion: 'Cédula/NIT del propietario' },
  { clave: 'empresa_direccion', valor: 'Vereda Centro, Pueblo Nuevo' },
  { clave: 'empresa_telefono', valor: '300 000 0000' },
  { clave: 'empresa_email', valor: 'contacto@aguabambu.com' },
]

const PRECIO_BASE: Record<string, number> = {
  PACA_AGUA: 6500,
  PACA_HIELO: 8000,
  BOTELLON: 7500,
  BOLSA_AGUA: 2500,
  BOLSA_HIELO: 3000,
}

const PRODUCTOS = [
  {
    codigo: 'PACA_AGUA',
    nombre: 'Paca de Agua (40u 300ml)',
    unidad: 'paca',
    contenido: '40 bolsas x 300ml',
    aplicaDomicilio: true,
    sobreCostoDomicilio: 0,
  },
  {
    codigo: 'PACA_HIELO',
    nombre: 'Paca de Hielo (20u 600ml)',
    unidad: 'paca',
    contenido: '20 bolsas x 600ml',
    aplicaDomicilio: true,
    sobreCostoDomicilio: 0,
  },
  {
    codigo: 'BOTELLON',
    nombre: 'Botellón 20LT',
    unidad: 'unidad',
    contenido: '20 litros',
    aplicaDomicilio: true,
    sobreCostoDomicilio: 2500,
  },
  {
    codigo: 'BOLSA_AGUA',
    nombre: 'Bolsa de Agua 300ml',
    unidad: 'unidad',
    contenido: '300ml',
    aplicaDomicilio: true,
    sobreCostoDomicilio: 0,
  },
  {
    codigo: 'BOLSA_HIELO',
    nombre: 'Bolsa de Hielo 600ml',
    unidad: 'unidad',
    contenido: '600ml',
    aplicaDomicilio: true,
    sobreCostoDomicilio: 0,
  },
] as const

const PRECIOS_VOLUMEN: Array<{ codigo: string; cantMin: number; cantMax: number | null; precio: number }> = [
  { codigo: 'PACA_AGUA', cantMin: 1, cantMax: 4, precio: 2800 },
  { codigo: 'PACA_AGUA', cantMin: 5, cantMax: 9, precio: 2500 },
  { codigo: 'PACA_AGUA', cantMin: 10, cantMax: null, precio: 2300 },
  { codigo: 'PACA_HIELO', cantMin: 1, cantMax: null, precio: 2500 },
  { codigo: 'BOTELLON', cantMin: 1, cantMax: null, precio: 7500 },
  { codigo: 'BOLSA_AGUA', cantMin: 1, cantMax: null, precio: 300 },
  { codigo: 'BOLSA_HIELO', cantMin: 1, cantMax: null, precio: 500 },
]

async function seedUsers() {
  for (const u of USERS) {
    const hashed = await hashPassword(u.password)
    await prisma.user.upsert({
      where: { username: u.username },
      update: {
        password: hashed,
        rol: u.rol,
        nombre: u.nombre,
        apellido: u.apellido,
        mustChangePassword: false,
        activo: true,
      },
      create: {
        username: u.username,
        password: hashed,
        rol: u.rol,
        nombre: u.nombre,
        apellido: u.apellido,
        mustChangePassword: false,
        activo: true,
      },
    })
  }
  console.log(`✅ ${USERS.length} users seeded`)
}

async function seedTrabajadores() {
  for (const t of TRABAJADORES) {
    const existing = await prisma.trabajador.findFirst({
      where: { telefono: t.telefono },
    })
    if (existing) {
      await prisma.trabajador.update({
        where: { id: existing.id },
        data: {
          nombre: t.nombre,
          rol: t.rol,
          usaMoto: t.usaMoto,
          capacidadKg: t.capacidadKg,
          tipoPago: t.tipoPago,
          activo: true,
        },
      })
    } else {
      await prisma.trabajador.create({
        data: {
          nombre: t.nombre,
          telefono: t.telefono,
          rol: t.rol,
          usaMoto: t.usaMoto,
          capacidadKg: t.capacidadKg,
          tipoPago: t.tipoPago,
          activo: true,
        },
      })
    }
  }
  console.log(`✅ ${TRABAJADORES.length} trabajadores seeded`)
}

/**
 * Link User↔Trabajador by userId.
 * Run AFTER both users and trabajadores exist.
 * Unlinks first to avoid stale references.
 */
async function linkUsersToTrabajadores() {
  for (const t of TRABAJADORES) {
    if (!t.linkToUsername) continue
    const user = await prisma.user.findUnique({ where: { username: t.linkToUsername } })
    const trab = await prisma.trabajador.findFirst({ where: { telefono: t.telefono } })
    if (!user || !trab) {
      console.warn(`  ⚠️  Could not link ${t.linkToUsername} ↔ ${t.nombre} (user or trabajador missing)`)
      continue
    }
    // First unlink anyone pointing to this userId
    await prisma.trabajador.updateMany({
      where: { userId: user.id },
      data: { userId: null },
    })
    // Also unlink anyone pointing to this trabajador's id
    await prisma.trabajador.updateMany({
      where: { id: trab.id, NOT: { userId: null } },
      data: { userId: null },
    })
    // Now link
    await prisma.trabajador.update({
      where: { id: trab.id },
      data: { userId: user.id },
    })
  }
  const linked = await prisma.trabajador.count({ where: { userId: { not: null } } })
  console.log(`✅ ${linked} user↔trabajador links created`)
}

async function seedConfigs() {
  for (const cfg of CONFIGS) {
    await prisma.config.upsert({
      where: { clave: cfg.clave },
      update: { valor: cfg.valor },
      create: { clave: cfg.clave, valor: cfg.valor },
    })
  }
  console.log(`✅ ${CONFIGS.length} configs seeded`)
}

/**
 * SYSTEM user: usuario técnico usado por crons y procesos automatizados
 * como creador de Casos y demás registros que requieren un `creadoPorId`.
 *
 * - No tiene credenciales de login (password es un hash de un string
 *   claramente no usable).
 * - Rol: ADMIN para tener permisos totales a nivel de queries internas.
 * - Inactivo: false (existe y puede ser FK), pero nadie puede hacer login
 *   porque la pantalla de login rechaza usuarios sin password conocido.
 * - Idempotente: usa upsert por username.
 */
async function seedSystemUser() {
  const SYSTEM_PASSWORD = 'SYSTEM_NEVER_LOGIN_' + Date.now()
  const hashed = await hashPassword(SYSTEM_PASSWORD)

  const existing = await prisma.user.findUnique({ where: { username: 'system@bambu.local' } })
  if (existing) {
    // No actualizar password en re-runs (mantener el hash original).
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        nombre: 'Sistema',
        apellido: '',
        rol: RolUsuario.ADMIN,
        activo: true,
      },
    })
  } else {
    await prisma.user.create({
      data: {
        username: 'system@bambu.local',
        password: hashed,
        rol: RolUsuario.ADMIN,
        nombre: 'Sistema',
        apellido: '',
        activo: true,
        mustChangePassword: false,
      },
    })
  }
  console.log(`✅ SYSTEM user seeded (idempotent)`)
}

async function seedProductos() {
  for (const p of PRODUCTOS) {
    const precioBase = PRECIO_BASE[p.codigo] ?? 0
    await prisma.producto.upsert({
      where: { codigo: p.codigo },
      update: {
        nombre: p.nombre,
        unidad: p.unidad,
        contenido: p.contenido,
        aplicaDomicilio: p.aplicaDomicilio,
        sobreCostoDomicilio: p.sobreCostoDomicilio,
        precioBase,
        activo: true,
      },
      create: {
        codigo: p.codigo,
        nombre: p.nombre,
        unidad: p.unidad,
        contenido: p.contenido,
        aplicaDomicilio: p.aplicaDomicilio,
        sobreCostoDomicilio: p.sobreCostoDomicilio,
        precioBase,
        activo: true,
      },
    })
  }
  console.log(`✅ ${PRODUCTOS.length} productos seeded`)
}

async function seedPreciosVolumen() {
  for (const pv of PRECIOS_VOLUMEN) {
    const producto = await prisma.producto.findUnique({ where: { codigo: pv.codigo } })
    if (!producto) continue
    await prisma.precioVolumen.upsert({
      where: { productoId_cantMin: { productoId: producto.id, cantMin: pv.cantMin } },
      update: { precio: pv.precio, cantMax: pv.cantMax },
      create: {
        productoId: producto.id,
        cantMin: pv.cantMin,
        cantMax: pv.cantMax,
        precio: pv.precio,
      },
    })
  }
  console.log(`✅ ${PRECIOS_VOLUMEN.length} precios por volumen seeded`)
}

async function seedPrecioHistorial() {
  const existing = await prisma.precioHistorial.count()
  if (existing > 0) {
    console.log(`⏭️  PrecioHistorial already has ${existing} rows, skipping`)
    return
  }
  await prisma.precioHistorial.createMany({
    data: PRODUCTOS.map(p => ({
      producto: p.codigo,
      precio: PRECIO_BASE[p.codigo] ?? 0,
      creadoPor: 'admin',
    })),
  })
  console.log(`✅ ${PRODUCTOS.length} precio historial entries seeded`)
}

async function main() {
  console.log('🌱 Seeding database...')

  // Order matters: users + trabajadores in parallel-safe batches, then link.
  await seedUsers()
  await seedSystemUser()
  await seedTrabajadores()
  await linkUsersToTrabajadores()
  await seedConfigs()
  await seedProductos()
  await seedPreciosVolumen()
  await seedPrecioHistorial()

  // Summary
  const counts = {
    users: await prisma.user.count(),
    trabajadores: await prisma.trabajador.count(),
    trabajadoresConUser: await prisma.trabajador.count({ where: { userId: { not: null } } }),
    configs: await prisma.config.count(),
    productos: await prisma.producto.count(),
    preciosVolumen: await prisma.precioVolumen.count(),
  }
  console.log('📊 Summary:', counts)
  console.log('🎉 Seed complete!')
  console.log('   Login: admin/admin123, asistente/asist123, sellador/sell123, repartidor/rep123, contador/cont123')
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
