import { PrismaClient, RolUsuario, OrigenPedido, EstadoEntrega, EstadoPago } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const SALT_ROUNDS = 12

function generateRandomPassword(length = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

async function main() {
  console.log('🌱 Seeding database...')

  const isDevOrTest = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'

  // Users
  const defaultPasswords: Record<string, string> = {
    admin: 'admin123',
    asistente: 'asist123',
    contador: 'cont123',
    repartidor: 'rep123',
  }

  const users = [
    { username: 'admin', password: isDevOrTest ? defaultPasswords.admin : generateRandomPassword(), rol: RolUsuario.ADMIN, nombre: 'Administrador', apellido: 'Sistema', mustChangePassword: false },
    { username: 'asistente', password: isDevOrTest ? defaultPasswords.asistente : generateRandomPassword(), rol: RolUsuario.ASISTENTE, nombre: 'Asistente', apellido: '', mustChangePassword: false },
    { username: 'contador', password: isDevOrTest ? defaultPasswords.contador : generateRandomPassword(), rol: RolUsuario.CONTADOR, nombre: 'Contador', apellido: '', mustChangePassword: false },
    { username: 'repartidor', password: isDevOrTest ? defaultPasswords.repartidor : generateRandomPassword(), rol: RolUsuario.REPARTIDOR, nombre: 'Repartidor', apellido: '', mustChangePassword: false },
  ]

  for (const user of users) {
    const hashed = await bcrypt.hash(user.password, SALT_ROUNDS)
    await prisma.user.upsert({
      where: { username: user.username },
      update: isDevOrTest ? {} : { password: hashed },
      create: { ...user, password: hashed },
    })
  }

  if (!isDevOrTest) {
    console.log('=== PRODUCTION CREDENTIALS (save these now) ===')
    users.forEach(u => console.log(`${u.username}: ${u.password}`))
    console.log('================================================')
  }
  console.log('✅ Users seeded')

  // Configs (nuevos + existente)
  const configs = [
    { clave: 'BASE_DIA', valor: '100000' },
    { clave: 'DIAS_ALERTA_NO_VERIFICADO', valor: '30' },
    { clave: 'DIAS_VENCIMIENTO_PROMESA', valor: '2' },
    { clave: 'BLOQUEAR_PRECIOS_REPARTIDOR', valor: 'false' },
    { clave: 'MAX_PEDIDOS_DIA_ALERTA', valor: '2' },
    { clave: 'REQUIERE_FOTO_ENTREGA', valor: 'true' },
    { clave: 'empresa_nombre', valor: 'Agua Bambu SAS' },
    { clave: 'empresa_nit', valor: '900.123.456-7' },
    { clave: 'empresa_direccion', valor: 'Calle Principal #123, Bogotá' },
    { clave: 'empresa_telefono', valor: '311 123 4567' },
    { clave: 'empresa_email', valor: 'info@aguabambu.com' },
  ]

  for (const cfg of configs) {
    await prisma.config.upsert({
      where: { clave: cfg.clave },
      update: {},
      create: cfg,
    })
  }
  console.log('✅ Configs seeded')

  // Prices
  const existingPrices = await prisma.precioHistorial.count()
  if (existingPrices === 0) {
    await prisma.precioHistorial.createMany({
      data: [
        { producto: 'AGUA_GALON', precio: 6500, creadoPor: 'admin' },
        { producto: 'HIELO_5KG', precio: 8000, creadoPor: 'admin' },
        { producto: 'BOTELLON', precio: 7500, creadoPor: 'admin' },
        { producto: 'BOLSA_AGUA', precio: 2500, creadoPor: 'admin' },
        { producto: 'BOLSA_HIELO', precio: 3000, creadoPor: 'admin' },
      ],
    })
    console.log('✅ Prices seeded')
  }

  // Products
  const productosData = [
    { codigo: 'PACA_AGUA', nombre: 'Paca de Agua (40u 300ml)', unidad: 'paca', contenido: '40 bolsas x 300ml', aplicaDomicilio: true, sobreCostoDomicilio: 0 },
    { codigo: 'PACA_HIELO', nombre: 'Paca de Hielo (20u 600ml)', unidad: 'paca', contenido: '20 bolsas x 600ml', aplicaDomicilio: true, sobreCostoDomicilio: 0 },
    { codigo: 'BOTELLON', nombre: 'Botellón 20LT', unidad: 'unidad', contenido: '20 litros', aplicaDomicilio: true, sobreCostoDomicilio: 2500 },
    { codigo: 'BOLSA_AGUA', nombre: 'Bolsa de Agua 300ml', unidad: 'unidad', contenido: '300ml', aplicaDomicilio: true, sobreCostoDomicilio: 0 },
    { codigo: 'BOLSA_HIELO', nombre: 'Bolsa de Hielo 600ml', unidad: 'unidad', contenido: '600ml', aplicaDomicilio: true, sobreCostoDomicilio: 0 },
  ]

  for (const prod of productosData) {
    await prisma.producto.upsert({
      where: { codigo: prod.codigo },
      update: {},
      create: prod,
    })
  }
  console.log('✅ Products seeded')

  // Volume prices (sin canal — precio base único)
  const preciosData = [
    { codigo: 'PACA_AGUA', cantMin: 1, cantMax: 4, precio: 2800 },
    { codigo: 'PACA_AGUA', cantMin: 5, cantMax: 9, precio: 2500 },
    { codigo: 'PACA_AGUA', cantMin: 10, cantMax: null, precio: 2300 },
    { codigo: 'PACA_HIELO', cantMin: 1, cantMax: null, precio: 2500 },
    { codigo: 'BOTELLON', cantMin: 1, cantMax: null, precio: 7500 },
    { codigo: 'BOLSA_AGUA', cantMin: 1, cantMax: null, precio: 300 },
    { codigo: 'BOLSA_HIELO', cantMin: 1, cantMax: null, precio: 500 },
  ]

  for (const p of preciosData) {
    const producto = await prisma.producto.findUnique({ where: { codigo: p.codigo } })
    if (!producto) continue
    await prisma.precioVolumen.upsert({
      where: { productoId_cantMin: { productoId: producto.id, cantMin: p.cantMin } },
      update: { precio: p.precio, cantMax: p.cantMax },
      create: { productoId: producto.id, cantMin: p.cantMin, cantMax: p.cantMax, precio: p.precio },
    })
  }
  console.log('✅ Volume prices seeded')

  // Trabajador repartidor
  const repUser = await prisma.user.findUnique({ where: { username: 'repartidor' } })
  await prisma.trabajador.upsert({
    where: { id: 'TRABAJADOR_TEST' },
    update: { userId: repUser?.id || null },
    create: {
      id: 'TRABAJADOR_TEST',
      nombre: 'Repartidor Test',
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
      telefono: '3111111111',
      activo: true,
      userId: repUser?.id || null,
    },
  })
  console.log('✅ Trabajador repartidor seeded')

  // Trabajador sellador (para producción)
  await prisma.trabajador.upsert({
    where: { id: 'SELLADOR_TEST' },
    update: {},
    create: {
      id: 'SELLADOR_TEST',
      nombre: 'Sellador Test',
      rol: 'SELLADOR',
      tipoPago: 'COMISION',
      telefono: '3112222222',
      activo: true,
      comPacaAgua: 200,
      comPacaHielo: 200,
    },
  })
  console.log('✅ Trabajador sellador seeded')

  // Cliente especial: CONSUMIDOR FINAL (para ventas rápidas y facturas anónimas)
  await prisma.cliente.upsert({
    where: { id: 'CONSUMIDOR_FINAL' },
    update: {},
    create: {
      id: 'CONSUMIDOR_FINAL',
      nombre: 'Consumidor Final',
      telefono: '0000000001',
      direccion: 'N/A',
      barrio: 'N/A',
      verificado: true,
      creadoPorRol: RolUsuario.ADMIN,
    },
  })
  console.log('✅ CONSUMIDOR_FINAL seeded')

  // Clientes de ejemplo con diferentes estados de verificación
  const clientesEjemplo = [
    {
      id: 'CLI_VERIFICADO',
      nombre: 'Tienda La Esquina',
      telefono: '3151234567',
      direccion: 'Calle 45 #12-34',
      barrio: 'Centro',
      verificado: true,
      verificadoEn: new Date('2026-01-15'),
      creadoPorRol: RolUsuario.ADMIN,
      preciosEspeciales: JSON.stringify({ PACA_AGUA: 2200 }),
    },
    {
      id: 'CLI_NO_VERIFICADO',
      nombre: 'Bar El Centro',
      telefono: '3159876543',
      direccion: 'Carrera 10 #5-67',
      barrio: 'Norte',
      verificado: false,
      creadoPorRol: RolUsuario.REPARTIDOR,
    },
    {
      id: 'CLI_BLOQUEADO',
      nombre: 'Papelería San José',
      telefono: '3155555555',
      direccion: 'Avenida 1 #23-45',
      barrio: 'Sur',
      verificado: true,
      bloqueado: true,
      creadoPorRol: RolUsuario.ADMIN,
    },
  ]

  for (const cli of clientesEjemplo) {
    await prisma.cliente.upsert({
      where: { id: cli.id },
      update: {},
      create: cli as any,
    })
  }
  console.log('✅ Clientes de ejemplo seeded')

  // Pedidos de ejemplo cubriendo cada caso de uso
  const adminUser = await prisma.user.findUnique({ where: { username: 'admin' } })

  const empresaSnapshot = {
    empresaNombre: 'Agua Bambu SAS',
    empresaNit: '900.123.456-7',
    empresaDireccion: 'Calle Principal #123, Bogotá',
    empresaTelefono: '311 123 4567',
    empresaEmail: 'info@aguabambu.com',
  }
  const pedido1 = await prisma.pedido.create({
    data: {
      numero: 1,
      clienteId: 'CLI_VERIFICADO',
      createdById: adminUser?.id,
      tipo: 'ENVIO',
      canal: 'DOMICILIO',
      origen: OrigenPedido.PEDIDO,
      estadoEntrega: EstadoEntrega.PENDIENTE,
      estadoPago: EstadoPago.PENDIENTE,
      estado: EstadoEntrega.PENDIENTE, // legacy
      total: 15000,
      saldo: 15000,
      totalPagado: 0,
      cPacaAguaPed: 2,
      cPacaAguaEnt: 0,
      precioPacaAgua: 3000,
      items: {
        create: [
          { producto: 'PACA_AGUA', cantPedido: 2, cantEntrega: 0, precio: 3000, subtotal: 6000 },
          { producto: 'PACA_HIELO', cantPedido: 2, cantEntrega: 0, precio: 2500, subtotal: 5000 },
        ],
      },
    },
  })
  await prisma.factura.create({
    data: {
      numero: 'FAC-00001',
      clienteId: 'CLI_VERIFICADO',
      pedidoId: pedido1.id,
      subtotal: 15000,
      total: 15000,
      saldo: 15000,
      ...empresaSnapshot,
    },
  })
  console.log('✅ Pedido 1: PEDIDO PENDIENTE creado')

  // 2. Venta rápida ENTREGADA PAGADA (origen=VENTA_RAPIDA, canal=PUNTO)
  const pedido2 = await prisma.pedido.create({
    data: {
      numero: 2,
      clienteId: 'CLI_VERIFICADO',
      createdById: adminUser?.id,
      tipo: 'PUNTO',
      canal: 'PUNTO',
      origen: OrigenPedido.VENTA_RAPIDA,
      estadoEntrega: EstadoEntrega.ENTREGADO,
      estadoPago: EstadoPago.PAGADO,
      estado: EstadoEntrega.ENTREGADO, // legacy
      total: 5600,
      saldo: 0,
      totalPagado: 5600,
      cPacaAguaPed: 2,
      cPacaAguaEnt: 2,
      precioPacaAgua: 2800,
      items: {
        create: [
          { producto: 'PACA_AGUA', cantPedido: 2, cantEntrega: 2, precio: 2800, subtotal: 5600 },
        ],
      },
    },
  })
  await prisma.factura.create({
    data: {
      numero: 'FAC-00002',
      clienteId: 'CLI_VERIFICADO',
      pedidoId: pedido2.id,
      subtotal: 5600,
      total: 5600,
      saldo: 0,
      estado: 'PAGADA',
      ...empresaSnapshot,
    },
  })
  await prisma.pago.create({
    data: { pedidoId: pedido2.id, metodo: 'EFECTIVO', monto: 5600 },
  })
  console.log('✅ Pedido 2: VENTA_RAPIDA PAGADA creado')

  // 3. Venta rápida ENTREGADA PARCIAL (fiado a conocido)
  const pedido3 = await prisma.pedido.create({
    data: {
      numero: 3,
      clienteId: 'CLI_VERIFICADO',
      createdById: adminUser?.id,
      tipo: 'PUNTO',
      canal: 'PUNTO',
      origen: OrigenPedido.VENTA_RAPIDA,
      estadoEntrega: EstadoEntrega.ENTREGADO,
      estadoPago: EstadoPago.PARCIAL,
      estado: EstadoEntrega.ENTREGADO,
      total: 10000,
      saldo: 4000,
      totalPagado: 6000,
      cPacaAguaPed: 2,
      cPacaAguaEnt: 2,
      precioPacaAgua: 3000,
      cPacaHieloPed: 2,
      cPacaHieloEnt: 2,
      precioPacaHielo: 2000,
      items: {
        create: [
          { producto: 'PACA_AGUA', cantPedido: 2, cantEntrega: 2, precio: 3000, subtotal: 6000 },
          { producto: 'PACA_HIELO', cantPedido: 2, cantEntrega: 2, precio: 2000, subtotal: 4000 },
        ],
      },
    },
  })
  await prisma.factura.create({
    data: {
      numero: 'FAC-00003',
      clienteId: 'CLI_VERIFICADO',
      pedidoId: pedido3.id,
      subtotal: 10000,
      total: 10000,
      saldo: 4000,
      ...empresaSnapshot,
    },
  })
  await prisma.pago.create({
    data: { pedidoId: pedido3.id, metodo: 'EFECTIVO', monto: 6000 },
  })
  console.log('✅ Pedido 3: VENTA_RAPIDA PARCIAL (fiado) creado')

  // 4. Pedido EN_RUTA (asignado a embarque)
  const embarque = await prisma.embarque.create({
    data: {
      numero: 1,
      trabajadorId: 'TRABAJADOR_TEST',
      estado: 'ABIERTO',
      codigoVisita: 'A7K3',
    },
  })

  const pedido4 = await prisma.pedido.create({
    data: {
      numero: 4,
      clienteId: 'CLI_VERIFICADO',
      createdById: adminUser?.id,
      embarqueId: embarque.id,
      tipo: 'ENVIO',
      canal: 'DOMICILIO',
      origen: OrigenPedido.PEDIDO,
      estadoEntrega: EstadoEntrega.EN_RUTA,
      estadoPago: EstadoPago.ANTICIPADO,
      estado: EstadoEntrega.EN_RUTA,
      total: 15000,
      saldo: 0,
      totalPagado: 15000,
      cPacaAguaPed: 3,
      cPacaAguaEnt: 0,
      precioPacaAgua: 2500,
      items: {
        create: [
          { producto: 'PACA_AGUA', cantPedido: 3, cantEntrega: 0, precio: 2500, subtotal: 7500 },
          { producto: 'BOTELLON', cantPedido: 1, cantEntrega: 0, precio: 10000, subtotal: 5000 },
        ],
      },
    },
  })
  await prisma.factura.create({
    data: {
      numero: 'FAC-00004',
      clienteId: 'CLI_VERIFICADO',
      pedidoId: pedido4.id,
      subtotal: 15000,
      total: 15000,
      saldo: 0,
      estado: 'PAGADA',
      ...empresaSnapshot,
    },
  })
  await prisma.pago.create({
    data: { pedidoId: pedido4.id, metodo: 'TRANSFERENCIA', monto: 15000 },
  })
  console.log('✅ Pedido 4: PEDIDO EN_RUTA (anticipado) creado')

  // 5. Venta libre ENTREGADA (origen=VENTA_LIBRE, canal=DOMICILIO)
  const pedido5 = await prisma.pedido.create({
    data: {
      numero: 5,
      clienteId: 'CONSUMIDOR_FINAL',
      createdById: adminUser?.id,
      embarqueId: embarque.id,
      tipo: 'ENVIO',
      canal: 'DOMICILIO',
      origen: OrigenPedido.VENTA_LIBRE,
      estadoEntrega: EstadoEntrega.ENTREGADO,
      estadoPago: EstadoPago.PAGADO,
      estado: EstadoEntrega.ENTREGADO,
      total: 6000,
      saldo: 0,
      totalPagado: 6000,
      cPacaAguaPed: 2,
      cPacaAguaEnt: 2,
      precioPacaAgua: 3000,
      fotoEntrega: '/uploads/entregas/venta_libre_5.jpg',
      gpsLat: 4.7110,
      gpsLng: -74.0721,
      items: {
        create: [
          { producto: 'PACA_AGUA', cantPedido: 2, cantEntrega: 2, precio: 3000, subtotal: 6000 },
        ],
      },
    },
  })
  await prisma.factura.create({
    data: {
      numero: 'FAC-00005',
      clienteId: 'CONSUMIDOR_FINAL',
      pedidoId: pedido5.id,
      subtotal: 6000,
      total: 6000,
      saldo: 0,
      estado: 'PAGADA',
      ...empresaSnapshot,
    },
  })
  await prisma.pago.create({
    data: { pedidoId: pedido5.id, metodo: 'EFECTIVO', monto: 6000 },
  })
  console.log('✅ Pedido 5: VENTA_LIBRE PAGADA creado')

  // 6. Pedido ENTREGADO con promesa de pago vencida
  const pedido6 = await prisma.pedido.create({
    data: {
      numero: 6,
      clienteId: 'CLI_BLOQUEADO',
      createdById: adminUser?.id,
      tipo: 'ENVIO',
      canal: 'DOMICILIO',
      origen: OrigenPedido.PEDIDO,
      estadoEntrega: EstadoEntrega.ENTREGADO,
      estadoPago: EstadoPago.VENCIDO,
      estado: EstadoEntrega.ENTREGADO,
      total: 12000,
      saldo: 12000,
      totalPagado: 0,
      promesaPagoFecha: new Date('2026-05-01'), // vencida
      cPacaAguaPed: 4,
      cPacaAguaEnt: 4,
      precioPacaAgua: 3000,
      items: {
        create: [
          { producto: 'PACA_AGUA', cantPedido: 4, cantEntrega: 4, precio: 3000, subtotal: 12000 },
        ],
      },
    },
  })
  await prisma.factura.create({
    data: {
      numero: 'FAC-00006',
      clienteId: 'CLI_BLOQUEADO',
      pedidoId: pedido6.id,
      subtotal: 12000,
      total: 12000,
      saldo: 12000,
      ...empresaSnapshot,
    },
  })
  console.log('✅ Pedido 6: PEDIDO VENCIDO (promesa no cumplida) creado')

  // 7. Pedido CANCELADO
  const pedido7 = await prisma.pedido.create({
    data: {
      numero: 7,
      clienteId: 'CLI_VERIFICADO',
      createdById: adminUser?.id,
      tipo: 'ENVIO',
      canal: 'DOMICILIO',
      origen: OrigenPedido.PEDIDO,
      estadoEntrega: EstadoEntrega.CANCELADO,
      estadoPago: EstadoPago.PENDIENTE,
      estado: EstadoEntrega.CANCELADO,
      total: 0,
      saldo: 0,
      totalPagado: 0,
      cPacaAguaPed: 1,
      cPacaAguaEnt: 0,
      precioPacaAgua: 3000,
      items: {
        create: [
          { producto: 'PACA_AGUA', cantPedido: 1, cantEntrega: 0, precio: 3000, subtotal: 0 },
        ],
      },
    },
  })
  await prisma.notaCredito.create({
    data: {
      numero: 'NC-00001',
      pedidoId: pedido7.id,
      monto: 0,
      motivo: 'CANCELADO',
    },
  })
  console.log('✅ Pedido 7: CANCELADO creado')

  // 8. Pedido con disputa abierta
  const pedido8 = await prisma.pedido.create({
    data: {
      numero: 8,
      clienteId: 'CLI_VERIFICADO',
      createdById: adminUser?.id,
      tipo: 'ENVIO',
      canal: 'DOMICILIO',
      origen: OrigenPedido.PEDIDO,
      estadoEntrega: EstadoEntrega.ENTREGADO,
      estadoPago: EstadoPago.PAGADO,
      estado: EstadoEntrega.ENTREGADO,
      disputaAbierta: true,
      total: 9000,
      saldo: 0,
      totalPagado: 9000,
      cPacaAguaPed: 3,
      cPacaAguaEnt: 3,
      precioPacaAgua: 3000,
      items: {
        create: [
          { producto: 'PACA_AGUA', cantPedido: 3, cantEntrega: 3, precio: 3000, subtotal: 9000 },
        ],
      },
    },
  })
  await prisma.factura.create({
    data: {
      numero: 'FAC-00008',
      clienteId: 'CLI_VERIFICADO',
      pedidoId: pedido8.id,
      subtotal: 9000,
      total: 9000,
      saldo: 0,
      estado: 'PAGADA',
      ...empresaSnapshot,
    },
  })
  await prisma.pago.create({
    data: { pedidoId: pedido8.id, metodo: 'NEQUI', monto: 9000 },
  })
  // Incrementar reclamaciones del cliente
  await prisma.cliente.update({
    where: { id: 'CLI_VERIFICADO' },
    data: { reclamaciones: { increment: 1 } },
  })
  console.log('✅ Pedido 8: CON DISPUTA creado')

  // 9. Pedido ENTREGADO NO_ENTREGADO (repartidor intentó, no pudo)
  const pedido9 = await prisma.pedido.create({
    data: {
      numero: 9,
      clienteId: 'CLI_VERIFICADO',
      createdById: adminUser?.id,
      tipo: 'ENVIO',
      canal: 'DOMICILIO',
      origen: OrigenPedido.PEDIDO,
      estadoEntrega: EstadoEntrega.NO_ENTREGADO,
      estadoPago: EstadoPago.PENDIENTE,
      estado: EstadoEntrega.NO_ENTREGADO,
      total: 6000,
      saldo: 6000,
      totalPagado: 0,
      cPacaAguaPed: 2,
      cPacaAguaEnt: 0,
      precioPacaAgua: 3000,
      items: {
        create: [
          { producto: 'PACA_AGUA', cantPedido: 2, cantEntrega: 0, precio: 3000, subtotal: 0 },
        ],
      },
    },
  })
  await prisma.factura.create({
    data: {
      numero: 'FAC-00009',
      clienteId: 'CLI_VERIFICADO',
      pedidoId: pedido9.id,
      subtotal: 6000,
      total: 6000,
      saldo: 6000,
      ...empresaSnapshot,
    },
  })
  console.log('✅ Pedido 9: NO_ENTREGADO creado')

  // 10. Segundo pedido del mismo cliente (para alerta "2do hoy")
  const pedido10 = await prisma.pedido.create({
    data: {
      numero: 10,
      clienteId: 'CLI_VERIFICADO',
      createdById: adminUser?.id,
      tipo: 'ENVIO',
      canal: 'DOMICILIO',
      origen: OrigenPedido.PEDIDO,
      estadoEntrega: EstadoEntrega.PENDIENTE,
      estadoPago: EstadoPago.PENDIENTE,
      estado: EstadoEntrega.PENDIENTE,
      total: 3000,
      saldo: 3000,
      totalPagado: 0,
      cPacaAguaPed: 1,
      cPacaAguaEnt: 0,
      precioPacaAgua: 3000,
      items: {
        create: [
          { producto: 'PACA_AGUA', cantPedido: 1, cantEntrega: 0, precio: 3000, subtotal: 3000 },
        ],
      },
    },
  })
  await prisma.factura.create({
    data: {
      numero: 'FAC-00010',
      clienteId: 'CLI_VERIFICADO',
      pedidoId: pedido10.id,
      subtotal: 3000,
      total: 3000,
      saldo: 3000,
      ...empresaSnapshot,
    },
  })
  console.log('✅ Pedido 10: 2do pedido hoy (alerta) creado')

  console.log('🎉 Seed complete! Casos de uso creados:')
  console.log('   1. PEDIDO PENDIENTE')
  console.log('   2. VENTA_RAPIDA PAGADA')
  console.log('   3. VENTA_RAPIDA PARCIAL (fiado)')
  console.log('   4. PEDIDO EN_RUTA (anticipado)')
  console.log('   5. VENTA_LIBRE PAGADA')
  console.log('   6. PEDIDO VENCIDO (promesa no cumplida)')
  console.log('   7. PEDIDO CANCELADO')
  console.log('   8. PEDIDO CON DISPUTA')
  console.log('   9. PEDIDO NO_ENTREGADO')
  console.log('  10. 2do pedido mismo cliente (alerta)')
}

main()
  .catch((e) => {
    console.error('Seed error:', e instanceof Error ? e.message : 'Unknown')
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })