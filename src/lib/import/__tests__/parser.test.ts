import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseImportFile, DEFAULT_SHEET_CONFIG } from '../parser'

describe('parser', () => {
  async function buildXlsxBuffer(sheets: { name: string; headers: string[]; rows: (string | number)[][] }[]) {
    const workbook = new ExcelJS.Workbook()
    for (const sheet of sheets) {
      const worksheet = workbook.addWorksheet(sheet.name)
      worksheet.addRow(sheet.headers)
      for (const row of sheet.rows) {
        worksheet.addRow(row)
      }
    }
    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>
  }

  it('parses a Clientes xlsx sheet', async () => {
    const buffer = await buildXlsxBuffer([
      {
        name: 'Clientes',
        headers: ['nombre', 'telefono', 'barrio'],
        rows: [
          ['María Pérez', '3001234567', 'Centro'],
          ['José Ramírez', '3009876543', 'La Esperanza'],
        ],
      },
    ])

    const result = await parseImportFile(buffer, DEFAULT_SHEET_CONFIG)

    expect(result.sheets).toHaveLength(1)
    expect(result.sheets[0].name).toBe('CLIENTE')
    expect(result.sheets[0].rows).toHaveLength(2)
    expect(result.sheets[0].rows[0]).toMatchObject({
      nombre: 'María Pérez',
      telefono: '3001234567',
      barrio: 'Centro',
    })
  })

  it('maps Spanish aliases and ignores empty rows', async () => {
    const buffer = await buildXlsxBuffer([
      {
        name: 'Pedidos',
        headers: ['Fecha', 'Teléfono Cliente', 'PACA_AGUA ped', 'PACA_AGUA precio'],
        rows: [
          ['15/03/2024', '3001234567', 2, 12000],
          ['', '', '', ''],
          ['16/03/2024', '3009876543', 1, 15000],
        ],
      },
    ])

    const result = await parseImportFile(buffer, DEFAULT_SHEET_CONFIG)

    expect(result.sheets[0].rows).toHaveLength(2)
    expect(result.sheets[0].rows[0].fecha).toBe('15/03/2024')
    expect(result.sheets[0].rows[0].cliente_telefono).toBe('3001234567')
    expect(result.sheets[0].rows[0].paca_agua_ped).toBe(2)
  })

  it('reports missing required columns', async () => {
    const buffer = await buildXlsxBuffer([
      {
        name: 'Clientes',
        headers: ['apellido', 'barrio'],
        rows: [['Pérez', 'Centro']],
      },
    ])

    const result = await parseImportFile(buffer, DEFAULT_SHEET_CONFIG)

    expect(result.sheets[0].errors).toHaveLength(1)
    expect(result.sheets[0].errors[0].message).toContain('nombre')
  })

  it('parses CSV buffer', async () => {
    const csv = 'nombre,telefono,barrio\nMaría Pérez,3001234567,Centro\n'
    const buffer = Buffer.from(csv, 'utf-8')

    const result = await parseImportFile(buffer, DEFAULT_SHEET_CONFIG)

    expect(result.sheets[0].rows).toHaveLength(1)
    expect(result.sheets[0].rows[0].nombre).toBe('María Pérez')
  })

  it('returns empty result for unknown/empty sheet', async () => {
    const buffer = await buildXlsxBuffer([
      {
        name: 'Resumen',
        headers: [],
        rows: [],
      },
    ])

    const result = await parseImportFile(buffer, DEFAULT_SHEET_CONFIG)

    expect(result.sheets).toHaveLength(0)
  })
})
