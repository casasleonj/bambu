import { PrismaClient, RolUsuario, OrigenPedido, EstadoEntrega, EstadoPago } from '@prisma/client'

/**
 * Seed de volumen para pruebas de performance (Módulo 12 QA Paranoico).
 *
 * Genera N clientes y M pedidos en batch. Es idempotente porque:
 * 1. Limpia tablas dependientes propias (Cliente, Pedido, etc.) sin tocar
 *    usuarios, productos, precios, rutas, trabajadores ni config.
 * 2. Usa telefonos únicos por cliente.
 *
 * Uso:
 *   npx tsx prisma/seed-large.ts
 *   CLIENTES=500 PEDIDOS=1000 npx tsx prisma/seed-large.ts
 */

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
})

const NOMBRES = [
  'Maria', 'Jose', 'Luis', 'Carmen', 'Pedro', 'Ana', 'Rosa', 'Juan', 'Diana', 'Carlos',
  'Luz', 'Marta', 'Fernando', 'Paola', 'Sandra', 'Andres', 'Liliana', 'Diego', 'Natalia', 'Camilo',
]
const APELLIDOS = [
  'Rodriguez', 'Perez', 'Martinez', 'Gomez', 'Diaz', 'Vargas', 'Torres', 'Ramirez', 'Jimenez', 'Rojas',
  'Castro', 'Ortiz', 'Moreno', 'Arias', 'Suarez', 'Mendoza', 'Herrera', 'Cruz', 'Aguilar', 'Reyes',
]
const BARRIOS = [
  'La Candelaria', 'Chapinero', 'Suba', 'Engativa', 'Usaquen', 'Kennedy', 'Fontibon', 'Teusaquillo',
  'Bosa', 'Ciudad Bolivar', 'San Cristobal', 'Rafael Uribe', 'Tunjuelito', 'Los Martires', 'Puente Aranda',
  'Antonio Narino', 'Santa Fe', 'Sumapaz', 'Usme', 'Bogota Centro',
]
const CALLES = ['Calle', 'Carrera', 'Avenida', 'Diagonal', 'Transversal']

const CLIENTES = parseInt(process.env.CLIENTES || '1500', 10)
const PEDIDOS = parseInt(process.env.PEDIDOS || '3000', 10)

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function telefonoUnico(index: number): string {
  // 3000000000 -> 3159999999 range, deterministico por index
  const base = 3000000000 + (index % 160000000)
  return `${base}`
}

async function clean() {
  // Solo tablas que este seed genera. NO truncar User, Producto, PrecioVolumen, Config, Ruta, Trabajador.
  const tables = [
    'Pago',
    'PedidoItem',
    'Pedido',
    'PlantillaProducto',
    'PlantillaRecurrente',
    'Negocio',
    'ContactoCliente',
    'Cliente',
  ]
  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`)
      console.log(`Cleaned ${table}`)
    } catch (e) {
      console.log(`Skip ${table}: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }
}

async function ensureConsumidorFinal() {
  await prisma.cliente.upsert({
    where: { id: 'CONSUMIDOR_FINAL' },
    update: { activo: false },
    create: {
      id: 'CONSUMIDOR_FINAL',
      nombre: 'Consumidor Final',
      telefono: '',
      direccion: '',
      activo: false,
      creadoPorRol: RolUsuario.ASISTENTE,
      verificado: false,
      bloqueado: false,
    },
  })
}

async function seedClientes(count: number) {
  const clientes = []
  for (let i = 0; i < count; i++) {
    const nombre = `${randomItem(NOMBRES)} ${randomItem(APELLIDOS)} ${i}`
    clientes.push({
      nombre,
      telefono: telefonoUnico(i),
      direccion: `${randomItem(CALLES)} ${Math.floor(Math.random() * 150)} #${Math.floor(Math.random() * 80)}-${Math.floor(Math.random() * 50)}`,
      barrio: randomItem(BARRIOS),
      activo: true,
      habAgua: Math.random() > 0.3,
      habHielo: Math.random() > 0.5,
      creadoPorRol: RolUsuario.ASISTENTE,
      verificado: Math.random() > 0.2,
      bloqueado: false,
    })
  }

  await prisma.cliente.createMany({ data: clientes, skipDuplicates: true })
  console.log(`Created ${count} clientes`)
}

async function seedPedidos(count: number) {
  const clientes = await prisma.cliente.findMany({
    where: { activo: true },
    take: 1000,
    select: { id: true },
  })

  const clienteIds = clientes.map((c) => c.id)
  const consumidorFinalId = 'CONSUMIDOR_FINAL'
  const admin = await prisma.user.findUnique({ where: { username: 'admin' } })
  const adminId = admin?.id

  const pedidos = []
  for (let i = 0; i < count; i++) {
    const useConsumidorFinal = Math.random() < 0.15
    const clienteId = useConsumidorFinal ? consumidorFinalId : randomItem(clienteIds)
    const cantidad = Math.floor(Math.random() * 5) + 1
    const precioUnit = 6500
    const total = cantidad * precioUnit
    const pagado = Math.random() > 0.7

    pedidos.push({
      clienteId,
      origen: Math.random() > 0.5 ? OrigenPedido.PEDIDO : OrigenPedido.VENTA_RAPIDA,
      estadoEntrega: EstadoEntrega.PENDIENTE,
      estadoPago: pagado ? EstadoPago.PAGADO : EstadoPago.PENDIENTE,
      canal: Math.random() > 0.5 ? 'DOMICILIO' : 'PUNTO',
      total,
      totalPagado: pagado ? total : 0,
      saldo: pagado ? 0 : total,
      cPacaAguaPed: cantidad,
      cPacaAguaEnt: 0,
      offlineId: crypto.randomUUID(),
      ...(adminId ? { createdById: adminId } : {}),
    })
  }

  await prisma.pedido.createMany({ data: pedidos })
  console.log(`Created ${count} pedidos`)
}

async function main() {
  console.log(`Starting large seed: CLIENTES=${CLIENTES}, PEDIDOS=${PEDIDOS}`)
  await clean()
  await ensureConsumidorFinal()
  await seedClientes(CLIENTES)
  await seedPedidos(PEDIDOS)

  const clienteCount = await prisma.cliente.count()
  const pedidoCount = await prisma.pedido.count()
  console.log(`Final counts: clientes=${clienteCount}, pedidos=${pedidoCount}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
