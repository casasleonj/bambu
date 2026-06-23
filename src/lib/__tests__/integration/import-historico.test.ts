import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import ExcelJS from 'exceljs'
import {
  testPrisma,
  resetAndSeed,
  disconnect,
  getAdminUser,
} from './setup'
import {
  uploadImportFile,
  analyzeBatch,
  recordDecision,
  commitBatch,
} from '@/lib/import/application'

async function buildImportBuffer(existingPhone: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()

  // Hoja Clientes: 3 filas
  // - María Pérez (nueva)
  // - José Pérez (nombre parecido, distinto teléfono -> revisión)
  // - Carlos Ruiz (ya existe en DB del seed por teléfono)
  const clientes = workbook.addWorksheet('Clientes')
  clientes.addRow(['nombre', 'telefono', 'barrio'])
  clientes.addRow(['ImportTest María Única', '3001111111', 'Centro'])
  clientes.addRow(['ImportTest Jose Único', '3002222222', 'Centro'])
  clientes.addRow(['ImportTest Carlos Único', existingPhone, 'Norte'])

  // Hoja Pedidos: 1 fila para María Pérez
  const pedidos = workbook.addWorksheet('Pedidos')
  pedidos.addRow(['fecha', 'cliente_telefono', 'paca_agua_ped'])
  pedidos.addRow(['15/03/2024', '3001111111', 2])

  // Hoja Pagos: 1 fila para María Pérez
  const pagos = workbook.addWorksheet('Pagos')
  pagos.addRow(['fecha', 'cliente_telefono', 'monto', 'metodo'])
  pagos.addRow(['15/03/2024', '3001111111', 50000, 'EFECTIVO'])

  // Hoja Gastos: 1 fila normal + 1 pago a personal
  const gastos = workbook.addWorksheet('Gastos')
  gastos.addRow(['fecha', 'descripcion', 'monto'])
  gastos.addRow(['15/03/2024', 'Gasolina moto', 35000])
  gastos.addRow(['15/03/2024', 'Nómina a Carlos Andrés Vargas', 800000])

  // Hoja Embarques: 1 fila para el repartidor del seed
  const embarques = workbook.addWorksheet('Embarques')
  embarques.addRow(['fecha', 'repartidor_nombre', 'pacas_agua'])
  embarques.addRow(['15/03/2024', 'Carlos Andrés Vargas', 100])

  // Hoja Produccion: 1 fila para la selladora del seed
  const produccion = workbook.addWorksheet('Produccion')
  produccion.addRow(['fecha', 'turno', 'trabajador_nombre', 'producto', 'conteo_a', 'conteo_b'])
  produccion.addRow(['15/03/2024', 'MANANA', 'Ana Lucía Torres', 'PACA_AGUA', 50, 52])

  // Hoja Cierres: 1 fila
  const cierres = workbook.addWorksheet('Cierres')
  cierres.addRow(['fecha', 'total_ventas'])
  cierres.addRow(['15/03/2024', 500000])

  // Hoja Proveedores: 1 fila
  const proveedores = workbook.addWorksheet('Proveedores')
  proveedores.addRow(['nombre', 'nit', 'telefono', 'direccion'])
  proveedores.addRow(['ImportTest Proveedor ABC', '900123456', '3201112222', 'Zona industrial'])

  // Hoja Insumos: 1 fila
  const insumos = workbook.addWorksheet('Insumos')
  insumos.addRow(['nombre', 'unidad', 'stock', 'stock_minimo'])
  insumos.addRow(['ImportTest Tapas azules', 'UNIDAD', 100, 20])

  // Hoja Compras: 1 fila
  const compras = workbook.addWorksheet('Compras')
  compras.addRow(['fecha', 'proveedor', 'insumo', 'cantidad', 'costo_unitario', 'numero_factura'])
  compras.addRow(['15/03/2024', 'ImportTest Proveedor ABC', 'ImportTest Tapas azules', 50, 150, 'FAC-001'])

  // Hoja Nomina: 1 fila
  const nomina = workbook.addWorksheet('Nomina')
  nomina.addRow(['fecha', 'trabajador', 'monto', 'notas'])
  nomina.addRow(['30/03/2024', 'Carlos Andrés Vargas', 1200000, 'Salario marzo'])

  return workbook.xlsx.writeBuffer() as unknown as Buffer
}

describe('Importación histórica — flujo completo', () => {
  let adminId: string
  const uniquePhone = `300${Math.floor(Math.random() * 1e7).toString().padStart(7, '0')}`

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await getAdminUser()
    adminId = admin.id

    // Crear un cliente existente para que el matcher lo encuentre
    await testPrisma.cliente.create({
      data: {
        nombre: 'ImportTest Carlos Único',
        telefono: `57${uniquePhone}`,
        direccion: 'Calle 10',
        barrio: 'Norte',
        activo: true,
      },
    })
  })

  afterAll(async () => {
    await disconnect()
  })

  it('sube archivo, analiza duplicados, decide y commitea registros', async () => {
    const buffer = await buildImportBuffer(uniquePhone)
    const upload = await uploadImportFile(adminId, 'Test import', buffer)

    expect(upload.batchId).toBeDefined()
    expect(upload.totalRows).toBe(14) // 3 clientes + 1 pedido + 1 pago + 2 gastos + 1 embarque + 1 produccion + 1 cierre + 1 proveedor + 1 insumo + 1 compra + 1 nomina

    const analyze = await analyzeBatch(upload.batchId, adminId)
    expect(analyze.totalRows).toBe(14)

    const batchAfterAnalyze = await testPrisma.importBatch.findUnique({
      where: { id: upload.batchId },
      include: { rows: true },
    })
    expect(batchAfterAnalyze?.estado).toBe('ANALYZED')

    const clienteRows = batchAfterAnalyze?.rows.filter((r) => r.entity === 'CLIENTE') ?? []
    expect(clienteRows).toHaveLength(3)

    const autoMergeRow = clienteRows.find((r) => r.decision === 'AUTO_MERGE')
    expect(autoMergeRow).toBeDefined()

    const pendingRows = clienteRows.filter((r) => r.decision === 'PENDING')
    expect(pendingRows.length).toBeGreaterThanOrEqual(1)

    // Todas las filas pendientes se marcan como nuevos clientes
    for (const row of pendingRows) {
      await recordDecision(upload.batchId, row.id, adminId, 'CREATE_NEW')
    }

    const commit = await commitBatch(upload.batchId, adminId)

    expect(commit.created + commit.merged).toBeGreaterThanOrEqual(2)
    expect(commit.failed).toBe(0)

    // Verificar que al menos un cliente importado fue creado
    const importedClientes = await testPrisma.cliente.findMany({
      where: { fuente: 'IMPORTACION_HISTORICA' },
    })
    expect(importedClientes.length).toBeGreaterThanOrEqual(1)

    // Verificar que Carlos Ruiz fue mergeado (sin duplicar)
    const carlosCount = await testPrisma.cliente.count({
      where: { telefono: { contains: uniquePhone } },
    })
    expect(carlosCount).toBe(1)

    // Verificar pedido creado
    const pedido = await testPrisma.pedido.findFirst({
      where: { fuente: 'IMPORTACION_HISTORICA' },
    })
    expect(pedido).toBeDefined()
    expect(pedido?.fuente).toBe('IMPORTACION_HISTORICA')

    // Verificar pago creado
    const pago = await testPrisma.pago.findFirst({
      where: { monto: { equals: 50000 } },
    })
    expect(pago).toBeDefined()

    // Verificar gastos incluyendo pago a personal
    // normalizeString remueve tildes, así que la descripción persiste como "Nomina ..."
    const gastos = await testPrisma.gasto.findMany({
      where: { descripcion: { contains: 'Nomina', mode: 'insensitive' } },
    })
    expect(gastos).toHaveLength(1)
    expect(gastos[0]?.esPagoPersonal).toBe(true)
    expect(gastos[0]?.categoria).toBe('PAGO_PERSONAL')

    // Verificar que el gasto de nómina quedó vinculado al trabajador
    const trabajador = await testPrisma.trabajador.findFirst({
      where: { nombre: { contains: 'Carlos Andrés Vargas', mode: 'insensitive' } },
    })
    expect(trabajador).toBeDefined()
    expect(gastos[0]?.trabajadorId).toBe(trabajador?.id)

    // Verificar embarque creado
    const embarque = await testPrisma.embarque.findFirst({
      where: { pacasAgua: 100 },
    })
    expect(embarque).toBeDefined()

    // Verificar producción creada
    const produccionRow = await testPrisma.produccion.findFirst({
      where: { items: { some: { producto: 'PACA_AGUA' } } },
    })
    expect(produccionRow).toBeDefined()

    // Verificar cierre creado
    const cierre = await testPrisma.cierreDia.findFirst({
      where: { necesitaValidacion: true },
    })
    expect(cierre).toBeDefined()

    // Verificar proveedor creado
    const proveedor = await testPrisma.proveedor.findUnique({
      where: { nit: '900123456' },
    })
    expect(proveedor).toBeDefined()
    expect(proveedor?.nombre).toBe('importtest proveedor abc')

    // Verificar insumo creado
    const insumo = await testPrisma.insumo.findFirst({
      where: { nombre: { equals: 'ImportTest Tapas azules', mode: 'insensitive' } },
    })
    expect(insumo).toBeDefined()
    expect(Number(insumo?.stock)).toBe(100)

    // Verificar compra creada y vinculada
    const compra = await testPrisma.compraInsumo.findFirst({
      where: { insumoId: insumo?.id },
    })
    expect(compra).toBeDefined()
    expect(compra?.proveedorId).toBe(proveedor?.id)
    expect(compra?.numero).toMatch(/^COMP-\d{5}$/)

    // Verificar nómina importada como gasto PAGO_PERSONAL
    const nominaGasto = await testPrisma.gasto.findFirst({
      where: { descripcion: { contains: 'Salario marzo', mode: 'insensitive' } },
    })
    expect(nominaGasto).toBeDefined()
    expect(nominaGasto?.categoria).toBe('PAGO_PERSONAL')
    expect(nominaGasto?.esPagoPersonal).toBe(true)
    expect(nominaGasto?.monto.toNumber()).toBe(1200000)

    const batchFinal = await testPrisma.importBatch.findUnique({
      where: { id: upload.batchId },
    })
    expect(batchFinal?.estado).toBe('COMPLETED')
  })
})
