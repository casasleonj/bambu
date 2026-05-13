import { z } from "zod";

// ====================
// NUEVOS ENUMS
// ====================

export const OrigenPedidoSchema = z.enum(['PEDIDO', 'VENTA_RAPIDA', 'VENTA_LIBRE'])
export const EstadoEntregaSchema = z.enum(['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO', 'CANCELADO', 'ANULADO'])
export const EstadoPagoSchema = z.enum(['PENDIENTE', 'PARCIAL', 'PAGADO', 'ANTICIPADO', 'VENCIDO'])

// ====================
// PEDIDO ITEM (nuevo)
// ====================

export const PedidoItemSchema = z.object({
  producto: z.enum(['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO']),
  cantidad: z.coerce.number().int().min(0),
  precioManual: z.number().min(0).optional(),
})

// ====================
// CREAR PEDIDO (actualizado)
// ====================

export const PedidoCreateSchema = z.object({
  clienteId: z.string().min(1),
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
    telefono: z.string().min(1),
    direccion: z.string().optional(),
    barrio: z.string().optional(),
  }).optional(),
});

// ====================
// ENTREGA (nuevo)
// ====================

export const EntregaSchema = z.object({
  pedidoId: z.string().min(1),
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
  fotoEntrega: z.string().optional(),
  gpsLat: z.number().optional(),
  gpsLng: z.number().optional(),
  codigoVisita: z.string().optional(),
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
  fotoEntrega: z.string().min(1, 'Foto de entrega obligatoria'),
  gpsLat: z.number(),
  gpsLng: z.number(),
  offlineId: z.string(),
})

// ====================
// ANULAR (nuevo)
// ====================

export const AnularSchema = z.object({
  motivo: z.enum(['DEVOLUCION', 'ERROR', 'FRAUDE', 'OTRO']),
  devolverStock: z.boolean().default(false),
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
  items: z.array(PedidoItemSchema).optional(),
})

// ====================
// CLIENTE
// ====================

export const ClienteQuickCreateSchema = z.object({
  nombre: z.string().min(2, 'Nombre requerido'),
  telefono: z.string().min(7, 'Celular requerido'),
  direccion: z.string().min(3, 'Dirección requerida'),
  barrio: z.string().optional(),
})

export const ClienteCreateSchema = z.object({
  nombre: z.string().min(1).max(100),
  apellido: z.string().max(100).optional(),
  telefono: z.string().min(1).max(20),
  nombreNegocio: z.string().max(100).optional(),
  tipoNegocio: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().max(100).optional()
  ),
  barrio: z.string().max(100).optional(),
  direccion: z.string().max(200).optional(),
  frecuencia: z.enum(['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL', 'NINGUNA']).optional(),
  cadaNDias: z.coerce.number().int().min(0).optional().transform(v => v === 0 ? undefined : v),
  preciosEspeciales: z.string().optional(),
  notas: z.string().max(500).optional(),
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
});

export const InsumoCreateSchema = z.object({
  nombre: z.string().min(1).max(100),
  unidad: z.enum(['UNIDAD', 'LITRO', 'KG', 'PACA', 'BOLSA', 'CAJA', 'MTS', 'GALON']).optional(),
  stock: z.coerce.number().min(0).optional(),
  stockMin: z.coerce.number().min(0).optional(),
  precioUnit: z.coerce.number().min(0).optional(),
  proveedorId: z.string().min(1).optional(),
});

export const CompraCreateSchema = z.object({
  proveedorId: z.string().min(1),
  insumoId: z.string().min(1),
  cantidad: z.coerce.number().positive(),
  montoTotal: z.coerce.number().positive(),
  notas: z.string().optional(),
});

export const ProduccionCreateSchema = z.object({
  fecha: z.string().datetime().optional(),
  turno: z.enum(["MANANA", "TARDE", "NOCHE"]),
  trabajadorId: z.string().min(1),
  conteoAAgua: z.coerce.number().int().min(0),
  conteoBAgua: z.coerce.number().int().min(0),
  conteoAHielo: z.coerce.number().int().min(0),
  conteoBHielo: z.coerce.number().int().min(0),
  stockFinFisicoAgua: z.coerce.number().int().min(0).default(0),
  stockFinFisicoHielo: z.coerce.number().int().min(0).default(0),
  filtradasAgua: z.coerce.number().int().min(0).default(0),
  filtradasHielo: z.coerce.number().int().min(0).default(0),
  rotasAgua: z.coerce.number().int().min(0).default(0),
  rotasHielo: z.coerce.number().int().min(0).default(0),
  consumoInternoAgua: z.coerce.number().int().min(0).default(0),
  consumoInternoHielo: z.coerce.number().int().min(0).default(0),
  obs: z.string().max(500).optional(),
});

export const NominaCreateSchema = z.object({
  trabajadorId: z.string().min(1),
  fechaInicio: z.string(),
  fechaFin: z.string(),
  tipoCalculo: z.enum(['AUTO', 'MANUAL']).optional(),
  comEntregasAgua: z.coerce.number().min(0).optional(),
  comEntregasHielo: z.coerce.number().min(0).optional(),
  comEntregasBotellon: z.coerce.number().min(0).optional(),
  totalComisiones: z.coerce.number().min(0).optional(),
  salario: z.coerce.number().min(0).optional(),
  total: z.coerce.number().positive().optional(),
});

export const CierreCreateSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  numPedidos: z.coerce.number().int().min(0),
  totalVentas: z.coerce.number().min(0),
  cobrado: z.coerce.number().min(0),
  fiado: z.coerce.number().min(0),
  efectivo: z.coerce.number().min(0),
  transferencia: z.coerce.number().min(0),
  nequi: z.coerce.number().min(0),
  daviplata: z.coerce.number().min(0),
  bono: z.coerce.number().min(0),
  baseDia: z.coerce.number().min(0),
  comisiones: z.coerce.number().min(0),
  salarios: z.coerce.number().min(0),
  gastos: z.coerce.number().min(0),
  stockIniAgua: z.coerce.number().int().min(0),
  prodAgua: z.coerce.number().int().min(0),
  stockFinAgua: z.coerce.number().int().min(0),
  stockIniHielo: z.coerce.number().int().min(0),
  prodHielo: z.coerce.number().int().min(0),
  stockFinHielo: z.coerce.number().int().min(0),
  netoCaja: z.coerce.number().min(0),
  reporte: z.string().optional(),
});

export const ConfigCreateSchema = z.object({
  clave: z.string().min(1).max(100),
  valor: z.string(),
});

// ====================
// EMBARQUE
// ====================

export const EmbarqueCreateSchema = z.object({
  trabajadorId: z.string().min(1),
  rutaId: z.string().optional(),
  horaSalida: z.string().optional(),
  obs: z.string().max(500).optional(),
  pacasAgua: z.coerce.number().int().min(0).default(0),
  pacasHielo: z.coerce.number().int().min(0).default(0),
  devueltasAgua: z.coerce.number().int().min(0).default(0),
  devueltasHielo: z.coerce.number().int().min(0).default(0),
  rotasAgua: z.coerce.number().int().min(0).default(0),
  rotasHielo: z.coerce.number().int().min(0).default(0),
});

export const EmbarqueUpdateSchema = z.object({
  estado: z.enum(['ABIERTO', 'CERRADO', 'CANCELADO']).nullable().optional(),
  horaLlegada: z.string().nullable().optional(),
  obs: z.string().max(500).nullable().optional(),
  pedidoIds: z.array(z.string().min(1)).max(100).nullable().optional(),
  pacasAgua: z.coerce.number().int().min(0).nullable().optional(),
  pacasHielo: z.coerce.number().int().min(0).nullable().optional(),
  devueltasAgua: z.coerce.number().int().min(0).nullable().optional(),
  devueltasHielo: z.coerce.number().int().min(0).nullable().optional(),
  rotasAgua: z.coerce.number().int().min(0).nullable().optional(),
  rotasHielo: z.coerce.number().int().min(0).nullable().optional(),
});

// ====================
// FACTURA / PROVEEDOR / TRABAJADOR
// ====================

export const FacturaCreateSchema = z.object({
  pedidoId: z.string().min(1),
  clienteId: z.string().min(1),
});

export const ProveedorCreateSchema = z.object({
  nombre: z.string().min(1).max(100),
  telefono: z.string().max(20).optional(),
  email: z.string().email().optional(),
  direccion: z.string().max(200).optional(),
});

export const ProveedorUpdateSchema = ProveedorCreateSchema.partial();

const TrabajadorBaseSchema = z.object({
  nombre: z.string().min(1).max(100),
  rol: z.enum(['SELLADOR', 'REPARTIDOR', 'ADMIN', 'CONTADOR']),
  tipoPago: z.enum(['COMISION', 'FIJO', 'MIXTO']).optional(),
  usaMoto: z.boolean().optional(),
  capacidadKg: z.coerce.number().int().min(0).max(5000).optional(),
  comPacaAgua: z.coerce.number().min(0).optional(),
  comPacaHielo: z.coerce.number().min(0).optional(),
  comBotellon: z.coerce.number().min(0).optional(),
  salarioFijo: z.coerce.number().min(0).optional(),
  telefono: z.string().max(20).optional(),
})

export const TrabajadorCreateSchema = TrabajadorBaseSchema.refine(
  (data) => !(data.usaMoto && (!data.capacidadKg || data.capacidadKg <= 0)),
  { message: 'Capacidad es requerida cuando usa moto', path: ['capacidadKg'] }
)

export const TrabajadorUpdateSchema = TrabajadorBaseSchema.partial()

// ====================
// PAGAR FIADO
// ====================

export const PagarFiadoSchema = z.object({
  clienteId: z.string().min(1),
  monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
  metodo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO']),
})