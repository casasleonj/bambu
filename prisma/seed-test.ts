import { PrismaClient, RolUsuario } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const SALT = 12

async function main() {
  console.log('🌱 Seeding test database...')

  // 1. Usuarios
  const users = [
    { username: 'admin', password: 'admin123', rol: RolUsuario.ADMIN, nombre: 'Administrador', apellido: 'Sistema' },
    { username: 'asistente', password: 'asist123', rol: RolUsuario.ASISTENTE, nombre: 'Asistente', apellido: 'General' },
    { username: 'contador', password: 'cont123', rol: RolUsuario.CONTADOR, nombre: 'Contador', apellido: 'Principal' },
    { username: 'repartidor', password: 'rep123', rol: RolUsuario.REPARTIDOR, nombre: 'Repartidor', apellido: 'Movil' },
  ]
  for (const u of users) {
    const hashed = await bcrypt.hash(u.password, SALT)
    await prisma.user.upsert({ where: { username: u.username }, update: {}, create: { ...u, password: hashed } })
  }
  console.log('✅ Users seeded')

  // 2. Trabajadores
  const repartidorUser = await prisma.user.findUnique({ where: { username: 'repartidor' } })
  // // const asistenteUser = await prisma.user.findUnique({ where: { username: 'asistente' } })
  const trabajadores = [
    {
      nombre: 'Carlos Andrés Vargas',
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
      usaMoto: true,
      userId: repartidorUser?.id,
      comPacaAgua: 500,
      comPacaHielo: 300,
      comBotellon: 200,
      comRepartAgua: 500,
      comRepartHielo: 300,
      comRepartBotellon: 200,
    },
    {
      nombre: 'Ana Lucía Torres',
      rol: 'SELLADOR',
      tipoPago: 'FIJO',
      usaMoto: false,
      salarioFijo: 800000,
      comPacaAgua: 0,
      comPacaHielo: 0,
      comBotellon: 0,
      comRepartAgua: 0,
      comRepartHielo: 0,
      comRepartBotellon: 0,
    },
  ]
  for (const t of trabajadores) {
    const existing = t.userId ? await prisma.trabajador.findUnique({ where: { userId: t.userId } }) : null
    if (existing) {
      await prisma.trabajador.update({ where: { id: existing.id }, data: t as any })
    } else {
      await prisma.trabajador.create({ data: t as any })
    }
  }
  console.log('✅ Trabajadores seeded')

  // 3. Clientes con datos colombianos reales
  const clientes = [
    { nombre: 'María del Carmen Rodríguez', telefono: '3112345678', direccion: 'Carrera 15 #45-67', barrio: 'La Candelaria', activo: true, habAgua: true, habHielo: true },
    { nombre: 'José Antonio Pérez', telefono: '3209876543', direccion: 'Calle 26 Sur #12-34', barrio: 'Chapinero', activo: true, habAgua: true, habHielo: false },
    { nombre: 'Luis Alfonso Martínez', telefono: '3154567890', direccion: 'Avenida Boyacá #80-15', barrio: 'Suba', activo: true, habAgua: true, habHielo: true },
    { nombre: 'Carmen Rosa Gómez', telefono: '3181234567', direccion: 'Calle 13 #7-45', barrio: 'Engativá', activo: true, habAgua: false, habHielo: true },
    { nombre: 'Pedro Antonio Díaz', telefono: '3123456789', direccion: 'Carrera 7 #32-18', barrio: 'Usaquén', activo: true, habAgua: true, habHielo: true },
  ]
  for (const c of clientes) {
    const existing = await prisma.cliente.findFirst({ where: { telefono: c.telefono } })
    if (existing) {
      await prisma.cliente.update({ where: { id: existing.id }, data: c })
    } else {
      await prisma.cliente.create({ data: c })
    }
  }
  console.log('✅ Clientes seeded')

  // 3b. Cliente canónico para ventas anónimas (VENTA_RAPIDA / VENTA_LIBRE)
  // El id literal 'CONSUMIDOR_FINAL' es un contrato fuerte en 13+ lugares del código.
  // Se siembra con activo=false para no aparecer en la lista de clientes.
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
  console.log('✅ CONSUMIDOR_FINAL seeded')

  // 4. Productos
  const PRECIO_BASE: Record<string, number> = {
    PACA_AGUA: 6500,
    PACA_HIELO: 8000,
    BOTELLON: 7500,
    BOLSA_AGUA: 2500,
    BOLSA_HIELO: 3000,
  }

  const productos = [
    { nombre: 'Paca de Agua (40u 300ml)', codigo: 'PACA_AGUA', unidad: 'paca', contenido: '40 bolsas x 300ml', activo: true, aplicaDomicilio: true, sobreCostoDomicilio: 0, precioBase: PRECIO_BASE['PACA_AGUA'] },
    { nombre: 'Paca de Hielo (20u 600ml)', codigo: 'PACA_HIELO', unidad: 'paca', contenido: '20 bolsas x 600ml', activo: true, aplicaDomicilio: true, sobreCostoDomicilio: 0, precioBase: PRECIO_BASE['PACA_HIELO'] },
    { nombre: 'Botellón 20LT', codigo: 'BOTELLON', unidad: 'unidad', contenido: '20 litros', activo: true, aplicaDomicilio: true, sobreCostoDomicilio: 2500, precioBase: PRECIO_BASE['BOTELLON'] },
    { nombre: 'Bolsa de Agua 300ml', codigo: 'BOLSA_AGUA', unidad: 'unidad', contenido: '300ml', activo: true, aplicaDomicilio: true, sobreCostoDomicilio: 0, precioBase: PRECIO_BASE['BOLSA_AGUA'] },
    { nombre: 'Bolsa de Hielo 600ml', codigo: 'BOLSA_HIELO', unidad: 'unidad', contenido: '600ml', activo: true, aplicaDomicilio: true, sobreCostoDomicilio: 0, precioBase: PRECIO_BASE['BOLSA_HIELO'] },
  ]
  for (const p of productos) {
    await prisma.producto.upsert({ where: { codigo: p.codigo }, update: {}, create: p })
  }
  console.log('✅ Productos seeded')

  // 5. Ruta
  const existingRuta = await prisma.ruta.findFirst({ where: { nombre: 'Ruta Norte - Suba' } })
  if (existingRuta) {
    await prisma.ruta.update({
      where: { id: existingRuta.id },
      data: { dias: 'Lunes,Miércoles,Viernes', horarioInicio: '06:00', horarioFin: '14:00' },
    })
  } else {
    await prisma.ruta.create({
      data: { nombre: 'Ruta Norte - Suba', dias: 'Lunes,Miércoles,Viernes', horarioInicio: '06:00', horarioFin: '14:00' },
    })
  }
  console.log('✅ Ruta seeded')

  // 6. Precios
  const adminUser = await prisma.user.findUnique({ where: { username: 'admin' } })
  await prisma.precioHistorial.createMany({
    data: [
      { producto: 'PACA_AGUA', precio: 2800, vigenteDesde: new Date(), creadoPor: adminUser?.id || '' },
      { producto: 'PACA_HIELO', precio: 2000, vigenteDesde: new Date(), creadoPor: adminUser?.id || '' },
      { producto: 'BOTELLON', precio: 6500, vigenteDesde: new Date(), creadoPor: adminUser?.id || '' },
      { producto: 'BOLSA_AGUA', precio: 300, vigenteDesde: new Date(), creadoPor: adminUser?.id || '' },
      { producto: 'BOLSA_HIELO', precio: 500, vigenteDesde: new Date(), creadoPor: adminUser?.id || '' },
    ],
    skipDuplicates: true,
  })
  console.log('✅ Precios seeded')

  // 6b. Precios por volumen (required for pricing engine)
  const preciosVolumen = [
    { codigo: 'PACA_AGUA', cantMin: 1, cantMax: 4, precio: 2800 },
    { codigo: 'PACA_AGUA', cantMin: 5, cantMax: 9, precio: 2500 },
    { codigo: 'PACA_AGUA', cantMin: 10, cantMax: null, precio: 2300 },
    { codigo: 'PACA_HIELO', cantMin: 1, cantMax: null, precio: 2000 },
    { codigo: 'BOTELLON', cantMin: 1, cantMax: null, precio: 6500 },
    { codigo: 'BOLSA_AGUA', cantMin: 1, cantMax: null, precio: 300 },
    { codigo: 'BOLSA_HIELO', cantMin: 1, cantMax: null, precio: 500 },
  ]
  for (const p of preciosVolumen) {
    const producto = await prisma.producto.findUnique({ where: { codigo: p.codigo } })
    if (!producto) continue
    await prisma.precioVolumen.upsert({
      where: { productoId_cantMin: { productoId: producto.id, cantMin: p.cantMin } },
      update: { precio: p.precio, cantMax: p.cantMax },
      create: { productoId: producto.id, cantMin: p.cantMin, cantMax: p.cantMax, precio: p.precio },
    })
  }
  console.log('✅ Precios volumen seeded')

  // 7. Configs
  const configs = [
    { clave: 'BASE_DIA', valor: '100000' },
    { clave: 'empresa_nombre', valor: 'Agua Bambú SAS' },
    { clave: 'empresa_nit', valor: '900.123.456-7' },
    { clave: 'LIMITE_PEDIDOS_FIADOS_DEFAULT', valor: '3' },
  ]
  for (const cfg of configs) {
    await prisma.config.upsert({ where: { clave: cfg.clave }, update: {}, create: cfg })
  }
  console.log('✅ Configs seeded')

  console.log('🎉 Test seed complete')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
