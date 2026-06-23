import { NextResponse } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import ExcelJS from 'exceljs'

const SHEETS: Record<string, { headers: string[]; rows: Record<string, string | number>[] }> = {
  Clientes: {
    headers: ['nombre', 'direccion', 'barrio', 'telefono', 'email', 'tipo', 'diaFrecuencia', 'observaciones'],
    rows: [
      {
        nombre: 'Juan Pérez',
        direccion: 'Calle 1 #2-3',
        barrio: 'Centro',
        telefono: '3001234567',
        email: '',
        tipo: 'HOGAR',
        diaFrecuencia: 'Lunes',
        observaciones: 'Cliente frecuente',
      },
      {
        nombre: 'María Gómez',
        direccion: 'Carrera 10 #20-30',
        barrio: 'Norte',
        telefono: '3109876543',
        email: 'maria@correo.com',
        tipo: 'COMERCIO',
        diaFrecuencia: '',
        observaciones: '',
      },
    ],
  },
  Pedidos: {
    headers: ['telefono', 'fecha', 'producto', 'cantidad', 'precioUnitario', 'estado', 'observaciones'],
    rows: [
      {
        telefono: '3001234567',
        fecha: '15/01/2024',
        producto: 'PACA_AGUA',
        cantidad: 2,
        precioUnitario: 12000,
        estado: 'ENTREGADO',
        observaciones: '',
      },
    ],
  },
  Pagos: {
    headers: ['telefono', 'fecha', 'monto', 'metodo', 'notas'],
    rows: [
      {
        telefono: '3001234567',
        fecha: '15/01/2024',
        monto: 24000,
        metodo: 'EFECTIVO',
        notas: 'Pago pedido',
      },
    ],
  },
  Gastos: {
    headers: ['fecha', 'concepto', 'monto', 'categoria', 'trabajador'],
    rows: [
      {
        fecha: '15/01/2024',
        concepto: 'Pago mensual conductor',
        monto: 1500000,
        categoria: 'PAGO_PERSONAL',
        trabajador: 'Carlos Ruiz',
      },
      {
        fecha: '15/01/2024',
        concepto: 'Gasolina camión',
        monto: 80000,
        categoria: 'COMBUSTIBLE',
        trabajador: '',
      },
    ],
  },
  Embarques: {
    headers: ['fecha', 'vehiculo', 'repartidor', 'estado'],
    rows: [
      {
        fecha: '15/01/2024',
        vehiculo: 'Camioneta XYZ123',
        repartidor: 'Carlos Ruiz',
        estado: 'CERRADO',
      },
    ],
  },
  Produccion: {
    headers: ['fecha', 'turno', 'producto', 'cantidad'],
    rows: [
      {
        fecha: '15/01/2024',
        turno: 'MANANA',
        producto: 'PACA_AGUA',
        cantidad: 50,
      },
    ],
  },
  Cierres: {
    headers: ['fecha', 'base', 'ventas', 'gastos', 'efectivoEsperado', 'observaciones'],
    rows: [
      {
        fecha: '15/01/2024',
        base: 200000,
        ventas: 1200000,
        gastos: 300000,
        efectivoEsperado: 1100000,
        observaciones: 'Cierre histórico',
      },
    ],
  },
  Proveedores: {
    headers: ['nombre', 'nit', 'telefono', 'direccion', 'contacto'],
    rows: [
      {
        nombre: 'Proveedor ABC',
        nit: '900123456',
        telefono: '3201112222',
        direccion: 'Zona industrial',
        contacto: 'Luis Torres',
      },
    ],
  },
  Insumos: {
    headers: ['nombre', 'unidad', 'stock', 'stockMinimo'],
    rows: [
      {
        nombre: 'Tapas azules',
        unidad: 'UNIDAD',
        stock: 100,
        stockMinimo: 20,
      },
    ],
  },
  Compras: {
    headers: ['fecha', 'proveedor', 'insumo', 'cantidad', 'costoUnitario', 'numeroFactura'],
    rows: [
      {
        fecha: '15/01/2024',
        proveedor: 'Proveedor ABC',
        insumo: 'Tapas azules',
        cantidad: 100,
        costoUnitario: 150,
        numeroFactura: 'FAC-001',
      },
    ],
  },
  Nomina: {
    headers: ['fecha', 'trabajador', 'monto', 'notas'],
    rows: [
      {
        fecha: '30/01/2024',
        trabajador: 'Carlos Ruiz',
        monto: 1500000,
        notas: 'Salario enero',
      },
    ],
  },
}

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const workbook = new ExcelJS.Workbook()

    for (const [sheetName, { headers, rows }] of Object.entries(SHEETS)) {
      const worksheet = workbook.addWorksheet(sheetName)
      worksheet.addRow(headers)
      worksheet.getRow(1).font = { bold: true }
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E7FF' },
      }
      for (const row of rows) {
        worksheet.addRow(headers.map((h) => row[h] ?? ''))
      }
      worksheet.columns.forEach((col) => {
        col.width = 18
      })
    }

    const buffer = await workbook.xlsx.writeBuffer()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="plantilla_importacion_historica.xlsx"',
      },
    })
  } catch (error) {
    logger.error({ error }, 'Error generando plantilla de importación')
    return NextResponse.json({ error: 'Error generando plantilla' }, { status: 500 })
  }
}
