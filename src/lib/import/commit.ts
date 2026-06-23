import { ImportDecision, Prisma, type ImportEntity } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { normalizePhone } from './normalizer'
import { findWorkerByName } from './worker-matcher'
import type {
  NormalizedCliente,
  NormalizedPedido,
  NormalizedPago,
  NormalizedGasto,
  NormalizedEmbarque,
  NormalizedProduccion,
  NormalizedCierre,
  NormalizedProveedor,
  NormalizedInsumo,
  NormalizedCompra,
} from './types'
import type { CommitResult } from './application'
import type { OrigenPedido, MetodoPago, Turno } from '@prisma/client'
import { getNextNumero } from '@/lib/sequence'

/**
 * Commit de un batch: transforma las filas de staging en registros reales.
 *
 * Cada fila se procesa según su decisión:
 *  - CREATE_NEW → crea un registro nuevo
 *  - AUTO_MERGE / MANUAL_MERGE → actualiza registro existente (solo CLIENTE)
 *  - SKIP / PENDING → se salta (PENDING sin decisión se cuenta como skip)
 *
 * La operación completa corre dentro de una transacción. Si falla, se hace
 * rollback y el batch queda en estado FAILED.
 */

export async function commitBatch(batchId: string, userId: string): Promise<CommitResult> {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId, createdById: userId },
    include: {
      rows: {
        include: { contactos: true },
        orderBy: [{ entity: 'asc' }, { rowNumber: 'asc' }],
      },
    },
  })

  if (!batch) {
    throw new Error('Batch no encontrado')
  }

  if (batch.estado === 'COMMITTING' || batch.estado === 'COMPLETED') {
    throw new Error(`El batch ya está en estado ${batch.estado}`)
  }

  await prisma.importBatch.update({
    where: { id: batchId, createdById: userId },
    data: { estado: 'COMMITTING' },
  })

  const stats = {
    created: 0,
    merged: 0,
    skipped: 0,
    failed: 0,
  }

  try {
    await prisma.$transaction(async (tx) => {
      const clientCache = new Map<string, string>() // teléfono/nombre → clienteId

      for (const row of batch.rows) {
        if (row.parseError) {
          stats.skipped++
          continue
        }

        try {
          const result = await commitRow(tx, row, clientCache)
          if (result.status === 'created') stats.created++
          else if (result.status === 'merged') stats.merged++
          else if (result.status === 'skipped') stats.skipped++

          await tx.importStagingRow.update({
            where: { id: row.id },
            data: {
              createdId: result.createdId ?? null,
              decision: row.decision === 'PENDING' ? 'SKIP' : row.decision,
            },
          })
        } catch (error) {
          stats.failed++
          const message = error instanceof Error ? error.message : String(error)
          await tx.importStagingRow.update({
            where: { id: row.id },
            data: {
              error: message,
              decision: 'SKIP',
            },
          })
          logger.warn({ batchId, rowId: row.id, entity: row.entity, error: message }, 'import row failed')
        }
      }

      await tx.importBatch.update({
        where: { id: batchId },
        data: {
          estado: stats.failed > 0 ? 'FAILED' : 'COMPLETED',
          createdRows: stats.created,
          autoMergedRows: stats.merged,
          skippedRows: stats.skipped,
          errorRows: stats.failed,
        },
      })
    }, {
      maxWait: 30000,
      timeout: 120000,
    })

    return {
      batchId,
      created: stats.created,
      merged: stats.merged,
      skipped: stats.skipped,
      failed: stats.failed,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error({ batchId, error: message }, 'import commit failed')

    await prisma.importBatch.update({
      where: { id: batchId },
      data: {
        estado: 'FAILED',
        errorJson: { message } as Prisma.InputJsonValue,
      },
    })

    throw new Error(`La importación falló y se revirtieron los cambios: ${message}`)
  }
}

async function commitRow(
  tx: Prisma.TransactionClient,
  row: {
    id: string
    entity: ImportEntity
    decision: ImportDecision
    targetId: string | null
    normalizedJson: Prisma.JsonValue
    contactos: { nombre: string; telefono: string; relacion: string | null }[]
  },
  clientCache: Map<string, string>
): Promise<{ status: 'created' | 'merged' | 'skipped'; createdId?: string }> {
  switch (row.entity) {
    case 'CLIENTE':
      return commitCliente(tx, row as typeof row & { normalizedJson: NormalizedCliente }, clientCache)
    case 'PEDIDO':
      return commitPedido(tx, row as typeof row & { normalizedJson: NormalizedPedido }, clientCache)
    case 'PAGO':
      return commitPago(tx, row as typeof row & { normalizedJson: NormalizedPago }, clientCache)
    case 'GASTO':
      return commitGasto(tx, row as typeof row & { normalizedJson: NormalizedGasto })
    case 'EMBARQUE':
      return commitEmbarque(tx, row as typeof row & { normalizedJson: NormalizedEmbarque })
    case 'PRODUCCION':
      return commitProduccion(tx, row as typeof row & { normalizedJson: NormalizedProduccion })
    case 'CIERRE':
      return commitCierre(tx, row as typeof row & { normalizedJson: NormalizedCierre })
    case 'PROVEEDOR':
      return commitProveedor(tx, row as typeof row & { normalizedJson: NormalizedProveedor })
    case 'INSUMO':
      return commitInsumo(tx, row as typeof row & { normalizedJson: NormalizedInsumo })
    case 'COMPRA':
      return commitCompra(tx, row as typeof row & { normalizedJson: NormalizedCompra })
    default:
      return { status: 'skipped' }
  }
}

async function commitCliente(
  tx: Prisma.TransactionClient,
  row: {
    id: string
    decision: ImportDecision
    targetId: string | null
    normalizedJson: NormalizedCliente
    contactos: { nombre: string; telefono: string; relacion: string | null }[]
  },
  clientCache: Map<string, string>
): Promise<{ status: 'created' | 'merged' | 'skipped'; createdId?: string }> {
  const data = row.normalizedJson

  if (row.decision === 'SKIP' || row.decision === 'PENDING') {
    return { status: 'skipped' }
  }

  if (row.decision === 'AUTO_MERGE' || row.decision === 'MANUAL_MERGE') {
    if (!row.targetId) return { status: 'skipped' }

    const updateData: Prisma.ClienteUpdateInput = {
      fuente: 'IMPORTACION_HISTORICA',
    }
    if (data.apellido) updateData.apellido = data.apellido
    if (data.direccion) updateData.direccion = data.direccion
    if (data.barrio) updateData.barrio = data.barrio
    if (data.referencia) updateData.referencia = data.referencia
    if (data.nombreNegocio) updateData.nombreNegocio = data.nombreNegocio
    if (data.tipoNegocio) updateData.tipoNegocio = data.tipoNegocio
    if (data.horaApertura) updateData.horaApertura = data.horaApertura
    if (data.notas) updateData.notas = data.notas

    await tx.cliente.update({
      where: { id: row.targetId },
      data: updateData,
    })

    for (const contacto of row.contactos) {
      try {
        await tx.contactoCliente.create({
          data: {
            clienteId: row.targetId,
            nombre: contacto.nombre,
            telefono: contacto.telefono,
            relacion: contacto.relacion ?? null,
          },
        })
      } catch {
        // Unique constraint [clienteId, telefono] — contacto ya existe, ignorar
      }
    }

    clientCache.set(data.telefono, row.targetId)
    return { status: 'merged', createdId: row.targetId }
  }

  // CREATE_NEW
  const cliente = await tx.cliente.create({
    data: {
      nombre: data.nombre,
      apellido: data.apellido ?? null,
      telefono: data.telefono,
      direccion: data.direccion ?? null,
      barrio: data.barrio ?? null,
      referencia: data.referencia ?? null,
      linkUbicacion: data.linkUbicacion ?? null,
      nombreNegocio: data.nombreNegocio ?? null,
      tipoNegocio: data.tipoNegocio ?? null,
      horaApertura: data.horaApertura ?? null,
      preciosEspeciales: data.preciosEspeciales ?? null,
      fuente: 'IMPORTACION_HISTORICA',
      verificado: false,
      creadoPorRol: 'ADMIN',
      notas: data.notas ?? null,
      contactos: {
        create: row.contactos.map((c) => ({
          nombre: c.nombre,
          telefono: c.telefono,
          relacion: c.relacion ?? null,
        })),
      },
    },
  })

  clientCache.set(data.telefono, cliente.id)
  clientCache.set(data.telefono.replace(/^57/, ''), cliente.id)
  return { status: 'created', createdId: cliente.id }
}

async function commitPedido(
  tx: Prisma.TransactionClient,
  row: { normalizedJson: NormalizedPedido; decision: ImportDecision },
  clientCache: Map<string, string>
): Promise<{ status: 'created' | 'skipped'; createdId?: string }> {
  if (row.decision === 'SKIP' || row.decision === 'PENDING') return { status: 'skipped' }

  const data = row.normalizedJson
  const clienteId = await resolveClienteId(tx, data.clienteTelefono, data.clienteNombre, clientCache)
  if (!clienteId) {
    throw new Error(`No se encontró el cliente para el pedido: ${data.clienteTelefono ?? data.clienteNombre}`)
  }

  const total = data.items.reduce((sum, item) => {
    const precio = item.precio ?? 0
    return sum + item.cantPedido * precio
  }, 0)

  const pedido = await tx.pedido.create({
    data: {
      clienteId,
      fecha: data.fecha,
      fechaEntrega: data.fechaEntrega ?? null,
      origen: (data.origen as OrigenPedido | undefined) ?? 'PEDIDO',
      estadoEntrega: 'ENTREGADO',
      estadoPago: (data.totalPagado ?? 0) >= total ? 'PAGADO' : total > 0 ? 'PENDIENTE' : 'PAGADO',
      total,
      totalPagado: data.totalPagado ?? 0,
      saldo: Math.max(0, total - (data.totalPagado ?? 0)),
      fuente: 'IMPORTACION_HISTORICA',
      obs: data.obs ?? null,
      items: {
        create: data.items.map((item) => ({
          producto: item.producto,
          cantPedido: item.cantPedido,
          cantEntrega: item.cantPedido,
          precio: new Prisma.Decimal(item.precio ?? 0),
          subtotal: new Prisma.Decimal(item.cantPedido * (item.precio ?? 0)),
        })),
      },
    },
  })

  return { status: 'created', createdId: pedido.id }
}

async function commitPago(
  tx: Prisma.TransactionClient,
  row: { normalizedJson: NormalizedPago; decision: ImportDecision },
  clientCache: Map<string, string>
): Promise<{ status: 'created' | 'skipped'; createdId?: string }> {
  if (row.decision === 'SKIP' || row.decision === 'PENDING') return { status: 'skipped' }

  const data = row.normalizedJson
  const clienteId = await resolveClienteId(tx, data.clienteTelefono, data.clienteNombre, clientCache)
  if (!clienteId) {
    throw new Error(`No se encontró el cliente para el pago: ${data.clienteTelefono ?? data.clienteNombre}`)
  }

  let pedidoId: string | null = null
  if (data.pedidoNumero) {
    const numero = Number(data.pedidoNumero)
    if (!Number.isNaN(numero)) {
      const pedido = await tx.pedido.findFirst({
        where: { numero },
        orderBy: { fecha: 'desc' },
        select: { id: true },
      })
      pedidoId = pedido?.id ?? null
    }
  }

  // Si no se especificó pedido, buscar el pedido más reciente del cliente
  if (!pedidoId && clienteId) {
    const pedido = await tx.pedido.findFirst({
      where: { clienteId },
      orderBy: { fecha: 'desc' },
      select: { id: true },
    })
    pedidoId = pedido?.id ?? null
  }

  if (!pedidoId) {
    throw new Error(`No se encontró un pedido para vincular el pago del cliente ${clienteId}`)
  }

  const pago = await tx.pago.create({
    data: {
      pedidoId,
      metodo: data.metodo as MetodoPago,
      monto: new Prisma.Decimal(data.monto),
    },
  })

  return { status: 'created', createdId: pago.id }
}

async function commitGasto(
  tx: Prisma.TransactionClient,
  row: { normalizedJson: NormalizedGasto; decision: ImportDecision }
): Promise<{ status: 'created' | 'skipped'; createdId?: string }> {
  if (row.decision === 'SKIP' || row.decision === 'PENDING') return { status: 'skipped' }

  const data = row.normalizedJson
  const esPagoPersonal = detectWorkerPaymentGasto(data.descripcion)

  let trabajadorId: string | null = null
  const workerName = data.responsable || extractWorkerNameFromPaymentDescription(data.descripcion)
  if (esPagoPersonal && workerName) {
    const match = await findWorkerByName(tx, workerName)
    if (match) trabajadorId = match.id
  }

  const gasto = await tx.gasto.create({
    data: {
      fecha: data.fecha,
      descripcion: data.descripcion,
      monto: new Prisma.Decimal(data.monto),
      categoria: esPagoPersonal ? 'PAGO_PERSONAL' : (data.categoria ?? 'OTRO'),
      responsable: data.responsable ?? null,
      notas: data.notas ?? null,
      esPagoPersonal,
      trabajadorId,
    },
  })

  return { status: 'created', createdId: gasto.id }
}

function extractWorkerNameFromPaymentDescription(descripcion: string): string | null {
  // Heurística simple: intentar extraer un nombre después de palabras como "a", "para".
  // Ejemplo: "Nómina a Juan Pérez" -> "Juan Pérez"
  const lower = descripcion.toLowerCase()
  const match = lower.match(/(?:a|para)\s+(.+?)(?:\s+por\s+|\s+de\s+|$)/i)
  return match ? match[1].trim() : null
}

function detectWorkerPaymentGasto(descripcion: string): boolean {
  const lower = descripcion.toLowerCase()
  const keywords = [
    'nomina',
    'nómina',
    'sueldo',
    'salario',
    'comision',
    'comisión',
    'pago personal',
    'pago repartidor',
    'liquidacion',
    'liquidación',
    'adelanto',
  ]
  return keywords.some((k) => lower.includes(k))
}

async function commitEmbarque(
  tx: Prisma.TransactionClient,
  row: { normalizedJson: NormalizedEmbarque; decision: ImportDecision }
): Promise<{ status: 'created' | 'skipped'; createdId?: string }> {
  if (row.decision === 'SKIP' || row.decision === 'PENDING') return { status: 'skipped' }

  const data = row.normalizedJson
  let trabajadorId: string | null = null

  if (data.repartidorNombre) {
    const match = await findWorkerByName(tx, data.repartidorNombre)
    trabajadorId = match?.id ?? null
  }

  if (!trabajadorId) {
    throw new Error(`No se encontró el repartidor: ${data.repartidorNombre}`)
  }

  const embarque = await tx.embarque.create({
    data: {
      fecha: data.fecha,
      trabajadorId,
      pacasAgua: data.pacasAgua ?? 0,
      pacasHielo: data.pacasHielo ?? 0,
      devueltasAgua: data.devueltasAgua ?? 0,
      devueltasHielo: data.devueltasHielo ?? 0,
      rotasAgua: data.rotasAgua ?? 0,
      rotasHielo: data.rotasHielo ?? 0,
      baseDinero: new Prisma.Decimal(data.baseDinero ?? 0),
      dineroEntregado: new Prisma.Decimal(data.dineroEntregado ?? 0),
      obs: data.obs ?? null,
    },
  })

  return { status: 'created', createdId: embarque.id }
}

async function commitProduccion(
  tx: Prisma.TransactionClient,
  row: { normalizedJson: NormalizedProduccion; decision: ImportDecision }
): Promise<{ status: 'created' | 'skipped'; createdId?: string }> {
  if (row.decision === 'SKIP' || row.decision === 'PENDING') return { status: 'skipped' }

  const data = row.normalizedJson
  let trabajadorId: string | null = null

  if (data.trabajadorNombre) {
    const match = await findWorkerByName(tx, data.trabajadorNombre)
    trabajadorId = match?.id ?? null
  }

  if (!trabajadorId) {
    throw new Error(`No se encontró el trabajador: ${data.trabajadorNombre}`)
  }

  const produccion = await tx.produccion.create({
    data: {
      fecha: data.fecha,
      turno: data.turno as Turno,
      trabajadorId,
      obs: data.obs ?? null,
      items: {
        create: data.items.map((item) => ({
          producto: item.producto,
          conteoA: item.conteoA ?? 0,
          conteoB: item.conteoB ?? 0,
          producido: Math.round(((item.conteoA ?? 0) + (item.conteoB ?? 0)) / 2),
          stockIni: item.stockIni ?? 0,
          ventas: item.ventas ?? 0,
          stockFinEsperado: 0,
          stockFinFisico: item.stockFinFisico ?? 0,
          filtradas: item.filtradas ?? 0,
          rotas: item.rotas ?? 0,
          consumoInterno: item.consumoInterno ?? 0,
        })),
      },
    },
  })

  return { status: 'created', createdId: produccion.id }
}

async function commitCierre(
  tx: Prisma.TransactionClient,
  row: { normalizedJson: NormalizedCierre; decision: ImportDecision }
): Promise<{ status: 'created' | 'skipped'; createdId?: string }> {
  if (row.decision === 'SKIP' || row.decision === 'PENDING') return { status: 'skipped' }

  const data = row.normalizedJson

  const cierre = await tx.cierreDia.upsert({
    where: { fecha: data.fecha },
    create: {
      fecha: data.fecha,
      numPedidos: data.numPedidos ?? 0,
      totalVentas: new Prisma.Decimal(data.totalVentas ?? 0),
      totalVentaRapida: new Prisma.Decimal(data.totalVentaRapida ?? 0),
      totalPedido: new Prisma.Decimal(data.totalPedido ?? 0),
      totalVentaLibre: new Prisma.Decimal(data.totalVentaLibre ?? 0),
      fiadoVentaRapida: new Prisma.Decimal(data.fiadoVentaRapida ?? 0),
      fiadoPedido: new Prisma.Decimal(data.fiadoPedido ?? 0),
      fiadoVentaLibre: new Prisma.Decimal(data.fiadoVentaLibre ?? 0),
      aguaVendida: data.aguaVendida ?? 0,
      hieloVendido: data.hieloVendido ?? 0,
      botellonVendido: data.botellonVendido ?? 0,
      bolsaAguaVendida: data.bolsaAguaVendida ?? 0,
      bolsaHieloVendida: data.bolsaHieloVendida ?? 0,
      cobrado: new Prisma.Decimal(data.cobrado ?? 0),
      fiado: new Prisma.Decimal(data.fiado ?? 0),
      efectivo: new Prisma.Decimal(data.efectivo ?? 0),
      nequi: new Prisma.Decimal(data.nequi ?? 0),
      daviplata: new Prisma.Decimal(data.daviplata ?? 0),
      transferencia: new Prisma.Decimal(data.transferencia ?? 0),
      bono: new Prisma.Decimal(data.bono ?? 0),
      baseDia: new Prisma.Decimal(data.baseDia ?? 0),
      comisiones: new Prisma.Decimal(data.comisiones ?? 0),
      salarios: new Prisma.Decimal(data.salarios ?? 0),
      gastos: new Prisma.Decimal(data.gastos ?? 0),
      stockIniAgua: data.stockIniAgua ?? 0,
      prodAgua: data.prodAgua ?? 0,
      stockFinAgua: data.stockFinAgua ?? 0,
      stockIniHielo: data.stockIniHielo ?? 0,
      prodHielo: data.prodHielo ?? 0,
      stockFinHielo: data.stockFinHielo ?? 0,
      netoCaja: new Prisma.Decimal(data.netoCaja ?? 0),
      cerradoPor: data.cerradoPor ?? null,
      necesitaValidacion: true,
    },
    update: {
      necesitaValidacion: true,
    },
  })

  return { status: 'created', createdId: cierre.id }
}

async function resolveClienteId(
  tx: Prisma.TransactionClient,
  telefono: string | undefined,
  nombre: string | undefined,
  clientCache: Map<string, string>
): Promise<string | null> {
  if (telefono) {
    const normalized = normalizePhone(telefono)
    const cacheKeys = [normalized.normalized, normalized.normalized.replace(/^57/, '')]

    for (const key of cacheKeys) {
      if (clientCache.has(key)) {
        return clientCache.get(key)!
      }
    }

    const cliente = await tx.cliente.findFirst({
      where: {
        activo: true,
        OR: [
          { telefono: normalized.isValid ? normalized.normalized : undefined },
          { telefono: { contains: normalized.normalized.replace(/^57/, '') } },
          { contactos: { some: { telefono: { contains: normalized.normalized.replace(/^57/, '') } } } },
        ],
      },
      select: { id: true },
    })

    if (cliente) {
      clientCache.set(normalized.normalized, cliente.id)
      clientCache.set(normalized.normalized.replace(/^57/, ''), cliente.id)
      return cliente.id
    }
  }

  if (nombre) {
    if (clientCache.has(nombre)) return clientCache.get(nombre)!

    const cliente = await tx.cliente.findFirst({
      where: {
        activo: true,
        nombre: { contains: nombre, mode: 'insensitive' },
      },
      select: { id: true },
    })

    if (cliente) {
      clientCache.set(nombre, cliente.id)
      return cliente.id
    }
  }

  return null
}

async function commitProveedor(
  tx: Prisma.TransactionClient,
  row: { normalizedJson: NormalizedProveedor; decision: ImportDecision; targetId: string | null }
): Promise<{ status: 'created' | 'merged' | 'skipped'; createdId?: string }> {
  if (row.decision === 'SKIP' || row.decision === 'PENDING') return { status: 'skipped' }

  const data = row.normalizedJson

  if (row.decision === 'AUTO_MERGE' || row.decision === 'MANUAL_MERGE') {
    if (!row.targetId) return { status: 'skipped' }

    const updateData: Prisma.ProveedorUpdateInput = {}
    if (data.nit) updateData.nit = data.nit
    if (data.telefono) updateData.telefono = data.telefono
    if (data.email) updateData.email = data.email
    if (data.direccion) updateData.direccion = data.direccion
    if (data.contacto) updateData.observaciones = data.contacto
    if (data.tipoProducto) updateData.tipoProducto = data.tipoProducto

    await tx.proveedor.update({
      where: { id: row.targetId },
      data: updateData,
    })

    return { status: 'merged', createdId: row.targetId }
  }

  const proveedor = await tx.proveedor.create({
    data: {
      nombre: data.nombre,
      nit: data.nit ?? null,
      telefono: data.telefono ?? null,
      email: data.email ?? null,
      direccion: data.direccion ?? null,
      observaciones: data.observaciones ?? null,
      tipoProducto: data.tipoProducto ?? null,
    },
  })

  return { status: 'created', createdId: proveedor.id }
}

async function commitInsumo(
  tx: Prisma.TransactionClient,
  row: { normalizedJson: NormalizedInsumo; decision: ImportDecision; targetId: string | null }
): Promise<{ status: 'created' | 'merged' | 'skipped'; createdId?: string }> {
  if (row.decision === 'SKIP' || row.decision === 'PENDING') return { status: 'skipped' }

  const data = row.normalizedJson

  if (row.decision === 'AUTO_MERGE' || row.decision === 'MANUAL_MERGE') {
    if (!row.targetId) return { status: 'skipped' }
    // Para insumos existentes no sobreescribimos stock automáticamente;
    // el merge significa "no duplicar".
    return { status: 'merged', createdId: row.targetId }
  }

  const insumo = await tx.insumo.create({
    data: {
      nombre: data.nombre,
      unidad: data.unidad,
      stock: data.stock ? new Prisma.Decimal(data.stock) : new Prisma.Decimal(0),
      stockMin: data.stockMinimo ? new Prisma.Decimal(data.stockMinimo) : new Prisma.Decimal(0),
      precioUnit: data.precioUnitario ? new Prisma.Decimal(data.precioUnitario) : new Prisma.Decimal(0),
    },
  })

  return { status: 'created', createdId: insumo.id }
}

async function commitCompra(
  tx: Prisma.TransactionClient,
  row: { normalizedJson: NormalizedCompra; decision: ImportDecision }
): Promise<{ status: 'created' | 'skipped'; createdId?: string }> {
  if (row.decision === 'SKIP' || row.decision === 'PENDING') return { status: 'skipped' }

  const data = row.normalizedJson

  let proveedorId: string | null = null
  if (data.proveedorNit) {
    const proveedor = await tx.proveedor.findUnique({ where: { nit: data.proveedorNit }, select: { id: true } })
    proveedorId = proveedor?.id ?? null
  }
  if (!proveedorId && data.proveedorNombre) {
    const proveedor = await tx.proveedor.findFirst({
      where: { nombre: { equals: data.proveedorNombre, mode: 'insensitive' } },
      select: { id: true },
    })
    proveedorId = proveedor?.id ?? null
  }

  // Si no existe el proveedor, se crea automáticamente con el nombre/nit dados.
  if (!proveedorId) {
    if (!data.proveedorNombre && !data.proveedorNit) {
      throw new Error('La compra requiere proveedor o proveedor_nit')
    }
    const nuevo = await tx.proveedor.create({
      data: {
        nombre: data.proveedorNombre || `Proveedor ${data.proveedorNit}`,
        nit: data.proveedorNit ?? null,
      },
    })
    proveedorId = nuevo.id
  }

  const insumo = await tx.insumo.findFirst({
    where: { nombre: { equals: data.insumoNombre, mode: 'insensitive' } },
    select: { id: true },
  })
  if (!insumo) {
    throw new Error(`Insumo no encontrado: ${data.insumoNombre}`)
  }

  const numeroSeq = await getNextNumero(tx, { model: 'compraInsumo', field: 'numero' })
  const numero = `COMP-${numeroSeq.toString().padStart(5, '0')}`

  const compra = await tx.compraInsumo.create({
    data: {
      numero,
      proveedorId,
      insumoId: insumo.id,
      cantidad: new Prisma.Decimal(data.cantidad),
      montoTotal: new Prisma.Decimal(data.cantidad * data.costoUnitario),
      fecha: data.fecha,
    },
  })

  return { status: 'created', createdId: compra.id }
}
