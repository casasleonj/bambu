import { ImportDecision, ImportEntity, type ImportBatchEstado, type Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { findClientMatches } from './matcher'
import { findSupplierMatches, findInsumoMatches } from './supplier-matcher'
import { parseImportFile } from './parser'
import {
  validateCliente,
  validatePedido,
  validatePago,
  validateGasto,
  validateEmbarque,
  validateProduccion,
  validateCierre,
  validateProveedor,
  validateInsumo,
  validateCompra,
  validateNomina,
} from './validator'
import type {
  ParsedSheet,
  NormalizedEntity,
  RawRow,
} from './types'

/**
 * Orquestación de la importación histórica.
 *
 * Esta capa de aplicación contiene la lógica pura de negocio del flujo:
 *  - crear batch
 *  - parsear archivo
 *  - persistir filas en staging
 *  - analizar duplicados
 *  - registrar decisiones
 *  - commitear a producción
 */

export interface UploadResult {
  batchId: string
  totalRows: number
  parseErrors: ParseErrorSummary[]
  sheets: { name: string; rows: number; errors: number }[]
}

export interface ParseErrorSummary {
  sheet: string
  row: number
  message: string
}

export interface AnalyzeResult {
  batchId: string
  autoMergeCount: number
  needsReviewCount: number
  noMatchCount: number
  totalRows: number
}

export interface CommitResult {
  batchId: string
  created: number
  merged: number
  skipped: number
  failed: number
}

export async function uploadImportFile(
  userId: string,
  nombre: string,
  buffer: Buffer
): Promise<UploadResult> {
  const { sheets } = await parseImportFile(buffer)

  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.importBatch.create({
      data: {
        createdById: userId,
        nombre,
        estado: 'DRAFT',
      },
    })

    let totalRows = 0
    for (const sheet of sheets) {
      const count = await persistSheetRows(tx, created.id, sheet)
      totalRows += count
    }

    await tx.importBatch.update({
      where: { id: created.id },
      data: { totalRows },
    })

    return { ...created, totalRows }
  })

  const parseErrors: ParseErrorSummary[] = sheets.flatMap((sheet) =>
    sheet.errors.map((err) => ({
      sheet: sheet.name,
      row: err.row,
      message: err.message,
    }))
  )

  return {
    batchId: batch.id,
    totalRows: batch.totalRows,
    parseErrors,
    sheets: sheets.map((sheet) => ({
      name: sheet.name,
      rows: sheet.rows.length,
      errors: sheet.errors.length,
    })),
  }
}

async function persistSheetRows(
  tx: Prisma.TransactionClient,
  batchId: string,
  sheet: ParsedSheet
): Promise<number> {
  const entity = sheet.name as ImportEntity
  let persisted = 0

  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i]
    const rowNumber = i + 1

    const validationResult = validateRowByEntity(entity, row)

    if (validationResult.errors.length > 0) {
      await tx.importStagingRow.create({
        data: {
          batchId,
          entity,
          rowNumber,
          rawJson: row as unknown as Prisma.InputJsonValue,
          parseError: validationResult.errors.map((e) => `${e.field}: ${e.message}`).join('; '),
          decision: 'SKIP',
        },
      })
      continue
    }

    const normalizedData = validationResult.normalized
    const contactosData =
      normalizedData?.entity === 'CLIENTE'
        ? normalizedData.contactos.map((c) => ({
            nombre: c.nombre,
            telefono: c.telefono,
            relacion: c.relacion,
          }))
        : []

    await tx.importStagingRow.create({
      data: {
        batchId,
        entity: normalizedData?.entity ?? entity,
        rowNumber,
        rawJson: row as unknown as Prisma.InputJsonValue,
        normalizedJson: normalizedData as unknown as Prisma.InputJsonValue,
        decision: 'PENDING',
        contactos: {
          create: contactosData,
        },
      },
    })
    persisted++
  }

  return persisted
}

function validateRowByEntity(
  entity: ImportEntity,
  row: RawRow
): { normalized?: NormalizedEntity; errors: { field: string; message: string }[] } {
  switch (entity) {
    case 'CLIENTE': {
      const result = validateCliente(row)
      return { normalized: result.normalized, errors: result.errors }
    }
    case 'PEDIDO': {
      const result = validatePedido(row)
      return { normalized: result.normalized, errors: result.errors }
    }
    case 'PAGO': {
      const result = validatePago(row)
      return { normalized: result.normalized, errors: result.errors }
    }
    case 'GASTO': {
      const result = validateGasto(row)
      return { normalized: result.normalized, errors: result.errors }
    }
    case 'EMBARQUE': {
      const result = validateEmbarque(row)
      return { normalized: result.normalized, errors: result.errors }
    }
    case 'PRODUCCION': {
      const result = validateProduccion(row)
      return { normalized: result.normalized, errors: result.errors }
    }
    case 'CIERRE': {
      const result = validateCierre(row)
      return { normalized: result.normalized, errors: result.errors }
    }
    case 'PROVEEDOR': {
      const result = validateProveedor(row)
      return { normalized: result.normalized, errors: result.errors }
    }
    case 'INSUMO': {
      const result = validateInsumo(row)
      return { normalized: result.normalized, errors: result.errors }
    }
    case 'COMPRA': {
      const result = validateCompra(row)
      return { normalized: result.normalized, errors: result.errors }
    }
    case 'NOMINA': {
      const result = validateNomina(row)
      if (result.errors.length > 0 || !result.normalized) {
        return { normalized: result.normalized, errors: result.errors }
      }
      const nomina = result.normalized
      // La nómina histórica se importa como Gasto PAGO_PERSONAL.
      return {
        normalized: {
          entity: 'GASTO',
          fecha: nomina.fecha,
          categoria: 'PAGO_PERSONAL',
          descripcion: `Pago a ${nomina.trabajadorNombre}${nomina.notas ? ` - ${nomina.notas}` : ''}`,
          monto: nomina.monto,
          responsable: nomina.trabajadorNombre,
          notas: nomina.notas,
        },
        errors: result.errors,
      }
    }
    default:
      return { errors: [{ field: 'entity', message: `Entidad no soportada: ${entity}` }] }
  }
}

export async function analyzeBatch(batchId: string, userId: string): Promise<AnalyzeResult> {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId, createdById: userId },
    include: { rows: { where: { decision: 'PENDING' } } },
  })

  if (!batch) {
    throw new Error('Batch no encontrado')
  }

  let autoMergeCount = 0
  let needsReviewCount = 0
  let noMatchCount = 0

  await prisma.$transaction(async (tx) => {
    for (const row of batch.rows) {
      let candidates: Array<{ targetId: string; score: number; reason: string; target: Record<string, unknown> }> = []
      let decision: ImportDecision = 'PENDING'
      let targetId: string | null = null

      if (row.entity === 'CLIENTE') {
        const normalized = row.normalizedJson as unknown as { nombre: string; telefono: string; barrio?: string }
        candidates = await findClientMatches(tx, {
          entity: 'CLIENTE',
          nombre: normalized.nombre,
          telefono: normalized.telefono,
          barrio: normalized.barrio,
          contactos: [],
        }) as unknown as typeof candidates
      } else if (row.entity === 'PROVEEDOR') {
        const normalized = row.normalizedJson as unknown as { nombre: string; nit?: string | null }
        candidates = await findSupplierMatches(tx, normalized) as unknown as typeof candidates
      } else if (row.entity === 'INSUMO') {
        const normalized = row.normalizedJson as unknown as { nombre: string }
        candidates = await findInsumoMatches(tx, normalized) as unknown as typeof candidates
      }

      if (row.entity === 'CLIENTE') {
        if (candidates.length > 0 && candidates[0].score >= 1.0) {
          decision = 'AUTO_MERGE'
          targetId = candidates[0].targetId
          autoMergeCount++
        } else if (candidates.length > 0 && candidates[0].score >= 0.7) {
          decision = 'PENDING'
          needsReviewCount++
        } else {
          decision = 'PENDING'
          noMatchCount++
        }
      } else if (row.entity === 'PROVEEDOR' || row.entity === 'INSUMO') {
        if (candidates.length > 0 && candidates[0].score >= 1.0) {
          decision = 'AUTO_MERGE'
          targetId = candidates[0].targetId
          autoMergeCount++
        } else {
          decision = 'CREATE_NEW'
          noMatchCount++
        }
      } else {
        decision = 'CREATE_NEW'
        noMatchCount++
      }

      await tx.importStagingRow.update({
        where: { id: row.id },
        data: {
          matchCandidates: candidates as unknown as Prisma.InputJsonValue,
          decision,
          targetId,
        },
      })
    }

    await tx.importBatch.update({
      where: { id: batchId, createdById: userId },
      data: { estado: 'ANALYZED' },
    })
  })

  return {
    batchId,
    autoMergeCount,
    needsReviewCount,
    noMatchCount,
    totalRows: batch.totalRows,
  }
}

export async function recordDecision(
  batchId: string,
  stagingRowId: string,
  userId: string,
  decision: ImportDecision,
  targetId?: string
): Promise<void> {
  // Verificar ownership del batch antes de modificar la fila
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId, createdById: userId },
    select: { id: true },
  })
  if (!batch) {
    throw new Error('Batch no encontrado')
  }

  await prisma.importStagingRow.updateMany({
    where: {
      id: stagingRowId,
      batchId,
    },
    data: {
      decision,
      targetId: targetId ?? null,
    },
  })
}

export async function getBatch(batchId: string, userId: string) {
  return prisma.importBatch.findUnique({
    where: { id: batchId, createdById: userId },
    include: {
      createdBy: {
        select: { id: true, nombre: true, apellido: true, username: true },
      },
      rows: {
        include: { contactos: true },
        orderBy: [{ entity: 'asc' }, { rowNumber: 'asc' }],
      },
    },
  })
}

export async function listBatches(
  userId: string,
  options: { estado?: ImportBatchEstado; page?: number; pageSize?: number } = {}
) {
  const { estado, page = 1, pageSize = 20 } = options

  const where: Prisma.ImportBatchWhereInput = { createdById: userId }
  if (estado) where.estado = estado

  const [items, total] = await Promise.all([
    prisma.importBatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { rows: true } },
      },
    }),
    prisma.importBatch.count({ where }),
  ])

  return { items, total, page, pageSize }
}

export { commitBatch } from './commit'
