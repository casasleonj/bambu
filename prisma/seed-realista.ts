import { PrismaClient, RolUsuario, EstadoPedido, EstadoEmbarque, EstadoFactura, TipoPagoTrabajador, Turno, MetodoPago } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const SALT_ROUNDS = 12

// ─── Datos reales colombianos ────────────────────────────────────────────────

const NOMBRES_H = ['Carlos', 'Juan', 'Andrés', 'Diego', 'Luis', 'Miguel', 'José', 'Pedro', 'Jorge', 'Fernando', 'Ricardo', 'Alejandro', 'Santiago', 'Camilo', 'Felipe', 'Oscar', 'Manuel', 'Gabriel', 'Rafael', 'Daniel', 'William', 'Jhon', 'Mario', 'Héctor', 'Gustavo', 'Edwin', 'Fabio', 'Iván', 'César', 'Roberto']
const NOMBRES_M = ['María', 'Ana', 'Carmen', 'Luz', 'Sandra', 'Patricia', 'Gloria', 'Nancy', 'Rosa', 'Diana', 'Claudia', 'Paola', 'Liliana', 'Adriana', 'Mónica', 'Juliana', 'Valentina', 'Carolina', 'Laura', 'Daniela', 'Andrea', 'Isabella', 'Sofía', 'Gabriela', 'Fernanda', 'Alejandra', 'Natalia', 'Lorena', 'Yolanda', 'Teresa']
const APELLIDOS = ['Rodríguez', 'García', 'Martínez', 'López', 'González', 'Hernández', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Díaz', 'Morales', 'Castro', 'Vargas', 'Ruiz', 'Moreno', 'Jiménez', 'Reyes', 'Cruz', 'Ortiz', 'Rojas', 'Mendoza', 'Castillo', 'Medina', 'Vargas', 'Guerrero', 'Ríos', 'Salazar', 'Aguilar', 'Delgado', 'Vega', 'Figueroa', 'Herrera', 'Campos', 'Núñez', 'Paredes', 'Valencia', 'Acosta', 'Bernal', 'Duque', 'Espinosa', 'Franco', 'Giraldo', 'Henao', 'Ibarra', 'Jaramillo', 'Londoño', 'Marín', 'Montoya', 'Ochoa', 'Palacio', 'Quintero', 'Restrepo', 'Salinas', 'Toro', 'Uribe', 'Vallejo', 'Zapata', 'Aristizábal', 'Cárdenas']
const BARRIOS = ['Centro', 'La Candelaria', 'San Victorino', 'Santa Fe', 'Los Mártires', 'Antonio Nariño', 'Puente Aranda', 'Kennedy', 'Tunjuelito', 'Bosa', 'Ciudad Bolívar', 'Usme', 'Rafael Uribe', 'San Cristóbal', 'Usaquén', 'Chapinero', 'Teusaquillo', 'Barrios Unidos', 'Engativá', 'Suba', 'Fontibón', 'Fontibón Centro', 'Modelia', 'Normandía', 'Hayuelos', 'Galán', 'Castilla', 'Amarillo', 'El Poblado', 'Laureles', 'Belén', 'Aranjuez', 'Manrique', 'Popular', 'Doce de Octubre', 'Robledo', 'Santa Cruz', 'Villa Hermosa', 'Miraflores', 'El Pedregal', 'La Sierra', 'El Progreso', 'San José', 'El Refugio', 'La Pradera', 'Los Almendros', 'El Bosque', 'La Estrella', 'Sabaneta', 'Envigado', 'Itagüí', 'Caldas', 'Bello', 'Copacabana', 'Barbosa', 'Girardota', 'Donmatías', 'San Pedro', 'Carmen de Viboral', 'La Ceja', 'Rionegro', 'Marinela', 'El Retiro', 'La Unión', 'Cocorná', 'Guarne', 'Santo Domingo', 'Pedro Regalo', 'El Salado', 'La Mota', 'San Antonio', 'El Centro', 'La Playa', 'El Empalme', 'El Triunfo', 'La Victoria', 'San Isidro', 'El Porvenir', 'La Esperanza', 'El Progreso']
const DIRECCIONES = ['Calle', 'Carrera', 'Av.', 'Transversal', 'Diagonal']
const TIPOS_NEGOCIO = ['Tienda', 'Restaurante', 'Café', 'Hotel', 'Bar', 'Panadería', 'Farmacia', 'Peluquería', 'Frutería', 'Carnicería', 'Lavandería', 'Taller']
const CATEGORIAS_GASTO = ['Combustible', 'Mantenimiento moto', 'Mantenimiento planta', 'Insumos limpieza', 'Gas', 'Electricidad', 'Agua', 'Teléfono/Internet', 'Papelería', 'Viáticos', 'Almuerzo personal', 'Peajes', 'Parqueaderos', 'Repuestos', 'Uniformes', 'Herramientas', 'Bolsas plásticas', 'Tapas', 'Etiquetas', 'Cloro']
const OBS_PEDIDOS = ['', '', '', '', '', '', '', '', '', 'Entregar antes de las 9am', 'Llamar al llegar', 'No hay timbre, tocar puerta', 'Dejar en portería', 'Cuidado con el perro', 'Subir al 3er piso', 'Casa esquina', 'Portón verde', 'Al lado de la tienda', 'Detrás de la iglesia', 'Frente al parque']

const PRODUCTOS = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO'] as const

const PRECIOS_PUNTO: Record<string, number> = { PACA_AGUA: 3000, PACA_HIELO: 2500, BOTELLON: 7500, BOLSA_AGUA: 300, BOLSA_HIELO: 500 }
const PRECIOS_DOMICILIO: Record<string, number> = { PACA_AGUA: 3000, PACA_HIELO: 2500, BOTELLON: 10000, BOLSA_AGUA: 300, BOLSA_HIELO: 500 }

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min }
function randFloat(min: number, max: number, decimals = 2): number { return parseFloat((Math.random() * (max - min) + min).toFixed(decimals)) }
function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a }
function pickWeighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

function generateClienteNombre(): { nombre: string; apellido: string } {
  const esH = Math.random() > 0.5
  const nombre = esH ? rand(NOMBRES_H) : rand(NOMBRES_M)
  const apellido1 = rand(APELLIDOS)
  const apellido2 = rand(APELLIDOS)
  return { nombre, apellido: `${apellido1} ${apellido2}` }
}

function generateTelefono(): string {
  const prefixes = ['300', '301', '302', '303', '304', '305', '310', '311', '312', '313', '314', '315', '316', '317', '318', '319', '320', '321', '322', '323', '324']
  return `${rand(prefixes)}${randInt(1000000, 9999999)}`
}

function generateDireccion(): string {
  const tipo = rand(DIRECCIONES)
  const numero = randInt(1, 150)
  const sufijo = randInt(1, 99)
  return `${tipo} ${numero} # ${sufijo}-${randInt(1, 99)}`
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ seed-realista.ts: NO ejecutar en producción (borra toda la base de datos)')
    process.exit(1)
  }

  console.log('🌱 Seeding realistic data (1 week, ~250 pedidos/day)...')

  // Limpiar BDD
  console.log('🧹 Cleaning database...')
  await prisma.historial.deleteMany()
  await prisma.precioHistorial.deleteMany()
  await prisma.cierreDia.deleteMany()
  await prisma.nomina.deleteMany()
  await prisma.abono.deleteMany()
  await prisma.factura.deleteMany()
  await prisma.pago.deleteMany()
  await prisma.pedido.deleteMany()
  await prisma.embarque.deleteMany()
  await prisma.produccion.deleteMany()
  await prisma.gasto.deleteMany()
  await prisma.compraInsumo.deleteMany()
  await prisma.insumo.deleteMany()
  await prisma.proveedor.deleteMany()
  await prisma.cliente.deleteMany()
  await prisma.ruta.deleteMany()
  await prisma.trabajador.deleteMany()
  await prisma.user.deleteMany()
  await prisma.config.deleteMany()
  await prisma.precioVolumen.deleteMany()
  await prisma.producto.deleteMany()
  console.log('✅ Database cleaned')

  // ─── Users ───────────────────────────────────────────────────────────────
  const isProd = (process.env.NODE_ENV as string) === 'production'

  function getPassword(username: string): string {
    if (isProd) return crypto.randomUUID()
    const devPasswords: Record<string, string> = {
      admin: 'admin123',
      asistente1: 'asist123',
      asistente2: 'asist123',
      contador: 'cont123',
      auxiliar: 'aux123',
    }
    return devPasswords[username] || crypto.randomUUID()
  }

  const usersData = [
    { username: 'admin', password: getPassword('admin'), rol: RolUsuario.ADMIN },
    { username: 'asistente1', password: getPassword('asistente1'), rol: RolUsuario.ASISTENTE },
    { username: 'asistente2', password: getPassword('asistente2'), rol: RolUsuario.ASISTENTE },
    { username: 'contador', password: getPassword('contador'), rol: RolUsuario.CONTADOR },
    { username: 'auxiliar', password: getPassword('auxiliar'), rol: RolUsuario.ASISTENTE },
  ]

  const users = []
  for (const u of usersData) {
    const hashed = await bcrypt.hash(u.password, SALT_ROUNDS)
    const user = await prisma.user.create({ data: { ...u, password: hashed } })
    users.push(user)
  }
  console.log(`✅ ${users.length} users created`)

  // ─── Config ──────────────────────────────────────────────────────────────
  await prisma.config.create({ data: { clave: 'BASE_DIA', valor: '100000' } })
  console.log('✅ Config created')

  // ─── Products + Volume Prices ────────────────────────────────────────────
  const PRECIO_BASE: Record<string, number> = {
    PACA_AGUA: 6500,
    PACA_HIELO: 8000,
    BOTELLON: 7500,
    BOLSA_AGUA: 2500,
    BOLSA_HIELO: 3000,
  }

  const productosData = [
    { codigo: 'PACA_AGUA', nombre: 'Paca de Agua (40u 300ml)', unidad: 'paca', contenido: '40 bolsas x 300ml', aplicaDomicilio: true, sobreCostoDomicilio: 0, precioBase: PRECIO_BASE['PACA_AGUA'] },
    { codigo: 'PACA_HIELO', nombre: 'Paca de Hielo (20u 600ml)', unidad: 'paca', contenido: '20 bolsas x 600ml', aplicaDomicilio: true, sobreCostoDomicilio: 0, precioBase: PRECIO_BASE['PACA_HIELO'] },
    { codigo: 'BOTELLON', nombre: 'Botellón 20LT', unidad: 'unidad', contenido: '20 litros', aplicaDomicilio: true, sobreCostoDomicilio: 2500, precioBase: PRECIO_BASE['BOTELLON'] },
    { codigo: 'BOLSA_AGUA', nombre: 'Bolsa de Agua 300ml', unidad: 'unidad', contenido: '300ml', aplicaDomicilio: true, sobreCostoDomicilio: 0, precioBase: PRECIO_BASE['BOLSA_AGUA'] },
    { codigo: 'BOLSA_HIELO', nombre: 'Bolsa de Hielo 600ml', unidad: 'unidad', contenido: '600ml', aplicaDomicilio: true, sobreCostoDomicilio: 0, precioBase: PRECIO_BASE['BOLSA_HIELO'] },
  ]

  const productos: Record<string, any> = {}
  for (const prod of productosData) {
    const p = await prisma.producto.create({ data: prod })
    productos[prod.codigo] = p
  }

  const preciosVolumen = [
    { codigo: 'PACA_AGUA', cantMin: 1, cantMax: 4, precio: 2800 },
    { codigo: 'PACA_AGUA', cantMin: 5, cantMax: 9, precio: 2500 },
    { codigo: 'PACA_AGUA', cantMin: 10, cantMax: null, precio: 2300 },
    { codigo: 'PACA_HIELO', cantMin: 1, cantMax: null, precio: 2500 },
    { codigo: 'BOTELLON', cantMin: 1, cantMax: null, precio: 7500 },
    { codigo: 'BOLSA_AGUA', cantMin: 1, cantMax: null, precio: 300 },
    { codigo: 'BOLSA_HIELO', cantMin: 1, cantMax: null, precio: 500 },
  ]

  for (const p of preciosVolumen) {
    await prisma.precioVolumen.create({
      data: { productoId: productos[p.codigo].id, cantMin: p.cantMin, cantMax: p.cantMax, precio: p.precio },
    })
  }
  console.log('✅ Products and volume prices created')

  // ─── Precio Historial ────────────────────────────────────────────────────
  await prisma.precioHistorial.createMany({
    data: [
      { producto: 'AGUA_GALON', precio: 6500, creadoPor: 'admin' },
      { producto: 'HIELO_5KG', precio: 8000, creadoPor: 'admin' },
      { producto: 'BOTELLON', precio: 7500, creadoPor: 'admin' },
      { producto: 'BOLSA_AGUA', precio: 2500, creadoPor: 'admin' },
      { producto: 'BOLSA_HIELO', precio: 3000, creadoPor: 'admin' },
    ],
  })
  console.log('✅ Price history created')

  // ─── Rutas ───────────────────────────────────────────────────────────────
  const rutasData = [
    { nombre: 'Norte', dias: 'LUN,MIE,VIE', horarioInicio: '06:00', horarioFin: '14:00' },
    { nombre: 'Centro', dias: 'MAR,JUE,SAB', horarioInicio: '07:00', horarioFin: '13:00' },
    { nombre: 'Sur', dias: 'LUN,MIE,VIE', horarioInicio: '06:30', horarioFin: '14:30' },
    { nombre: 'Oriente', dias: 'MAR,JUE,SAB', horarioInicio: '07:00', horarioFin: '15:00' },
    { nombre: 'Occidente', dias: 'LUN,MIE,VIE,SAB', horarioInicio: '05:30', horarioFin: '13:30' },
  ]

  const rutas = []
  for (const r of rutasData) {
    const ruta = await prisma.ruta.create({ data: { ...r } })
    rutas.push(ruta)
  }
  console.log(`✅ ${rutas.length} rutas created`)

  // ─── Trabajadores ────────────────────────────────────────────────────────
  const trabajadoresData = [
    // Repartidores (8)
    { nombre: 'Carlos Rodríguez', rol: 'REPARTIDOR', tipoPago: TipoPagoTrabajador.COMISION, usaMoto: true },
    { nombre: 'Juan García', rol: 'REPARTIDOR', tipoPago: TipoPagoTrabajador.COMISION, usaMoto: true },
    { nombre: 'Andrés Martínez', rol: 'REPARTIDOR', tipoPago: TipoPagoTrabajador.MIXTO, usaMoto: true },
    { nombre: 'Diego López', rol: 'REPARTIDOR', tipoPago: TipoPagoTrabajador.COMISION, usaMoto: true },
    { nombre: 'Luis González', rol: 'REPARTIDOR', tipoPago: TipoPagoTrabajador.FIJO, usaMoto: false },
    { nombre: 'Miguel Hernández', rol: 'REPARTIDOR', tipoPago: TipoPagoTrabajador.COMISION, usaMoto: true },
    { nombre: 'Pedro Pérez', rol: 'REPARTIDOR', tipoPago: TipoPagoTrabajador.COMISION, usaMoto: true },
    { nombre: 'Jorge Sánchez', rol: 'REPARTIDOR', tipoPago: TipoPagoTrabajador.MIXTO, usaMoto: true },
    // Selladores (5)
    { nombre: 'María Ramírez', rol: 'SELLADOR', tipoPago: TipoPagoTrabajador.FIJO },
    { nombre: 'Ana Torres', rol: 'SELLADOR', tipoPago: TipoPagoTrabajador.FIJO },
    { nombre: 'Carmen Díaz', rol: 'SELLADOR', tipoPago: TipoPagoTrabajador.FIJO },
    { nombre: 'Luz Morales', rol: 'SELLADOR', tipoPago: TipoPagoTrabajador.FIJO },
    { nombre: 'Sandra Castro', rol: 'SELLADOR', tipoPago: TipoPagoTrabajador.FIJO },
    // Admin planta (2)
    { nombre: 'Patricia Vargas', rol: 'ADMIN', tipoPago: TipoPagoTrabajador.FIJO },
    { nombre: 'Gloria Ruiz', rol: 'ADMIN', tipoPago: TipoPagoTrabajador.FIJO },
  ]

  const trabajadores = []
  for (const t of trabajadoresData) {
    const trabajador = await prisma.trabajador.create({
      data: {
        ...t,
        telefono: generateTelefono(),
        comPacaAgua: 200,
        comPacaHielo: 200,
        comBotellon: 200,
        salarioFijo: t.tipoPago === TipoPagoTrabajador.FIJO ? 1200000 : t.tipoPago === TipoPagoTrabajador.MIXTO ? 600000 : 0,
        createdById: users[0].id,
      },
    })
    trabajadores.push(trabajador)
  }

  // Asignar repartidores a rutas
  const repartidores = trabajadores.filter(t => t.rol === 'REPARTIDOR')
  for (let i = 0; i < rutas.length; i++) {
    await prisma.ruta.update({
      where: { id: rutas[i].id },
      data: {
        repartidorId: repartidores[i % repartidores.length].id,
        repartidorRespaldoId: repartidores[(i + 1) % repartidores.length].id,
      },
    })
  }
  console.log(`✅ ${trabajadores.length} trabajadores created`)

  // ─── Clientes ────────────────────────────────────────────────────────────
  console.log('👥 Creating 80 clientes...')
  const clientes = []
  const frecuencias = ['NINGUNA', 'DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL']
  const freqWeights = [40, 15, 25, 10, 10]

  for (let i = 0; i < 80; i++) {
    const { nombre, apellido } = generateClienteNombre()
    const barrio = rand(BARRIOS)
    const ruta = rand(rutas)
    const freq = pickWeighted(frecuencias, freqWeights)
    const tieneNegocio = Math.random() > 0.4

    const cliente = await prisma.cliente.create({
      data: {
        nombre,
        apellido,
        telefono: generateTelefono(),
        direccion: generateDireccion(),
        barrio,
        referencia: Math.random() > 0.7 ? rand(OBS_PEDIDOS.filter(o => o !== '')) : null,
        linkUbicacion: Math.random() > 0.8 ? `https://maps.google.com/?q=${randFloat(4.5, 4.8, 6)},${randFloat(-74.2, -73.9, 6)}` : null,
        nombreNegocio: tieneNegocio ? `${rand(['Don', 'Doña'])} ${nombre.split(' ')[0]}` : null,
        tipoNegocio: tieneNegocio ? rand(TIPOS_NEGOCIO) : null,
        horaApertura: tieneNegocio ? `${randInt(6, 9).toString().padStart(2, '0')}:${rand([0, 30]).toString().padStart(2, '0')}` : null,
        rutaId: ruta.id,
        frecuencia: freq,
        cadaNDias: freq === 'DIARIA' ? 1 : freq === 'SEMANAL' ? 7 : freq === 'QUINCENAL' ? 15 : freq === 'MENSUAL' ? 30 : null,
        habAgua: Math.random() > 0.1,
        habHielo: Math.random() > 0.2,
        habBotellon: Math.random() > 0.3,
        habBolsaAgua: Math.random() > 0.5,
        habBolsaHielo: Math.random() > 0.5,
        notas: Math.random() > 0.8 ? rand(OBS_PEDIDOS.filter(o => o !== '')) : null,
        activo: Math.random() > 0.05,
        createdById: rand(users).id,
      },
    })
    clientes.push(cliente)
  }

  // Cliente mostrador
  const clienteMostrador = await prisma.cliente.create({
    data: {
      id: 'CLIENTE_MOSTRADOR',
      nombre: 'Mostrador',
      telefono: '0000000000',
      direccion: 'Punto de venta',
      barrio: 'N/A',
    },
  })
  clientes.push(clienteMostrador)
  console.log(`✅ ${clientes.length} clientes created`)

  // ─── Proveedores ─────────────────────────────────────────────────────────
  const proveedoresData = [
    { nombre: 'Plásticos del Valle SA', telefono: '3105551234', email: 'ventas@plastivalle.com', direccion: 'Zona Industrial Bosa' },
    { nombre: 'Hielo Express', telefono: '3205555678', email: 'pedidos@hieloexpress.co', direccion: 'Av. Calle 80 #45-12' },
    { nombre: 'AquaPure Colombia', telefono: '3115559012', email: 'info@aquapure.com.co', direccion: 'Carrera 7 #32-16' },
    { nombre: 'Distribuciones Andinas', telefono: '3155553456', direccion: 'Calle 26 #68B-45' },
    { nombre: 'Empaques Bogotá', telefono: '3185557890', email: 'ventas@empaquesbogota.com', direccion: 'Av. Boyacá #15-23' },
    { nombre: 'Químicos Industrial SAS', telefono: '3005551122', direccion: 'Parque Industrial Montevideo' },
    { nombre: 'Tapas y Corchos Ltda', telefono: '3125553344', email: 'info@tapascorchos.co', direccion: 'Calle 13 #100-55' },
    { nombre: 'Gas Natural del Sur', telefono: '3215555566', direccion: 'Av. Caracas #50-10' },
    { nombre: 'ElectroServicios', telefono: '3145557788', email: 'soporte@electroservicios.co', direccion: 'Transversal 86 #30-15' },
    { nombre: 'Transporte Rápido', telefono: '3165559900', direccion: 'Autopista Norte #170-30' },
  ]

  const proveedores = []
  for (const prov of proveedoresData) {
    const p = await prisma.proveedor.create({ data: { ...prov, createdById: users[0].id } })
    proveedores.push(p)
  }
  console.log(`✅ ${proveedores.length} proveedores created`)

  // ─── Insumos ─────────────────────────────────────────────────────────────
  const insumosData = [
    { nombre: 'Cloro líquido', unidad: 'litro', stock: 50, stockMin: 10, precioUnit: 3500 },
    { nombre: 'Tapas rosca 300ml', unidad: 'unidad', stock: 5000, stockMin: 500, precioUnit: 50 },
    { nombre: 'Tapas rosca 600ml', unidad: 'unidad', stock: 3000, stockMin: 300, precioUnit: 60 },
    { nombre: 'Bolsa 300ml sin imprimir', unidad: 'unidad', stock: 20000, stockMin: 2000, precioUnit: 35 },
    { nombre: 'Bolsa 600ml sin imprimir', unidad: 'unidad', stock: 10000, stockMin: 1000, precioUnit: 45 },
    { nombre: 'Etiquetas adhesivas', unidad: 'rollo', stock: 20, stockMin: 3, precioUnit: 15000 },
    { nombre: 'Pacas cartón agua', unidad: 'unidad', stock: 100, stockMin: 20, precioUnit: 800 },
    { nombre: 'Pacas cartón hielo', unidad: 'unidad', stock: 80, stockMin: 15, precioUnit: 900 },
    { nombre: 'Gas propano', unidad: 'galon', stock: 30, stockMin: 5, precioUnit: 25000 },
    { nombre: 'Filtro de agua 5 micras', unidad: 'unidad', stock: 10, stockMin: 2, precioUnit: 45000 },
    { nombre: 'Filtro de carbón activado', unidad: 'unidad', stock: 8, stockMin: 2, precioUnit: 65000 },
    { nombre: 'Membrana de ósmosis', unidad: 'unidad', stock: 4, stockMin: 1, precioUnit: 180000 },
    { nombre: 'Aceite para moto', unidad: 'litro', stock: 12, stockMin: 3, precioUnit: 18000 },
    { nombre: 'Guantes de nitrilo', unidad: 'caja', stock: 15, stockMin: 3, precioUnit: 22000 },
    { nombre: 'Mascarillas N95', unidad: 'caja', stock: 10, stockMin: 2, precioUnit: 35000 },
    { nombre: 'Detergente industrial', unidad: 'litro', stock: 25, stockMin: 5, precioUnit: 8500 },
    { nombre: 'Agua purificada (materia prima)', unidad: 'galon', stock: 500, stockMin: 100, precioUnit: 200 },
    { nombre: 'Hielo en escamas', unidad: 'kg', stock: 200, stockMin: 50, precioUnit: 150 },
    { nombre: 'Botellón 20LT vacío', unidad: 'unidad', stock: 150, stockMin: 30, precioUnit: 12000 },
    { nombre: 'Cinta de embalaje', unidad: 'rollo', stock: 20, stockMin: 5, precioUnit: 5000 },
  ]

  const insumos = []
  for (const ins of insumosData) {
    const i = await prisma.insumo.create({
      data: { ...ins, proveedorId: rand(proveedores).id, createdById: users[0].id },
    })
    insumos.push(i)
  }
  console.log(`✅ ${insumos.length} insumos created`)

  // ─── Compras de insumos ──────────────────────────────────────────────────
  console.log('📦 Creating compras...')
  const hoy = new Date()
  const diasAtras = (n: number) => {
    const d = new Date(hoy)
    d.setDate(d.getDate() - n)
    d.setHours(randInt(8, 17), randInt(0, 59), 0, 0)
    return d
  }

  for (let i = 0; i < 30; i++) {
    const insumo = rand(insumos)
    const cantidad = randInt(5, 100)
    await prisma.compraInsumo.create({
      data: {
        numero: `COMP-${(i + 1).toString().padStart(5, '0')}`,
        proveedorId: insumo.proveedorId || proveedores[0].id,
        insumoId: insumo.id,
        cantidad,
        montoTotal: Number(insumo.precioUnit) * cantidad,
        fecha: diasAtras(randInt(0, 6)),
        createdById: rand(users).id,
      },
    })
  }
  console.log('✅ 30 compras created')

  // ─── Gastos ──────────────────────────────────────────────────────────────
  console.log('💸 Creating gastos...')
  for (let i = 0; i < 50; i++) {
    await prisma.gasto.create({
      data: {
        fecha: diasAtras(randInt(0, 6)),
        categoria: rand(CATEGORIAS_GASTO),
        descripcion: `${rand(CATEGORIAS_GASTO)} - ${rand(['Pago semanal', 'Mantenimiento preventivo', 'Compra urgente', 'Reposición', 'Gasto operativo', 'Servicio mensual'])}`,
        monto: randFloat(5000, 250000, 0),
        responsable: rand(trabajadores).nombre,
        notas: Math.random() > 0.7 ? rand(OBS_PEDIDOS.filter(o => o !== '')) : null,
        createdById: rand(users).id,
      },
    })
  }
  console.log('✅ 50 gastos created')

  // ─── Producción (3 turnos × 7 días) ──────────────────────────────────────
  console.log('🏭 Creating producción...')
  const turnos = [Turno.MANANA, Turno.TARDE, Turno.NOCHE]
  const selladores = trabajadores.filter(t => t.rol === 'SELLADOR')

  for (let day = 0; day < 7; day++) {
    for (const turno of turnos) {
      const fecha = diasAtras(6 - day)
      fecha.setHours(turno === Turno.MANANA ? 6 : turno === Turno.TARDE ? 14 : 22, 0, 0, 0)

      const stockIniAgua = randInt(200, 500)
      const stockIniHielo = randInt(100, 300)
      const prodAgua = randInt(100, 400)
      const prodHielo = randInt(50, 250)
      const ventasAgua = randInt(80, 350)
      const ventasHielo = randInt(40, 200)
      const stockFinAgua = stockIniAgua + prodAgua - ventasAgua
      const stockFinHielo = stockIniHielo + prodHielo - ventasHielo

      await prisma.produccion.create({
        data: {
          fecha,
          turno,
          trabajadorId: rand(selladores).id,
          obs: Math.random() > 0.8 ? 'Turno normal' : null,
          createdById: rand(users).id,
          items: {
            create: [
              {
                producto: 'PACA_AGUA',
                stockIni: stockIniAgua,
                conteoA: randInt(50, 200),
                conteoB: randInt(20, 80),
                producido: prodAgua,
                stockFinFisico: stockFinAgua,
                comSellador: prodAgua * 50,
              },
              {
                producto: 'PACA_HIELO',
                stockIni: stockIniHielo,
                conteoA: randInt(30, 120),
                conteoB: randInt(10, 50),
                producido: prodHielo,
                stockFinFisico: stockFinHielo,
                comSellador: prodHielo * 50,
              },
            ],
          },
        },
      })
    }
  }
  console.log('✅ 21 producciones created (3 turnos × 7 días)')

  // ─── Embarques ───────────────────────────────────────────────────────────
  console.log('🚚 Creating embarques...')
  const embarques: any[] = []
  const repartidoresEmbarque = repartidores.slice(0, 5)

  for (let day = 0; day < 7; day++) {
    const fecha = diasAtras(6 - day)
    fecha.setHours(6, 0, 0, 0)

    // 1 embarque por ruta activa ese día (aprox 3-5 por día)
    const rutasActivas = rutas.filter((_, i) => {
      const dias = rutasData[i].dias.split(',')
      const diasSemana = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB']
      return dias.includes(diasSemana[fecha.getDay()])
    })

    for (const ruta of rutasActivas) {
      const repartidor = repartidoresEmbarque.find(r => r.id === ruta.repartidorId) || rand(repartidoresEmbarque)
      const horaSalida = new Date(fecha)
      horaSalida.setHours(randInt(5, 7), randInt(0, 30), 0, 0)

      const horaLlegada = new Date(fecha)
      horaLlegada.setHours(randInt(12, 16), randInt(0, 59), 0, 0)

      const estado = day < 6 ? rand([EstadoEmbarque.CERRADO, EstadoEmbarque.CERRADO, EstadoEmbarque.CERRADO, EstadoEmbarque.CANCELADO]) : EstadoEmbarque.ABIERTO

      const embarque = await prisma.embarque.create({
        data: {
          fecha,
          trabajadorId: repartidor.id,
          rutaId: ruta.id,
          horaSalida,
          horaLlegada: estado === EstadoEmbarque.CERRADO ? horaLlegada : null,
          estado,
          obs: estado === EstadoEmbarque.CANCELADO ? 'Cancelado por lluvia' : null,
          createdById: users[0].id,
        },
      })
      embarques.push(embarque)
    }
  }
  console.log(`✅ ${embarques.length} embarques created`)

  // ─── Pedidos (~250/día × 7 días = ~1,750) ───────────────────────────────
  console.log('📋 Creating ~1,750 pedidos (250/day × 7 days)...')

  const metodosPago = [MetodoPago.EFECTIVO, MetodoPago.TRANSFERENCIA, MetodoPago.NEQUI, MetodoPago.DAVIPLATA, MetodoPago.BONO]
  const canales = ['PUNTO', 'DOMICILIO']
  const estadosPedido = [EstadoPedido.PENDIENTE, EstadoPedido.EN_RUTA, EstadoPedido.ENTREGADO, EstadoPedido.CANCELADO]

  let pedidoCount = 0
  let fiadoCount = 0
  let recurrenteCount = 0

  // Pick ~25 clients to be recurrent clients (one template per client max)
  const clientesRecurrentes = new Set(
    shuffle(clientes.filter(c => c.id !== 'CLIENTE_MOSTRADOR')).slice(0, 25).map(c => c.id)
  )
  const clientesConRecurrente = new Set<string>()

  for (let day = 0; day < 7; day++) {
    const fecha = diasAtras(6 - day)

    for (let p = 0; p < 250; p++) {
      const cliente = rand(clientes.filter(c => c.id !== 'CLIENTE_MOSTRADOR'))
      const canal = pickWeighted(canales, [35, 65])
      const precios = canal === 'PUNTO' ? PRECIOS_PUNTO : PRECIOS_DOMICILIO
      const esFiado = Math.random() < 0.15

      // Only first pedido of a recurrent client becomes the template
      const esRecurrente = clientesRecurrentes.has(cliente.id) && !clientesConRecurrente.has(cliente.id)
      if (esRecurrente) {
        clientesConRecurrente.add(cliente.id)
        recurrenteCount++
      }

      // Generar cantidades de productos
      const productosPedido: Record<string, number> = {}
      let total = 0

      for (const prod of PRODUCTOS) {
        const prob = prod === 'PACA_AGUA' ? 0.8 : prod === 'PACA_HIELO' ? 0.6 : prod === 'BOTELLON' ? 0.4 : 0.15
        if (Math.random() < prob) {
          const cant = prod.includes('BOLSA') ? randInt(5, 40) : randInt(1, 8)
          productosPedido[prod] = cant
          total += cant * precios[prod]
        }
      }

      // Asegurar que al menos tenga un producto
      if (Object.keys(productosPedido).length === 0) {
        productosPedido['PACA_AGUA'] = randInt(1, 5)
        total += productosPedido['PACA_AGUA'] * precios['PACA_AGUA']
      }

      // Estado del pedido
      let estado: EstadoPedido
      if (day === 6) {
        // Hoy: la mayoría pendientes o en ruta
        estado = pickWeighted([EstadoPedido.PENDIENTE, EstadoPedido.EN_RUTA, EstadoPedido.ENTREGADO], [40, 30, 25])
      } else if (day < 3) {
        // Días antiguos: la mayoría entregados
        estado = pickWeighted(estadosPedido, [2, 5, 85, 8])
      } else {
        // Días intermedios
        estado = pickWeighted(estadosPedido, [5, 15, 70, 10])
      }

      // Calcular pagos
      let pagosData: { metodo: MetodoPago; monto: number }[] = []
      let totalPagado = 0
      let saldo = 0

      if (estado === EstadoPedido.CANCELADO) {
        // Cancelados: no tienen pagos ni deuda
        totalPagado = 0
        saldo = 0
        total = 0
      } else if (esFiado) {
        // Fiado: paga parcial o nada
        const pagaParcial = Math.random() > 0.4
        if (pagaParcial) {
          const porcentaje = randFloat(0.2, 0.8, 2)
          const monto = Math.round(total * porcentaje)
          const metodo = rand([MetodoPago.EFECTIVO, MetodoPago.NEQUI])
          pagosData.push({ metodo, monto })
          totalPagado = monto
        }
        fiadoCount++
      } else {
        // Pago completo
        const metodo = pickWeighted(metodosPago, [50, 15, 20, 10, 5])
        pagosData.push({ metodo, monto: total })
        totalPagado = total
      }

      // Pago mixto (10% de los que pagan completo)
      if (!esFiado && estado !== EstadoPedido.CANCELADO && Math.random() < 0.1 && pagosData.length > 0) {
        const metodo2 = rand(metodosPago.filter(m => m !== pagosData[0].metodo))
        const split = Math.round(total * randFloat(0.3, 0.7, 2))
        pagosData = [
          { metodo: pagosData[0].metodo, monto: split },
          { metodo: metodo2, monto: total - split },
        ]
        totalPagado = total
      }

      saldo = total - totalPagado

      // Asignar a embarque si es domicilio y hay embarque abierto para esa ruta
      let embarqueId: string | null = null
      if (canal === 'DOMICILIO' && estado !== EstadoPedido.CANCELADO && cliente.rutaId) {
        const embarqueDia = embarques.find(e =>
          e.rutaId === cliente.rutaId &&
          e.fecha.toISOString().split('T')[0] === fecha.toISOString().split('T')[0] &&
          e.estado !== EstadoEmbarque.CANCELADO
        )
        if (embarqueDia) embarqueId = embarqueDia.id
      }

      // Entregados: cantidad entregada = cantidad pedida (o menos si hay devolución)
      const cPacaAguaPed = productosPedido['PACA_AGUA'] || 0
      const cPacaHieloPed = productosPedido['PACA_HIELO'] || 0
      const cBotellonPed = productosPedido['BOTELLON'] || 0
      const cBolsaAguaPed = productosPedido['BOLSA_AGUA'] || 0
      const cBolsaHieloPed = productosPedido['BOLSA_HIELO'] || 0

      // Legacy mapping: BOTELLON se divide según canal para compatibilidad
      const cBotellonFabPed = canal === 'PUNTO' ? cBotellonPed : 0
      const cBotellonDomPed = canal === 'DOMICILIO' ? cBotellonPed : 0

      let cPacaAguaEnt = cPacaAguaPed
      let cPacaHieloEnt = cPacaHieloPed
      let cBotellonFabEnt = cBotellonFabPed
      let cBotellonDomEnt = cBotellonDomPed
      let cBolsaAguaEnt = cBolsaAguaPed
      let cBolsaHieloEnt = cBolsaHieloPed

      if (estado === EstadoPedido.ENTREGADO && Math.random() < 0.05) {
        // 5% de devoluciones parciales
        if (cPacaAguaEnt > 0) cPacaAguaEnt = Math.max(0, cPacaAguaEnt - randInt(0, 1))
        if (cPacaHieloEnt > 0) cPacaHieloEnt = Math.max(0, cPacaHieloEnt - randInt(0, 1))
      }

      const fechaEntrega = estado === EstadoPedido.ENTREGADO ? new Date(fecha.getTime() + randInt(1, 8) * 3600000) : null

      const pedido = await prisma.pedido.create({
        data: {
          clienteId: cliente.id,
          tipo: canal === 'PUNTO' ? 'PUNTO' : 'ENVIO',
          estado,
          fecha,
          fechaEntrega,
          canal,
          cPacaAguaPed, cPacaAguaEnt,
          cPacaHieloPed, cPacaHieloEnt,
          cBotellonFabPed, cBotellonFabEnt,
          cBotellonDomPed, cBotellonDomEnt,
          cBolsaAguaPed, cBolsaAguaEnt,
          cBolsaHieloPed, cBolsaHieloEnt,
          precioPacaAgua: precios['PACA_AGUA'] || 0,
          precioPacaHielo: precios['PACA_HIELO'] || 0,
          precioBotellonFab: canal === 'PUNTO' ? (precios['BOTELLON'] || 0) : 0,
          precioBotellonDom: canal === 'DOMICILIO' ? (precios['BOTELLON'] || 0) : 0,
          precioBolsaAgua: precios['BOLSA_AGUA'] || 0,
          precioBolsaHielo: precios['BOLSA_HIELO'] || 0,
          total,
          totalPagado,
          saldo,
          embarqueId,
          obs: rand(OBS_PEDIDOS),
          repartidor: canal === 'DOMICILIO' ? (embarqueId ? repartidores.find(r => r.id === embarques.find(e => e.id === embarqueId)?.trabajadorId)?.nombre : null) : null,
          createdById: rand(users).id,
        },
      })

      // Create PlantillaRecurrente for recurrent clients
      if (esRecurrente) {
        const prods: Record<string, number> = {}
        for (const prod of PRODUCTOS) {
          if ((productosPedido[prod] || 0) > 0) prods[prod] = productosPedido[prod]
        }
        const proxGen = new Date(fecha)
        proxGen.setDate(proxGen.getDate() + 1)
        await prisma.plantillaRecurrente.create({
          data: {
            clienteId: cliente.id,
            activo: true,
            cadaNDias: 7,
            canal,
            productos: JSON.stringify(prods),
            ultimaGeneracion: diasAtras(randInt(3, 6)),
            proxGeneracion: proxGen,
            createdById: rand(users).id,
          },
        })
      }

      // Crear pagos
      for (const pago of pagosData) {
        await prisma.pago.create({
          data: {
            pedidoId: pedido.id,
            metodo: pago.metodo,
            monto: pago.monto,
          },
        })
      }

      // Crear factura
      const facturaNum = (pedidoCount + 1).toString().padStart(5, '0')
      await prisma.factura.create({
        data: {
          numero: `FAC-${facturaNum}`,
          clienteId: cliente.id,
          pedidoId: pedido.id,
          subtotal: estado === EstadoPedido.CANCELADO ? 0 : total,
          total: estado === EstadoPedido.CANCELADO ? 0 : total,
          saldo,
          montoPagado: totalPagado,
          estado: estado === EstadoPedido.CANCELADO ? EstadoFactura.ANULADA : saldo === 0 ? EstadoFactura.PAGADA : (totalPagado > 0 ? EstadoFactura.PARCIAL : EstadoFactura.EMITIDA),
        },
      })

      pedidoCount++
    }

    console.log(`  Día ${day + 1}/7: 250 pedidos creados`)
  }

  console.log(`✅ ${pedidoCount} pedidos creados (${fiadoCount} fiados, ${recurrenteCount} recurrentes)`)

  // ─── Calcular pacas de cada embarque ─────────────────────────────────────
  console.log('📦 Calculating embarque pacas...')
  const allEmbarques = await prisma.embarque.findMany({
    include: { pedidos: { select: { cPacaAguaPed: true, cPacaHieloPed: true } } },
  })
  for (const emb of allEmbarques) {
    const pacasAgua = emb.pedidos.reduce((sum, p) => sum + p.cPacaAguaPed, 0)
    const pacasHielo = emb.pedidos.reduce((sum, p) => sum + p.cPacaHieloPed, 0)
    await prisma.embarque.update({
      where: { id: emb.id },
      data: { pacasAgua, pacasHielo },
    })
  }
  console.log(`✅ ${allEmbarques.length} embarques actualizados con pacas`)

  // ─── Abonos sobre facturas con saldo ─────────────────────────────────────
  console.log('💰 Creating abonos...')
  const facturasConSaldo = await prisma.factura.findMany({
    where: { saldo: { gt: 0 }, estado: { in: [EstadoFactura.EMITIDA, EstadoFactura.PARCIAL] } },
    include: { cliente: true },
  })

  let abonoCount = 0
  for (const factura of facturasConSaldo.slice(0, 80)) {
    const numAbonos = randInt(1, 2)
    let saldoRestante = Number(factura.saldo)

    for (let a = 0; a < numAbonos && saldoRestante > 0; a++) {
      const montoAbono = Math.min(randFloat(5000, saldoRestante, 0), saldoRestante)
      await prisma.abono.create({
        data: {
          numero: `ABO-${(abonoCount + 1).toString().padStart(5, '0')}`,
          facturaId: factura.id,
          clienteId: factura.clienteId,
          monto: montoAbono,
          metodoPago: rand(['EFECTIVO', 'NEQUI', 'TRANSFERENCIA']),
          fecha: diasAtras(randInt(0, 5)),
        },
      })
      saldoRestante -= montoAbono
      abonoCount++
    }

    // Update factura saldo and montoPagado to match abonos
    // montoPagado already includes the original pedido payment, so we add abonos on top
    const abonosMonto = Number(factura.saldo) - saldoRestante
    const montoPagadoTotal = Number(factura.montoPagado) + abonosMonto
    const nuevoEstado = saldoRestante <= 0 ? EstadoFactura.PAGADA : (montoPagadoTotal > 0 ? EstadoFactura.PARCIAL : EstadoFactura.EMITIDA)
    await prisma.factura.update({
      where: { id: factura.id },
      data: {
        saldo: Math.max(0, saldoRestante),
        montoPagado: montoPagadoTotal,
        estado: nuevoEstado,
      },
    })
  }
  console.log(`✅ ${abonoCount} abonos created`)

  // ─── Actualizar clientes con ultEntrega y proxEntrega ────────────────────
  console.log('📅 Updating cliente delivery dates...')
  const pedidosEntregados = await prisma.pedido.groupBy({
    by: ['clienteId'],
    where: { estado: EstadoPedido.ENTREGADO },
    _max: { fechaEntrega: true },
  })

  for (const pe of pedidosEntregados) {
    if (pe._max.fechaEntrega) {
      const ultEntrega = pe._max.fechaEntrega
      const proxEntrega = new Date(ultEntrega)
      proxEntrega.setDate(proxEntrega.getDate() + randInt(3, 15))

      await prisma.cliente.update({
        where: { id: pe.clienteId },
        data: { ultEntrega, proxEntrega },
      })
    }
  }
  console.log('✅ Cliente delivery dates updated')

  // ─── Resumen ─────────────────────────────────────────────────────────────
  const stats = {
    users: await prisma.user.count(),
    rutas: await prisma.ruta.count(),
    trabajadores: await prisma.trabajador.count(),
    clientes: await prisma.cliente.count(),
    pedidos: await prisma.pedido.count(),
    embarques: await prisma.embarque.count(),
    facturas: await prisma.factura.count(),
    abonos: await prisma.abono.count(),
    pagos: await prisma.pago.count(),
    produccion: await prisma.produccion.count(),
    gastos: await prisma.gasto.count(),
    proveedores: await prisma.proveedor.count(),
    insumos: await prisma.insumo.count(),
    compras: await prisma.compraInsumo.count(),
  }

  console.log('\n📊 Resumen:')
  console.log(`  Usuarios: ${stats.users}`)
  console.log(`  Rutas: ${stats.rutas}`)
  console.log(`  Trabajadores: ${stats.trabajadores}`)
  console.log(`  Clientes: ${stats.clientes}`)
  console.log(`  Pedidos: ${stats.pedidos}`)
  console.log(`  Embarques: ${stats.embarques}`)
  console.log(`  Facturas: ${stats.facturas}`)
  console.log(`  Abonos: ${stats.abonos}`)
  console.log(`  Pagos: ${stats.pagos}`)
  console.log(`  Producción: ${stats.produccion}`)
  console.log(`  Gastos: ${stats.gastos}`)
  console.log(`  Proveedores: ${stats.proveedores}`)
  console.log(`  Insumos: ${stats.insumos}`)
  console.log(`  Compras: ${stats.compras}`)
  console.log('\n🎉 Seed realista completo!')
}

main()
  .catch((e) => {
    console.error('Seed error:', e instanceof Error ? e.message : 'Unknown')
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
