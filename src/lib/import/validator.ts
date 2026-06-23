import {
  normalizeName,
  normalizePhone,
  normalizeString,
  parseDate,
  parseInteger,
  parseMoney,
} from './normalizer'
import { WORKER_PAYMENT_KEYWORDS } from './matcher'
import type {
  NormalizedRowWithErrors,
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
  NormalizedNomina,
  RawRow,
  ValidationError,
  ValidationWarning,
} from './types'

/**
 * Valida y normaliza filas crudas (RawRow) hacia entidades canónicas.
 *
 * Cada validador devuelve un objeto con:
 *  - normalized: entidad lista para persistir en staging (si no hay errores bloqueantes)
 *  - errors: errores que impiden persistir la fila
 *  - warnings: advertencias que se muestran pero no bloquean
 */

const METODO_PAGO_VALUES = ['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO'] as const
const ORIGEN_PEDIDO_VALUES = ['PEDIDO', 'VENTA_RAPIDA', 'VENTA_LIBRE', 'RECURRENTE'] as const
const TURNO_VALUES = ['MANANA', 'TARDE', 'NOCHE'] as const

function moneyFromRaw(raw: unknown): number | null {
  const decimal = parseMoney(raw)
  return decimal ? decimal.toNumber() : null
}

function dateFromRaw(raw: unknown): Date | null {
  return parseDate(raw)
}

function intFromRaw(raw: unknown): number | null {
  return parseInteger(raw)
}

function phoneFromRaw(raw: unknown): string | null {
  return normalizePhone(raw).normalized
}

function nameFromRaw(raw: unknown): string {
  return normalizeName(raw)
}

function stringFromRaw(raw: unknown): string {
  return normalizeString(raw)
}

export function validateCliente(row: RawRow): NormalizedRowWithErrors<NormalizedCliente> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const nombreRaw = row.nombre
  if (!nombreRaw || String(nombreRaw).trim() === '') {
    errors.push({ field: 'nombre', message: 'El nombre es obligatorio' })
  }

  const telefono = phoneFromRaw(row.telefono)
  if (!telefono) {
    errors.push({ field: 'telefono', message: 'El teléfono es obligatorio o tiene formato inválido' })
  }

  const contactos: NormalizedCliente['contactos'] = []
  for (let i = 1; i <= 3; i++) {
    const ctNombre = stringFromRaw(row[`contacto${i}_nombre`])
    const ctTelefono = phoneFromRaw(row[`contacto${i}_telefono`])
    const ctRelacion = stringFromRaw(row[`contacto${i}_relacion`])

    if (ctNombre || ctTelefono) {
      if (!ctNombre) {
        warnings.push({ field: `contacto${i}_nombre`, message: 'Falta el nombre del contacto' })
      }
      if (!ctTelefono) {
        warnings.push({ field: `contacto${i}_telefono`, message: 'Falta el teléfono del contacto' })
      }
      contactos.push({
        nombre: ctNombre || 'Sin nombre',
        telefono: ctTelefono || '',
        relacion: ctRelacion || undefined,
      })
    }
  }

  if (errors.length > 0) {
    return { errors, warnings }
  }

  return {
    normalized: {
      entity: 'CLIENTE',
      nombre: nameFromRaw(nombreRaw),
      apellido: stringFromRaw(row.apellido) || undefined,
      telefono: telefono!,
      direccion: stringFromRaw(row.direccion) || undefined,
      barrio: stringFromRaw(row.barrio) || undefined,
      referencia: stringFromRaw(row.referencia) || undefined,
      linkUbicacion: stringFromRaw(row.link_ubicacion) || undefined,
      nombreNegocio: stringFromRaw(row.nombre_negocio) || undefined,
      tipoNegocio: stringFromRaw(row.tipo_negocio) || undefined,
      horaApertura: stringFromRaw(row.hora_apertura) || undefined,
      preciosEspeciales: stringFromRaw(row.precios_especiales) || undefined,
      contactos,
      notas: stringFromRaw(row.notas) || undefined,
    },
    errors,
    warnings,
  }
}

export function validatePedido(row: RawRow): NormalizedRowWithErrors<NormalizedPedido> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const fecha = dateFromRaw(row.fecha)
  if (!fecha) {
    errors.push({ field: 'fecha', message: 'La fecha del pedido es obligatoria o inválida' })
  }

  const clienteTelefono = row.cliente_telefono ? phoneFromRaw(row.cliente_telefono) : null
  const clienteNombre = row.cliente_nombre ? nameFromRaw(row.cliente_nombre) : null

  if (!clienteTelefono && !clienteNombre) {
    errors.push({
      field: 'cliente_telefono',
      message: 'Debe indicar el teléfono o el nombre del cliente',
    })
  }

  const items: NormalizedPedido['items'] = []
  const productoMap: Record<string, string> = {
    paca_agua: 'PACA_AGUA',
    paca_hielo: 'PACA_HIELO',
    botellon: 'BOTELLON',
    bolsa_agua: 'BOLSA_AGUA',
    bolsa_hielo: 'BOLSA_HIELO',
  }

  for (const [key, producto] of Object.entries(productoMap)) {
    const cantidad = intFromRaw(row[`${key}_ped`])
    const precio = moneyFromRaw(row[`${key}_precio`])

    if (cantidad !== null && cantidad > 0) {
      items.push({
        producto,
        cantPedido: cantidad,
        precio: precio ?? undefined,
      })
    }
  }

  if (items.length === 0) {
    warnings.push({ field: 'items', message: 'El pedido no tiene productos, se importará con total 0' })
  }

  const origen = stringFromRaw(row.origen).toUpperCase()
  const origenValido = ORIGEN_PEDIDO_VALUES.includes(origen as (typeof ORIGEN_PEDIDO_VALUES)[number])
    ? (origen as (typeof ORIGEN_PEDIDO_VALUES)[number])
    : undefined

  if (origen && !origenValido) {
    warnings.push({ field: 'origen', message: `Origen "${origen}" no reconocido, se usará PEDIDO` })
  }

  if (errors.length > 0) {
    return { errors, warnings }
  }

  return {
    normalized: {
      entity: 'PEDIDO',
      fecha: fecha!,
      fechaEntrega: dateFromRaw(row.fecha_entrega) ?? undefined,
      clienteTelefono: clienteTelefono ?? undefined,
      clienteNombre: clienteNombre ?? undefined,
      origen: origenValido,
      items,
      totalPagado: moneyFromRaw(row.total_pagado) ?? undefined,
      obs: stringFromRaw(row.obs) || undefined,
    },
    errors,
    warnings,
  }
}

export function validatePago(row: RawRow): NormalizedRowWithErrors<NormalizedPago> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const fecha = dateFromRaw(row.fecha)
  if (!fecha) {
    errors.push({ field: 'fecha', message: 'La fecha del pago es obligatoria o inválida' })
  }

  const monto = moneyFromRaw(row.monto)
  if (monto === null || monto <= 0) {
    errors.push({ field: 'monto', message: 'El monto debe ser un número mayor a 0' })
  }

  const metodoRaw = stringFromRaw(row.metodo).toUpperCase()
  const metodo = METODO_PAGO_VALUES.includes(metodoRaw as (typeof METODO_PAGO_VALUES)[number])
    ? (metodoRaw as (typeof METODO_PAGO_VALUES)[number])
    : undefined

  if (row.metodo && !metodo) {
    warnings.push({ field: 'metodo', message: `Método "${metodoRaw}" no reconocido, se usará EFECTIVO` })
  }

  const clienteTelefono = row.cliente_telefono ? phoneFromRaw(row.cliente_telefono) : null
  const clienteNombre = row.cliente_nombre ? nameFromRaw(row.cliente_nombre) : null

  if (!clienteTelefono && !clienteNombre) {
    warnings.push({
      field: 'cliente_telefono',
      message: 'El pago no tiene cliente asociado; se registrará como abono general',
    })
  }

  if (errors.length > 0) {
    return { errors, warnings }
  }

  return {
    normalized: {
      entity: 'PAGO',
      fecha: fecha!,
      monto: monto!,
      metodo: metodo ?? 'EFECTIVO',
      clienteTelefono: clienteTelefono ?? undefined,
      clienteNombre: clienteNombre ?? undefined,
      pedidoNumero: row.pedido_numero ? String(row.pedido_numero) : undefined,
      notas: stringFromRaw(row.notas) || undefined,
    },
    errors,
    warnings,
  }
}

export function validateGasto(row: RawRow): NormalizedRowWithErrors<NormalizedGasto> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const fecha = dateFromRaw(row.fecha)
  if (!fecha) {
    errors.push({ field: 'fecha', message: 'La fecha del gasto es obligatoria o inválida' })
  }

  const descripcion = stringFromRaw(row.descripcion)
  if (!descripcion) {
    errors.push({ field: 'descripcion', message: 'La descripción es obligatoria' })
  }

  const monto = moneyFromRaw(row.monto)
  if (monto === null || monto < 0) {
    errors.push({ field: 'monto', message: 'El monto debe ser un número mayor o igual a 0' })
  }

  if (errors.length > 0) {
    return { errors, warnings }
  }

  return {
    normalized: {
      entity: 'GASTO',
      fecha: fecha!,
      descripcion: descripcion!,
      monto: monto!,
      categoria: stringFromRaw(row.categoria) || undefined,
      responsable: stringFromRaw(row.responsable) || undefined,
      notas: stringFromRaw(row.notas) || undefined,
    },
    errors,
    warnings,
  }
}

export function validateEmbarque(row: RawRow): NormalizedRowWithErrors<NormalizedEmbarque> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const fecha = dateFromRaw(row.fecha)
  if (!fecha) {
    errors.push({ field: 'fecha', message: 'La fecha del embarque es obligatoria o inválida' })
  }

  if (errors.length > 0) {
    return { errors, warnings }
  }

  return {
    normalized: {
      entity: 'EMBARQUE',
      fecha: fecha!,
      repartidorNombre: stringFromRaw(row.repartidor_nombre) || undefined,
      rutaNombre: stringFromRaw(row.ruta_nombre) || undefined,
      horaSalida: stringFromRaw(row.hora_salida) || undefined,
      horaLlegada: stringFromRaw(row.hora_llegada) || undefined,
      pacasAgua: intFromRaw(row.pacas_agua) ?? undefined,
      pacasHielo: intFromRaw(row.pacas_hielo) ?? undefined,
      devueltasAgua: intFromRaw(row.devueltas_agua) ?? undefined,
      devueltasHielo: intFromRaw(row.devueltas_hielo) ?? undefined,
      rotasAgua: intFromRaw(row.rotas_agua) ?? undefined,
      rotasHielo: intFromRaw(row.rotas_hielo) ?? undefined,
      baseDinero: moneyFromRaw(row.base_dinero) ?? undefined,
      dineroEntregado: moneyFromRaw(row.dinero_entregado) ?? undefined,
      obs: stringFromRaw(row.obs) || undefined,
    },
    errors,
    warnings,
  }
}

export function validateProduccion(row: RawRow): NormalizedRowWithErrors<NormalizedProduccion> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const fecha = dateFromRaw(row.fecha)
  if (!fecha) {
    errors.push({ field: 'fecha', message: 'La fecha de producción es obligatoria o inválida' })
  }

  const turnoRaw = stringFromRaw(row.turno).toUpperCase()
  const turno = TURNO_VALUES.includes(turnoRaw as (typeof TURNO_VALUES)[number])
    ? (turnoRaw as (typeof TURNO_VALUES)[number])
    : undefined

  if (row.turno && !turno) {
    errors.push({ field: 'turno', message: `Turno "${turnoRaw}" no reconocido. Use MAÑANA, TARDE o NOCHE` })
  }

  const producto = stringFromRaw(row.producto).toUpperCase()
  const items: NormalizedProduccion['items'] = []

  if (producto) {
    if (!['PACA_AGUA', 'PACA_HIELO'].includes(producto)) {
      warnings.push({ field: 'producto', message: `Producto "${producto}" no es PACA_AGUA ni PACA_HIELO, se omitirá` })
    } else {
      items.push({
        producto,
        conteoA: intFromRaw(row.conteo_a) ?? undefined,
        conteoB: intFromRaw(row.conteo_b) ?? undefined,
        stockIni: intFromRaw(row.stock_ini) ?? undefined,
        ventas: intFromRaw(row.ventas) ?? undefined,
        filtradas: intFromRaw(row.filtradas) ?? undefined,
        rotas: intFromRaw(row.rotas) ?? undefined,
        consumoInterno: intFromRaw(row.consumo_interno) ?? undefined,
        stockFinFisico: intFromRaw(row.stock_fin_fisico) ?? undefined,
      })
    }
  }

  if (errors.length > 0) {
    return { errors, warnings }
  }

  return {
    normalized: {
      entity: 'PRODUCCION',
      fecha: fecha!,
      turno: turno!,
      trabajadorNombre: stringFromRaw(row.trabajador_nombre) || undefined,
      items,
      obs: stringFromRaw(row.obs) || undefined,
    },
    errors,
    warnings,
  }
}

export function validateCierre(row: RawRow): NormalizedRowWithErrors<NormalizedCierre> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const fecha = dateFromRaw(row.fecha)
  if (!fecha) {
    errors.push({ field: 'fecha', message: 'La fecha del cierre es obligatoria o inválida' })
  }

  if (errors.length > 0) {
    return { errors, warnings }
  }

  const result: NormalizedCierre = {
    entity: 'CIERRE',
    fecha: fecha!,
    numPedidos: intFromRaw(row.num_pedidos) ?? undefined,
    totalVentas: moneyFromRaw(row.total_ventas) ?? undefined,
    totalVentaRapida: moneyFromRaw(row.total_venta_rapida) ?? undefined,
    totalPedido: moneyFromRaw(row.total_pedido) ?? undefined,
    totalVentaLibre: moneyFromRaw(row.total_venta_libre) ?? undefined,
    fiadoVentaRapida: moneyFromRaw(row.fiado_venta_rapida) ?? undefined,
    fiadoPedido: moneyFromRaw(row.fiado_pedido) ?? undefined,
    fiadoVentaLibre: moneyFromRaw(row.fiado_venta_libre) ?? undefined,
    cobrado: moneyFromRaw(row.cobrado) ?? undefined,
    fiado: moneyFromRaw(row.fiado) ?? undefined,
    efectivo: moneyFromRaw(row.efectivo) ?? undefined,
    nequi: moneyFromRaw(row.nequi) ?? undefined,
    daviplata: moneyFromRaw(row.daviplata) ?? undefined,
    transferencia: moneyFromRaw(row.transferencia) ?? undefined,
    bono: moneyFromRaw(row.bono) ?? undefined,
    baseDia: moneyFromRaw(row.base_dia) ?? undefined,
    comisiones: moneyFromRaw(row.comisiones) ?? undefined,
    salarios: moneyFromRaw(row.salarios) ?? undefined,
    gastos: moneyFromRaw(row.gastos) ?? undefined,
    netoCaja: moneyFromRaw(row.neto_caja) ?? undefined,
    aguaVendida: intFromRaw(row.agua_vendida) ?? undefined,
    hieloVendido: intFromRaw(row.hielo_vendido) ?? undefined,
    botellonVendido: intFromRaw(row.botellon_vendido) ?? undefined,
    bolsaAguaVendida: intFromRaw(row.bolsa_agua_vendida) ?? undefined,
    bolsaHieloVendida: intFromRaw(row.bolsa_hielo_vendida) ?? undefined,
    stockIniAgua: intFromRaw(row.stock_ini_agua) ?? undefined,
    prodAgua: intFromRaw(row.prod_agua) ?? undefined,
    stockFinAgua: intFromRaw(row.stock_fin_agua) ?? undefined,
    stockIniHielo: intFromRaw(row.stock_ini_hielo) ?? undefined,
    prodHielo: intFromRaw(row.prod_hielo) ?? undefined,
    stockFinHielo: intFromRaw(row.stock_fin_hielo) ?? undefined,
    cerradoPor: stringFromRaw(row.cerrado_por) || undefined,
    horaCierre: stringFromRaw(row.hora_cierre) || undefined,
  }

  return {
    normalized: result,
    errors,
    warnings,
  }
}

export function detectWorkerPayment(rawDescription: unknown): {
  isPayment: boolean
  matchedKeywords: string[]
  suggestedCategory: string
} {
  const description = normalizeString(rawDescription).toLowerCase()
  const matched = WORKER_PAYMENT_KEYWORDS.filter((keyword) =>
    description.includes(keyword.toLowerCase())
  )
  return {
    isPayment: matched.length > 0,
    matchedKeywords: matched,
    suggestedCategory: matched.length > 0 ? 'PAGO_PERSONAL' : 'OTRO',
  }
}

export function validateProveedor(row: RawRow): NormalizedRowWithErrors<NormalizedProveedor> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const nombre = nameFromRaw(row.nombre)
  if (!nombre) {
    errors.push({ field: 'nombre', message: 'El nombre del proveedor es obligatorio' })
  }

  const nit = stringFromRaw(row.nit) || undefined
  const telefono = phoneFromRaw(row.telefono) || undefined

  if (errors.length > 0) {
    return { errors, warnings }
  }

  return {
    normalized: {
      entity: 'PROVEEDOR',
      nombre: nombre!,
      nit,
      telefono,
      email: stringFromRaw(row.email) || undefined,
      direccion: stringFromRaw(row.direccion) || undefined,
      contacto: stringFromRaw(row.contacto) || undefined,
      tipoProducto: stringFromRaw(row.tipo_producto) || undefined,
      observaciones: stringFromRaw(row.observaciones) || undefined,
    },
    errors,
    warnings,
  }
}

export function validateInsumo(row: RawRow): NormalizedRowWithErrors<NormalizedInsumo> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const nombre = nameFromRaw(row.nombre)
  if (!nombre) {
    errors.push({ field: 'nombre', message: 'El nombre del insumo es obligatorio' })
  }

  const unidad = stringFromRaw(row.unidad)
  if (!unidad) {
    errors.push({ field: 'unidad', message: 'La unidad del insumo es obligatoria' })
  }

  if (errors.length > 0) {
    return { errors, warnings }
  }

  return {
    normalized: {
      entity: 'INSUMO',
      nombre: nombre!,
      unidad,
      stock: intFromRaw(row.stock) ?? undefined,
      stockMinimo: intFromRaw(row.stock_minimo) ?? undefined,
      precioUnitario: moneyFromRaw(row.precio_unitario) ?? undefined,
    },
    errors,
    warnings,
  }
}

export function validateCompra(row: RawRow): NormalizedRowWithErrors<NormalizedCompra> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const fecha = dateFromRaw(row.fecha)
  if (!fecha) {
    errors.push({ field: 'fecha', message: 'La fecha de la compra es obligatoria o inválida' })
  }

  const insumoNombre = nameFromRaw(row.insumo)
  if (!insumoNombre) {
    errors.push({ field: 'insumo', message: 'El nombre del insumo es obligatorio' })
  }

  const cantidad = intFromRaw(row.cantidad)
  if (cantidad === null || cantidad <= 0) {
    errors.push({ field: 'cantidad', message: 'La cantidad debe ser un número mayor a 0' })
  }

  const costoUnitario = moneyFromRaw(row.costo_unitario)
  if (costoUnitario === null || costoUnitario < 0) {
    errors.push({ field: 'costo_unitario', message: 'El costo unitario debe ser un número positivo' })
  }

  if (errors.length > 0) {
    return { errors, warnings }
  }

  return {
    normalized: {
      entity: 'COMPRA',
      fecha: fecha!,
      proveedorNombre: nameFromRaw(row.proveedor) || undefined,
      proveedorNit: stringFromRaw(row.proveedor_nit) || undefined,
      insumoNombre: insumoNombre!,
      cantidad: cantidad!,
      costoUnitario: costoUnitario!,
      numeroFactura: stringFromRaw(row.numero_factura) || undefined,
    },
    errors,
    warnings,
  }
}

export function validateNomina(row: RawRow): NormalizedRowWithErrors<NormalizedNomina> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const fecha = dateFromRaw(row.fecha)
  if (!fecha) {
    errors.push({ field: 'fecha', message: 'La fecha es obligatoria o inválida' })
  }

  const trabajadorNombre = nameFromRaw(row.trabajador)
  if (!trabajadorNombre) {
    errors.push({ field: 'trabajador', message: 'El nombre del trabajador es obligatorio' })
  }

  const monto = moneyFromRaw(row.monto)
  if (monto === null || monto <= 0) {
    errors.push({ field: 'monto', message: 'El monto debe ser un número mayor a 0' })
  }

  if (errors.length > 0) {
    return { errors, warnings }
  }

  return {
    normalized: {
      entity: 'NOMINA',
      fecha: fecha!,
      trabajadorNombre: trabajadorNombre!,
      monto: monto!,
      notas: stringFromRaw(row.notas) || undefined,
    },
    errors,
    warnings,
  }
}
