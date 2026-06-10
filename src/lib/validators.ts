import { z } from "zod";

// ====================
// NUEVOS ENUMS
// ====================

export const OrigenPedidoSchema = z.enum(['PEDIDO', 'VENTA_RAPIDA', 'VENTA_LIBRE'])
export const EstadoEntregaSchema = z.enum(['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO', 'CANCELADO', 'ANULADO'])
export const EstadoPagoSchema = z.enum(['PENDIENTE', 'PARCIAL', 'PAGADO', 'ANTICIPADO', 'VENCIDO', 'ANULADO'])

// ====================
// PEDIDO ITEM (nuevo)
// ====================

export const PedidoItemSchema = z.object({
  producto: z.enum(['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO']),
  cantidad: z.coerce.number().int().min(0),
  precioManual: z.number().min(0).optional().refine(
    val => val === undefined || val > 0,
    { message: 'Precio manual debe ser mayor a 0' }
  ),
})

// ====================
// CREAR PEDIDO (actualizado)
// ====================

export const PedidoCreateSchema = z.object({
  clienteId: z.string().min(1),
  negocioId: z.string().min(1).optional(),
  canal: z.enum(['PUNTO', 'DOMICILIO']).optional().default('DOMICILIO'),
  origen: OrigenPedidoSchema.optional().default('PEDIDO'),
  items: z.array(PedidoItemSchema).min(1, 'Agrega al menos un producto'),
  preciosManuales: z.record(z.string(), z.number().min(0, 'Precio manual no puede ser negativo')).optional(),
  pagos: z.array(
    z.object({
      metodo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO']),
      monto: z.coerce.number().min(0),
    })
  ).optional(),
  obs: z.string().max(500).optional(),
  fechaEntrega: z.string().optional(),
  // Offline-first: id generado por el cliente para dedup si se encola
  offlineId: z.string().optional(),
  // LEGACY (mantener durante transición)
  ventaRapida: z.boolean().optional(),
  tipo: z.enum(['ENVIO', 'PUNTO']).optional(),
  productos: z.object({
    pacaAgua: z.coerce.number().int().min(0).optional(),
    pacaHielo: z.coerce.number().int().min(0).optional(),
    botellon: z.coerce.number().int().min(0).optional(),
    bolsaAgua: z.coerce.number().int().min(0).optional(),
    bolsaHielo: z.coerce.number().int().min(0).optional(),
  }).optional(),
  clienteNuevo: z.object({
    nombre: z.string().min(1),
    apellido: z.string().optional(),
    telefono: z.string().min(1),
    direccion: z.string().optional(),
    barrio: z.string().optional(),
    fuente: z.string().optional(),
  }).optional(),
  actualizarCliente: z.object({
    direccion: z.string().min(1),
    barrio: z.string().min(1),
  }).optional(),
});

// ====================
// ENTREGA (nuevo)
// ====================

export const EntregaSchema = z.object({
  // pedidoId is intentionally NOT required here — the route uses params.id from
  // the URL path (/api/pedidos/[id]/entrega). Kept as optional for clients
  // that still send it (backward compat) but ignored by the server.
  pedidoId: z.string().optional(),
  tipo: z.enum(['COMPLETO', 'PARCIAL', 'NO_ENTREGADO']),
  itemsEntregados: z.array(z.object({
    producto: z.string(),
    cantidad: z.number().int().min(0),
  })).optional(),
  pagos: z.array(z.object({
    metodo: z.string(),
    monto: z.number().min(0),
  })).optional(),
  nuevoEmbarqueId: z.string().optional(),
  // fotoEntrega size cap: 15MB covers a 10MB file with ~33% base64 overhead + buffer.
  // DoS protection: prevents a malicious client from sending 100MB+ payloads that
  // would crash JSON parsing or bloat the Postgres TEXT column.
  fotoEntrega: z.string().max(15 * 1024 * 1024, 'Foto demasiado grande (máx 15MB)').optional(),
  gpsLat: z.number().optional(),
  gpsLng: z.number().optional(),
  codigoVisita: z.string().optional(),
  // Offline-first: dedup si la request se encola y se reintenta
  offlineId: z.string().optional(),
})

// ====================
// VENTA LIBRE (nuevo)
// ====================

export const VentaLibreSchema = z.object({
  clienteId: z.string().min(1),
  items: z.array(PedidoItemSchema).min(1),
  pagos: z.array(z.object({
    metodo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO']),
    monto: z.coerce.number().min(0),
  })).optional(),
  embarqueId: z.string().min(1),
  obs: z.string().optional(),
  // fotoEntrega: required for venta-libre + size cap to prevent DoS.
  fotoEntrega: z.string()
    .min(1, 'Foto de entrega obligatoria')
    .max(15 * 1024 * 1024, 'Foto demasiado grande (máx 15MB)'),
  gpsLat: z.number(),
  gpsLng: z.number(),
  offlineId: z.string(),
})

// ====================
// ANULAR (nuevo)
// ====================

export const AnularSchema = z.object({
  motivo: z.string().min(1, 'El motivo es obligatorio'),
  devolverStock: z.boolean().default(false),
  // Offline-first: dedup si la request se encola y se reintenta
  offlineId: z.string().optional(),
})

// ====================
// ACTUALIZAR PEDIDO (actualizado)
// ====================

export const PedidoUpdateSchema = z.object({
  // LEGACY
  estado: z.enum(['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO', 'CANCELADO', 'ANULADO']).optional(),
  embarqueId: z.string().optional().nullable(),
  cPacaAguaEnt: z.coerce.number().int().min(0).optional(),
  cPacaHieloEnt: z.coerce.number().int().min(0).optional(),
  cBotellonFabEnt: z.coerce.number().int().min(0).optional(),
  cBotellonDomEnt: z.coerce.number().int().min(0).optional(),
  cBolsaAguaEnt: z.coerce.number().int().min(0).optional(),
  cBolsaHieloEnt: z.coerce.number().int().min(0).optional(),
  // NUEVOS
  estadoEntrega: EstadoEntregaSchema.optional(),
  estadoPago: EstadoPagoSchema.optional(),
  promesaPagoFecha: z.string().optional(),
  obs: z.string().max(500).optional().nullable(),
  actualizarCliente: z.object({
    direccion: z.string().min(1),
    barrio: z.string().min(1),
  }).optional(),
  items: z.array(PedidoItemSchema).optional(),
  // Offline-first: dedup si la request se encola y se reintenta
  offlineId: z.string().optional(),
})

// ====================
// CLIENTE
// ====================

export const ClienteQuickCreateSchema = z.object({
  nombre: z.string().min(2, 'Nombre requerido'),
  apellido: z.string().optional(),
  telefono: z.string().min(7, 'Celular requerido'),
  direccion: z.string().min(3, 'Dirección requerida'),
  barrio: z.string().optional(),
  // Offline-first dedup (F-N5): si la request llega con un offlineId ya
  // existente, el server devuelve el cliente existente en vez de duplicar.
  offlineId: z.string().optional(),
})

export const ContactoAlternativoSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  telefono: z.string().min(7, 'Teléfono inválido'),
  relacion: z.string().optional(),
})

export const ClienteCreateSchema = z.object({
  nombre: z.string().min(1).max(100),
  apellido: z.string().max(100).optional(),
  telefono: z.string().min(1).max(20),
  fuente: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().max(100).optional()
  ),
  barrio: z.string().max(100).optional(),
  direccion: z.string().max(200).optional(),
  linkUbicacion: z.string().url().optional().nullable(),
  // FASE 3 CONTRACT: campo `contactos` eliminado del schema.
  // Los contactos ahora se manejan via tabla ContactoCliente (relación Prisma).
  preciosEspeciales: z.string().optional(),
  notas: z.string().max(500).optional(),
  limitePedidosFiados: z.coerce.number().int().min(1).max(20).optional(),
  verificado: z.boolean().optional(),
  bloqueado: z.boolean().optional(),
  // Offline-first: dedup key. Si el mismo offlineId llega de nuevo, el server
  // devuelve el cliente creado en lugar de duplicar.
  offlineId: z.string().optional(),
});

export const ClienteUpdateSchema = ClienteCreateSchema.partial();

// ====================
// ABONO / GASTO / INSUMO / COMPRA / PRODUCCION / NOMINA / CIERRE
// ====================

export const AbonoCreateSchema = z.object({
  facturaId: z.string().min(1),
  clienteId: z.string().min(1),
  pedidoId: z.string().min(1).optional(),
  monto: z.coerce.number().positive(),
  metodoPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "NEQUI", "DAVIPLATA", "BONO"]),
});

export const GastoCreateSchema = z.object({
  categoria: z.enum(['ARRIENDO', 'SERVICIOS', 'INSUMOS', 'MANTENIMIENTO', 'TRANSPORTE', 'NOMINA', 'OTRO']),
  descripcion: z.string().min(1).max(200),
  monto: z.coerce.number().positive(),
  responsable: z.string().max(100).optional(),
  notas: z.string().max(500).optional(),
  fecha: z.string().optional(),
  embarqueId: z.string().optional(),
});

export const InsumoCreateSchema = z.object({
  nombre: z.string().min(1).max(100),
  unidad: z.enum(['UNIDAD', 'LITRO', 'KG', 'PACA', 'BOLSA', 'CAJA', 'MTS', 'GALON']).optional(),
  stock: z.coerce.number().min(0).optional(),
  stockMin: z.coerce.number().min(0).optional(),
  precioUnit: z.coerce.number().min(0).optional(),
  proveedorId: z.string().min(1).nullish(),
});

export const InsumoUpdateSchema = InsumoCreateSchema.partial();

export const CompraCreateSchema = z.object({
  proveedorId: z.string().min(1),
  insumoId: z.string().min(1),
  cantidad: z.coerce.number().positive(),
  montoTotal: z.coerce.number().positive(),
  notas: z.string().optional(),
});

export const ProduccionItemCreateSchema = z.object({
  producto: z.enum(['PACA_AGUA', 'PACA_HIELO']),
  stockIni: z.coerce.number().int().min(0).default(0),
  conteoA: z.coerce.number().int().min(0),
  conteoB: z.coerce.number().int().min(0),
  stockFinFisico: z.coerce.number().int().min(0).default(0),
  filtradas: z.coerce.number().int().min(0).default(0),
  rotas: z.coerce.number().int().min(0).default(0),
  consumoInterno: z.coerce.number().int().min(0).default(0),
}).strict();

export const ProduccionCreateSchema = z.object({
  // NOTA: la fecha la determina el servidor (medianoche Bogotá del día actual).
  // No se acepta fecha del cliente para evitar inconsistencias con la TZ.
  turno: z.enum(["MANANA", "TARDE", "NOCHE"]),
  trabajadorId: z.string().min(1),
  // Items: exactamente 2 (PACA_AGUA, PACA_HIELO). El server completa el
  // resto (producido, stockIni, ventas, stockFinEsperado, diferencia).
  items: z.array(ProduccionItemCreateSchema).length(2),
  obs: z.string().max(500).optional(),
  // Offline-first: si la request se encola offline y se reintenta, el server
  // detecta el duplicado via offlineId y devuelve la Produccion existente.
  offlineId: z.string().min(1).max(64).optional(),
}).strict().refine(
  (data) => {
    const productos = data.items.map(i => i.producto).sort()
    return JSON.stringify(productos) === JSON.stringify(['PACA_AGUA', 'PACA_HIELO'])
  },
  { message: 'items debe contener exactamente PACA_AGUA y PACA_HIELO' },
);

/**
 * Schema para PUT /api/produccion/[id] — correcciones del mismo día.
 * Todos los campos opcionales; el handler valida que al menos uno esté presente.
 * trabajadorId NO se puede cambiar (la Produccion ya está asociada).
 * Los items[] siguen siendo exactamente 2 (PACA_AGUA + PACA_HIELO).
 */
export const ProduccionItemUpdateSchema = z.object({
  producto: z.enum(['PACA_AGUA', 'PACA_HIELO']),
  conteoA: z.coerce.number().int().min(0).optional(),
  conteoB: z.coerce.number().int().min(0).optional(),
  stockFinFisico: z.coerce.number().int().min(0).optional(),
  filtradas: z.coerce.number().int().min(0).optional(),
  rotas: z.coerce.number().int().min(0).optional(),
  consumoInterno: z.coerce.number().int().min(0).optional(),
}).strict();

export const ProduccionUpdateSchema = z.object({
  items: z.array(ProduccionItemUpdateSchema).length(2).optional(),
  obs: z.string().max(500).optional(),
  // El cliente puede pasar obs='' explícitamente para "borrar" la observación.
  // Si no se envía obs, no se modifica.
}).strict().refine(
  (data) => data.items !== undefined || data.obs !== undefined,
  { message: 'Debe enviar al menos un campo (items u obs)' },
).refine(
  (data) => {
    if (!data.items) return true
    const productos = data.items.map(i => i.producto).sort()
    return JSON.stringify(productos) === JSON.stringify(['PACA_AGUA', 'PACA_HIELO'])
  },
  { message: 'items debe contener exactamente PACA_AGUA y PACA_HIELO' },
);

export const NominaCreateSchema = z.object({
  trabajadorId: z.string().min(1),
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido, use YYYY-MM-DD'),
  fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido, use YYYY-MM-DD'),
  tipoCalculo: z.enum(['AUTO', 'MANUAL']).optional(),
  comEntregasAgua: z.coerce.number().min(0).optional(),
  comEntregasHielo: z.coerce.number().min(0).optional(),
  comEntregasBotellon: z.coerce.number().min(0).optional(),
  totalComisiones: z.coerce.number().min(0).optional(),
  salario: z.coerce.number().min(0).optional(),
  total: z.coerce.number().positive().optional(),
}).refine((data) => data.fechaFin >= data.fechaInicio, {
  message: 'La fecha fin debe ser posterior o igual a la fecha inicio',
  path: ['fechaFin'],
});

export const CierreCreateSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Client only sends data the server CANNOT calculate:
  baseDia: z.coerce.number().min(0),
  stockIniAgua: z.coerce.number().int().min(0),
  prodAgua: z.coerce.number().int().min(0),
  stockFinAgua: z.coerce.number().int().min(0),
  stockIniHielo: z.coerce.number().int().min(0),
  prodHielo: z.coerce.number().int().min(0),
  stockFinHielo: z.coerce.number().int().min(0),
  comisiones: z.coerce.number().min(0),
  salarios: z.coerce.number().min(0),
  reporte: z.string().optional(),
}).strict() // Reject extra fields like netoCaja, totalVentas, etc.

export const ConfigCreateSchema = z.object({
  clave: z.string().min(1).max(100),
  valor: z.string(),
});

// ====================
// EMBARQUE
// ====================

export const EmbarqueProductoSchema = z.object({
  producto: z.enum(['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO']),
  cargadas: z.coerce.number().int().min(0).default(0),
})

export const EmbarqueCreateSchema = z.object({
  trabajadorId: z.string().min(1),
  rutaId: z.string().optional(),
  tipoMoto: z.string().optional(),
  horaSalida: z.string().min(1, 'Hora de salida requerida'),
  baseDinero: z.coerce.number().min(0).default(0),
  obs: z.string().max(500).optional(),
  carga: z.array(EmbarqueProductoSchema).min(1, 'Agrega al menos un producto'),
  overrideMotivo: z.string().max(500).optional(),
})

export const EmbarqueUpdateSchema = z.object({
  estado: z.enum(['ABIERTO', 'EN_RUTA', 'CERRADO', 'CANCELADO']).nullish(),
  horaLlegada: z.string().nullish(),
  horaSalida: z.string().nullish(),
  obs: z.string().max(500).nullish(),
  pedidoIds: z.array(z.string().min(1)).max(100).nullish(),
  // Legacy fields
  pacasAgua: z.coerce.number().int().min(0).nullish(),
  pacasHielo: z.coerce.number().int().min(0).nullish(),
  devueltasAgua: z.coerce.number().int().min(0).nullish(),
  devueltasHielo: z.coerce.number().int().min(0).nullish(),
  rotasAgua: z.coerce.number().int().min(0).nullish(),
  rotasHielo: z.coerce.number().int().min(0).nullish(),
  // Editable fields (ABIERTO only)
  trabajadorId: z.string().min(1).nullish(),
  rutaId: z.string().nullish(),
  tipoMoto: z.string().nullish(),
  baseDinero: z.coerce.number().min(0).nullish(),
  // Carga (productos) — replaces existing EmbarqueProducto records
  carga: z.array(EmbarqueProductoSchema).nullish(),
  // Offline-first: dedup key. If same offlineId arrives again, server detects
  // action was already applied and returns current state.
  offlineId: z.string().optional(),
})

export const GastoEmbarqueSchema = z.object({
  categoria: z.string().min(1),
  monto: z.coerce.number().positive(),
  nota: z.string().max(500).optional(),
})

export const CerrarEmbarqueSchema = z.object({
  pedidos: z.array(z.object({
    pedidoId: z.string().min(1),
    entregado: z.enum(['COMPLETO', 'PARCIAL', 'NO_ENTREGADO']),
    productosEntregados: z.object({
      cPacaAguaEnt: z.number().int().min(0).nullish().default(0),
      cPacaHieloEnt: z.number().int().min(0).nullish().default(0),
      cBotellonFabEnt: z.number().int().min(0).nullish().default(0),
      cBotellonDomEnt: z.number().int().min(0).nullish().default(0),
      cBolsaAguaEnt: z.number().int().min(0).nullish().default(0),
      cBolsaHieloEnt: z.number().int().min(0).nullish().default(0),
    }).nullish(),
    preciosReales: z.object({
      pacaAgua: z.number().min(0).nullish().default(0),
      pacaHielo: z.number().min(0).nullish().default(0),
      botellonFab: z.number().min(0).nullish().default(0),
      botellonDom: z.number().min(0).nullish().default(0),
      bolsaAgua: z.number().min(0).nullish().default(0),
      bolsaHielo: z.number().min(0).nullish().default(0),
    }).nullish(),
    pagado: z.enum(['COMPLETO', 'PARCIAL', 'NO_PAGADO']),
    pagos: z.array(z.object({
      metodo: z.string(),
      monto: z.number().min(0).nullish().default(0),
    })).default([]),
    nuevoEmbarqueId: z.string().nullish(),
  })),
  ventasLibres: z.array(z.object({
    clienteId: z.string().min(1),
    cPacaAgua: z.number().int().min(0).nullish().default(0),
    cPacaHielo: z.number().int().min(0).nullish().default(0),
    cBotellonFab: z.number().int().min(0).nullish().default(0),
    cBotellonDom: z.number().int().min(0).nullish().default(0),
    cBolsaAgua: z.number().int().min(0).nullish().default(0),
    cBolsaHielo: z.number().int().min(0).nullish().default(0),
    pagos: z.array(z.object({
      metodo: z.string(),
      monto: z.number().min(0).nullish().default(0),
    })).default([]),
    obs: z.string().optional(),
  })).optional().default([]),
  productos: z.array(z.object({
    producto: z.enum(['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO']),
    devueltas: z.coerce.number().int().min(0).default(0),
    cambios: z.coerce.number().int().min(0).default(0),
    rotas: z.coerce.number().int().min(0).default(0),
  })).min(1, 'Agrega al menos un producto en conciliación'),
  gastos: z.array(GastoEmbarqueSchema).optional().default([]),
  dineroEntregado: z.coerce.number().min(0).default(0),
  justificacionDiscrepancia: z.string().optional(),
  obs: z.string().optional(),
})

// ====================
// FACTURA / PROVEEDOR / TRABAJADOR
// ====================

export const FacturaCreateSchema = z.object({
  pedidoId: z.string().min(1),
  clienteId: z.string().min(1),
});

export const ResumenFacturasQuerySchema = z.object({
  clienteId: z.string().min(1),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido, use YYYY-MM-DD'),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido, use YYYY-MM-DD'),
}).refine((data) => data.hasta >= data.desde, {
  message: 'La fecha hasta debe ser posterior o igual a la fecha desde',
  path: ['hasta'],
});

export const ProveedorCreateSchema = z.object({
  nombre: z.string().min(1).max(100),
  telefono: z.string().max(20).optional(),
  email: z.string().email().optional(),
  direccion: z.string().max(200).optional(),
  tipoProducto: z.string().max(100).optional(),
  observaciones: z.string().max(500).optional(),
});

export const ProveedorUpdateSchema = ProveedorCreateSchema.partial();

const TrabajadorBaseObject = z.object({
  nombre: z.string().min(1).max(100),
  rol: z.enum(['SELLADOR', 'REPARTIDOR', 'ADMIN', 'CONTADOR']),
  tipoPago: z.enum(['COMISION', 'FIJO', 'MIXTO']).optional(),
  usaMoto: z.boolean().optional(),
  capacidadKg: z.coerce.number().int().min(0).max(5000).optional(),
  comPacaAgua: z.coerce.number().min(0).optional(),
  comPacaHielo: z.coerce.number().min(0).optional(),
  comBotellon: z.coerce.number().min(0).optional(),
  comRepartAgua: z.coerce.number().min(0).optional(),
  comRepartHielo: z.coerce.number().min(0).optional(),
  comRepartBotellon: z.coerce.number().min(0).optional(),
  salarioFijo: z.coerce.number().min(0).optional(),
  telefono: z.string().max(20).optional(),
})

export function normalizeTrabajador<T extends { usaMoto?: boolean | null; tipoPago?: string; rol?: string; comPacaAgua?: number; comPacaHielo?: number; comBotellon?: number; comRepartAgua?: number; comRepartHielo?: number; comRepartBotellon?: number; capacidadKg?: number }>(data: T): T {
  const isAdminOrContador = data.rol === 'ADMIN' || data.rol === 'CONTADOR'
  const noMoto = !data.usaMoto || isAdminOrContador

  if (noMoto) {
    return {
      ...data,
      tipoPago: 'FIJO',
      capacidadKg: 0,
      usaMoto: false,
      comRepartAgua: 0,
      comRepartHielo: 0,
      comRepartBotellon: 0,
    }
  }
  return data
}

export const TrabajadorCreateSchema = TrabajadorBaseObject.refine(
  (data) => !(data.usaMoto && (!data.capacidadKg || data.capacidadKg <= 0)),
  { message: 'Capacidad es requerida cuando usa moto', path: ['capacidadKg'] }
)

export const TrabajadorUpdateSchema = TrabajadorBaseObject.partial()

// ====================
// PAGAR FIADO
// ====================

export const PagarFiadoSchema = z.object({
  clienteId: z.string().min(1),
  monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
  metodo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO']),
  // Offline-first: dedup por batchId (compartido por todos los Pagos del batch)
  offlineId: z.string().optional(),
})

// ====================
// USUARIOS / PERFIL
// ====================

export const ProfileUpdateSchema = z.object({
  username: z.string().min(3, 'Usuario debe tener al menos 3 caracteres').max(50).optional(),
  nombre: z.string().min(1, 'Nombre requerido').max(100).optional(),
  apellido: z.string().max(100).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, 'Contraseña debe tener al menos 6 caracteres').optional(),
  confirmNewPassword: z.string().optional(),
}).refine(
  (data) => {
    if (data.newPassword || data.confirmNewPassword) {
      return !!data.currentPassword
    }
    return true
  },
  { message: 'Contraseña actual requerida para cambiar contraseña', path: ['currentPassword'] }
).refine(
  (data) => {
    if (data.newPassword && data.confirmNewPassword) {
      return data.newPassword === data.confirmNewPassword
    }
    return true
  },
  { message: 'Las contraseñas nuevas no coinciden', path: ['confirmNewPassword'] }
).refine(
  (data) => {
    if (data.newPassword && !data.confirmNewPassword) return false
    return true
  },
  { message: 'Confirma la nueva contraseña', path: ['confirmNewPassword'] }
)

export const UserCreateSchema = z.object({
  username: z.string().min(3, 'Usuario debe tener al menos 3 caracteres').max(50),
  password: z.string().min(6, 'Contraseña debe tener al menos 6 caracteres'),
  rol: z.enum(['ADMIN', 'ASISTENTE', 'CONTADOR', 'REPARTIDOR', 'SELLADOR']),
  nombre: z.string().min(1, 'Nombre requerido').max(100),
  apellido: z.string().max(100),
})

export const UserUpdateSchema = z.object({
  username: z.string().min(3, 'Usuario debe tener al menos 3 caracteres').max(50).optional(),
  rol: z.enum(['ADMIN', 'ASISTENTE', 'CONTADOR', 'REPARTIDOR', 'SELLADOR']).optional(),
  activo: z.boolean().optional(),
  password: z.string().min(6, 'Contraseña debe tener al menos 6 caracteres').optional(),
  nombre: z.string().min(1, 'Nombre requerido').max(100).optional(),
  apellido: z.string().max(100).optional(),
})

// ====================
// DEUDAS TRABAJADOR
// ====================

export const DeudaTipoSchema = z.enum(['PRESTAMO', 'DEFICIT_EFECTIVO', 'OTRO'])

export const DeudaCreateSchema = z.object({
  trabajadorId: z.string().min(1),
  tipo: DeudaTipoSchema,
  monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
  descripcion: z.string().min(1, 'La descripcion es obligatoria').max(500),
  embarqueId: z.string().optional(),
})

export const DeudaUpdateSchema = z.object({
  montoPendiente: z.coerce.number().min(0).optional(),
  descripcion: z.string().min(1).max(500).optional(),
})

export const AbonoDeudaSchema = z.object({
  monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
  nota: z.string().max(500).optional(),
})