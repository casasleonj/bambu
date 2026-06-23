import { Readable } from 'node:stream'
import ExcelJS from 'exceljs'
import { slugifyColumnName } from './normalizer'
import type {
  RawRow,
  ParsedSheet,
  ParseError,
  SheetConfig,
  ExpectedSheet,
} from './types'

/**
 * Lee archivos .xlsx / .xls / .csv y los convierte en hojas de RawRow.
 *
 * La columna de la hoja se mapea a un nombre canónico usando aliases.
 * Cada celda se lee como string para mantener el control de la conversión
 * en los normalizadores/validadores.
 */

export const DEFAULT_SHEET_CONFIG: SheetConfig = {
  expectedSheets: [
    {
      entity: 'CLIENTE',
      aliases: ['clientes', 'cliente', 'customers', 'cliente'],
      requiredColumns: ['nombre', 'telefono'],
      optionalColumns: [
        'apellido',
        'direccion',
        'barrio',
        'referencia',
        'link_ubicacion',
        'nombre_negocio',
        'tipo_negocio',
        'hora_apertura',
        'precios_especiales',
        'contacto1_nombre',
        'contacto1_telefono',
        'contacto1_relacion',
        'contacto2_nombre',
        'contacto2_telefono',
        'contacto2_relacion',
        'notas',
      ],
    },
    {
      entity: 'PEDIDO',
      aliases: ['pedidos', 'pedido', 'ventas', 'orders'],
      requiredColumns: ['fecha'],
      optionalColumns: [
        'cliente_telefono',
        'cliente_nombre',
        'fecha_entrega',
        'origen',
        'paca_agua_ped',
        'paca_agua_precio',
        'paca_hielo_ped',
        'paca_hielo_precio',
        'botellon_ped',
        'botellon_precio',
        'bolsa_agua_ped',
        'bolsa_agua_precio',
        'bolsa_hielo_ped',
        'bolsa_hielo_precio',
        'total_pagado',
        'obs',
      ],
    },
    {
      entity: 'PAGO',
      aliases: ['pagos', 'pago', 'payments'],
      requiredColumns: ['fecha', 'monto'],
      optionalColumns: [
        'cliente_telefono',
        'cliente_nombre',
        'metodo',
        'pedido_numero',
        'notas',
      ],
    },
    {
      entity: 'GASTO',
      aliases: ['gastos', 'gasto', 'expenses'],
      requiredColumns: ['fecha', 'descripcion', 'monto'],
      optionalColumns: ['categoria', 'responsable', 'notas'],
    },
    {
      entity: 'EMBARQUE',
      aliases: ['embarques', 'embarque', 'rutas', 'ruta'],
      requiredColumns: ['fecha'],
      optionalColumns: [
        'repartidor_nombre',
        'ruta_nombre',
        'hora_salida',
        'hora_llegada',
        'pacas_agua',
        'pacas_hielo',
        'devueltas_agua',
        'devueltas_hielo',
        'rotas_agua',
        'rotas_hielo',
        'base_dinero',
        'dinero_entregado',
        'obs',
      ],
    },
    {
      entity: 'PRODUCCION',
      aliases: ['produccion', 'producción', 'produccion'],
      requiredColumns: ['fecha', 'turno'],
      optionalColumns: [
        'trabajador_nombre',
        'producto',
        'conteo_a',
        'conteo_b',
        'stock_ini',
        'ventas',
        'filtradas',
        'rotas',
        'consumo_interno',
        'stock_fin_fisico',
        'obs',
      ],
    },
    {
      entity: 'CIERRE',
      aliases: ['cierres', 'cierre', 'cierre_dia', 'cierres_dia'],
      requiredColumns: ['fecha'],
      optionalColumns: [
        'num_pedidos',
        'total_ventas',
        'total_venta_rapida',
        'total_pedido',
        'total_venta_libre',
        'fiado_venta_rapida',
        'fiado_pedido',
        'fiado_venta_libre',
        'agua_vendida',
        'hielo_vendido',
        'botellon_vendido',
        'bolsa_agua_vendida',
        'bolsa_hielo_vendida',
        'cobrado',
        'fiado',
        'efectivo',
        'nequi',
        'daviplata',
        'transferencia',
        'bono',
        'base_dia',
        'comisiones',
        'salarios',
        'gastos',
        'stock_ini_agua',
        'prod_agua',
        'stock_fin_agua',
        'stock_ini_hielo',
        'prod_hielo',
        'stock_fin_hielo',
        'neto_caja',
        'cerrado_por',
        'hora_cierre',
      ],
    },
    {
      entity: 'PROVEEDOR',
      aliases: ['proveedores', 'proveedor', 'suppliers'],
      requiredColumns: ['nombre'],
      optionalColumns: ['nit', 'telefono', 'email', 'direccion', 'contacto', 'tipo_producto', 'observaciones'],
    },
    {
      entity: 'INSUMO',
      aliases: ['insumos', 'insumo', 'materiales'],
      requiredColumns: ['nombre', 'unidad'],
      optionalColumns: ['stock', 'stock_minimo', 'precio_unitario'],
    },
    {
      entity: 'COMPRA',
      aliases: ['compras', 'compra', 'compras_insumo'],
      requiredColumns: ['fecha', 'insumo', 'cantidad', 'costo_unitario'],
      optionalColumns: ['proveedor', 'proveedor_nit', 'numero_factura'],
    },
    {
      entity: 'NOMINA',
      aliases: ['nomina', 'nómina', 'nomina_historica'],
      requiredColumns: ['fecha', 'trabajador', 'monto'],
      optionalColumns: ['notas'],
    },
  ],
  dateFormat: 'DD/MM/AAAA',
  timeZone: 'America/Bogota',
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[]
  config: SheetConfig
}

export async function parseImportFile(
  buffer: Buffer,
  config: SheetConfig = DEFAULT_SHEET_CONFIG
): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook()

  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  } catch (xlsxError) {
    try {
      await workbook.csv.read(bufferToStream(buffer), {
        parserOptions: {
          delimiter: detectDelimiter(buffer),
        },
      })
    } catch {
      const error = xlsxError instanceof Error ? xlsxError : new Error('Formato de archivo no soportado')
      throw new Error(`No se pudo leer el archivo: ${error.message}`)
    }
  }

  const sheets: ParsedSheet[] = []

  workbook.eachSheet((worksheet) => {
    if (isWorksheetEmpty(worksheet)) return
    const sheet = parseWorksheet(worksheet, config)
    if (sheet.rows.length > 0 || sheet.errors.length > 0) {
      sheets.push(sheet)
    }
  })

  return { sheets, config }
}

function parseWorksheet(worksheet: ExcelJS.Worksheet, config: SheetConfig): ParsedSheet {
  const expectedSheet = findExpectedSheet(worksheet.name, config.expectedSheets)
  const sheetName = expectedSheet?.entity ?? worksheet.name

  const headerRow = findHeaderRow(worksheet)
  if (!headerRow) {
    return {
      name: sheetName,
      rows: [],
      errors: [{ row: 0, message: `No se encontró una fila de encabezados en la hoja "${worksheet.name}"` }],
    }
  }

  const columnMap = buildColumnMap(headerRow, expectedSheet)
  const rows: RawRow[] = []
  const errors: ParseError[] = []

  for (let i = headerRow.number + 1; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i)
    if (isEmptyRow(row, columnMap)) continue

    const parsedRow: RawRow = {}
    for (const [canonicalName, columnKey] of Object.entries(columnMap)) {
      const cell = row.getCell(columnKey)
      parsedRow[canonicalName] = cellValueToRaw(cell.value)
    }

    rows.push(parsedRow)
  }

  if (expectedSheet && rows.length > 0) {
    const missingRequired = expectedSheet.requiredColumns.filter((col) => !columnMap[col])
    if (missingRequired.length > 0) {
      errors.push({
        row: 0,
        message: `Faltan columnas obligatorias en hoja "${worksheet.name}": ${missingRequired.join(', ')}`,
      })
    }
  }

  return { name: sheetName, rows, errors }
}

function cellValueToRaw(value: ExcelJS.CellValue): RawRow[string] {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return value.trim()

  const objectValue = value as unknown as Record<string, unknown>

  if ('richText' in objectValue && Array.isArray(objectValue.richText)) {
    return objectValue.richText.map((rt) => String((rt as { text?: unknown }).text ?? '')).join('')
  }
  if ('result' in objectValue) {
    return objectValue.result === null || objectValue.result === undefined
      ? null
      : String(objectValue.result).trim()
  }
  if ('text' in objectValue) {
    return String(objectValue.text).trim()
  }
  if ('hyperlink' in objectValue) {
    return typeof objectValue.hyperlink === 'string' ? objectValue.hyperlink : null
  }

  return null
}

function findHeaderRow(worksheet: ExcelJS.Worksheet): ExcelJS.Row | null {
  for (let i = 1; i <= Math.min(worksheet.rowCount, 10); i++) {
    const row = worksheet.getRow(i)
    const values = row.values
    if (Array.isArray(values) && values.length > 1) {
      const hasText = values.some((val) => {
        if (val === null || val === undefined) return false
        const str = String(val).trim()
        return str.length > 0 && str.toLowerCase() !== 'null'
      })
      if (hasText) return row
    }
  }
  return null
}

function buildColumnMap(
  headerRow: ExcelJS.Row,
  expectedSheet: ExpectedSheet | null
): Record<string, number> {
  const columnMap: Record<string, number> = {}
  const seenCanonical = new Set<string>()

  headerRow.eachCell((cell, colNumber) => {
    const rawHeader = cell.value
    if (rawHeader === null || rawHeader === undefined) return

    const header = String(rawHeader).trim()
    if (!header) return

    const canonical = resolveCanonicalName(header, expectedSheet)
    if (!canonical) return

    if (!seenCanonical.has(canonical)) {
      columnMap[canonical] = colNumber
      seenCanonical.add(canonical)
    }
  })

  return columnMap
}

function resolveCanonicalName(header: string, expectedSheet: ExpectedSheet | null): string | null {
  const slug = slugifyColumnName(header)
  const headerTokens = tokenize(slug)

  const allColumns = new Set<string>([
    ...(expectedSheet?.requiredColumns ?? []),
    ...(expectedSheet?.optionalColumns ?? []),
  ])

  // 1. Exact match
  for (const canonical of allColumns) {
    if (canonical === slug) return canonical
  }

  // 2. Substring match
  for (const canonical of allColumns) {
    if (slug.includes(canonical) || canonical.includes(slug)) return canonical
  }

  // 3. Token set match (order independent) - e.g. "telefono_cliente" ↔ "cliente_telefono"
  for (const canonical of allColumns) {
    const canonicalTokens = tokenize(canonical)
    if (tokenSetsMatch(headerTokens, canonicalTokens)) return canonical
  }

  // 4. Generated aliases
  const aliasMap = buildAliasMap(expectedSheet)
  for (const [canonical, aliases] of aliasMap.entries()) {
    if (aliases.some((alias) => alias === slug || slug.includes(alias) || alias.includes(slug))) {
      return canonical
    }
  }

  return slug
}

function buildAliasMap(expectedSheet: ExpectedSheet | null): Map<string, string[]> {
  const map = new Map<string, string[]>()
  if (!expectedSheet) return map

  for (const canonical of [...expectedSheet.requiredColumns, ...expectedSheet.optionalColumns]) {
    map.set(canonical, generateAliases(canonical))
  }
  return map
}

function generateAliases(canonical: string): string[] {
  const base = canonical.replace(/_/g, '')
  return [
    canonical,
    canonical.replace(/_/g, ' '),
    canonical.replace(/_/g, '_'),
    base,
    base.replace(/s$/, ''),
    base.replace(/1$/, ''),
    base.replace(/2$/, ''),
  ]
}

function tokenize(slug: string): string[] {
  return slug
    .split('_')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function tokenSetsMatch(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false
  const setA = new Set(a)
  const setB = new Set(b)
  if (setA.size !== setB.size) return false
  for (const token of setA) {
    if (!setB.has(token)) return false
  }
  return true
}

function findExpectedSheet(sheetName: string, expectedSheets: ExpectedSheet[]): ExpectedSheet | null {
  const slug = slugifyColumnName(sheetName)
  for (const sheet of expectedSheets) {
    if (sheet.aliases.some((alias) => slugifyColumnName(alias) === slug)) {
      return sheet
    }
  }
  return null
}

function isWorksheetEmpty(worksheet: ExcelJS.Worksheet): boolean {
  if (worksheet.rowCount === 0) return true
  for (let i = 1; i <= Math.min(worksheet.rowCount, 5); i++) {
    const row = worksheet.getRow(i)
    const values = row.values
    if (Array.isArray(values)) {
      const hasValue = values.some((val) => {
        if (val === null || val === undefined) return false
        const str = String(val).trim()
        return str.length > 0 && str.toLowerCase() !== 'null'
      })
      if (hasValue) return false
    }
  }
  return true
}

function isEmptyRow(row: ExcelJS.Row, columnMap: Record<string, number>): boolean {
  for (const colNumber of Object.values(columnMap)) {
    const value = row.getCell(colNumber).value
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return false
    }
  }
  return true
}

function detectDelimiter(buffer: Buffer): string {
  const sample = buffer.toString('utf-8', 0, Math.min(buffer.length, 4096))
  const semicolons = (sample.match(/;/g) || []).length
  const commas = (sample.match(/,/g) || []).length
  return semicolons > commas ? ';' : ','
}

function bufferToStream(buffer: Buffer): Readable {
  return Readable.from([buffer])
}
