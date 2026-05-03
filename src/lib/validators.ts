import { z } from "zod";

export const PedidoCreateSchema = z.object({
  clienteId: z.string().min(1),
  canal: z.enum(['PUNTO', 'DOMICILIO']).optional().default('DOMICILIO'),
  productos: z.object({
    pacaAgua: z.coerce.number().int().min(0).optional(),
    pacaHielo: z.coerce.number().int().min(0).optional(),
    botellonFab: z.coerce.number().int().min(0).optional(),
    botellonDom: z.coerce.number().int().min(0).optional(),
    bolsaAgua: z.coerce.number().int().min(0).optional(),
    bolsaHielo: z.coerce.number().int().min(0).optional(),
  }).optional(),
  preciosManuales: z.record(z.string(), z.number().min(0, 'Precio manual no puede ser negativo')).optional(),
  pagos: z.array(
    z.object({
      metodo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO']),
      monto: z.coerce.number().min(0),
    })
  ).optional(),
  obs: z.string().max(500).optional(),
  fechaEntrega: z.string().optional(),
  ventaRapida: z.boolean().optional(),
  tipo: z.enum(['ENVIO', 'PUNTO']).optional(),
  clienteNuevo: z.object({
    nombre: z.string().min(1),
    telefono: z.string().min(1),
    direccion: z.string().optional(),
    barrio: z.string().optional(),
  }).optional(),
});

export const ClienteQuickCreateSchema = z.object({
  nombre: z.string().min(2, 'Nombre requerido'),
  telefono: z.string().min(7, 'Celular requerido'),
  direccion: z.string().min(3, 'Dirección requerida'),
  barrio: z.string().optional(),
})

export const PedidoUpdateSchema = z.object({
  estado: z.enum(['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'CANCELADO', 'ANULADO']).optional(),
  embarqueId: z.string().optional().nullable(),
  cPacaAguaEnt: z.coerce.number().int().min(0).optional(),
  cPacaHieloEnt: z.coerce.number().int().min(0).optional(),
  cBotellonFabEnt: z.coerce.number().int().min(0).optional(),
  cBotellonDomEnt: z.coerce.number().int().min(0).optional(),
  cBolsaAguaEnt: z.coerce.number().int().min(0).optional(),
  cBolsaHieloEnt: z.coerce.number().int().min(0).optional(),
});

export const ClienteCreateSchema = z.object({
  nombre: z.string().min(1).max(100),
  apellido: z.string().max(100).optional(),
  telefono: z.string().min(1).max(20),
  nombreNegocio: z.string().max(100).optional(),
  tipoNegocio: z.string().max(50).optional(),
  barrio: z.string().max(100).optional(),
  direccion: z.string().max(200).optional(),
  frecuencia: z.string().max(20).optional(),
  cadaNDias: z.coerce.number().int().min(0).optional().transform(v => v === 0 ? undefined : v),
  preciosEspeciales: z.string().optional(),
  notas: z.string().max(500).optional(),
});

export const AbonoCreateSchema = z.object({
  facturaId: z.string().min(1),
  clienteId: z.string().min(1),
  monto: z.coerce.number().positive(),
  metodoPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "NEQUI", "DAVIPLATA", "BONO"]),
});

export const GastoCreateSchema = z.object({
  categoria: z.string().min(1).max(100),
  descripcion: z.string().min(1).max(200),
  monto: z.coerce.number().positive(),
  responsable: z.string().max(100).optional(),
  notas: z.string().max(500).optional(),
  fecha: z.string().optional(),
});

export const InsumoCreateSchema = z.object({
  nombre: z.string().min(1).max(100),
  unidad: z.string().min(1).max(20).optional(),
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
  obs: z.string().max(500).optional(),
});

export const NominaCreateSchema = z.object({
  trabajadorId: z.string().min(1),
  fechaInicio: z.string(),
  fechaFin: z.string(),
  tipoCalculo: z.string().optional(),
  comEntregasAgua: z.coerce.number().min(0).optional(),
  comEntregasHielo: z.coerce.number().min(0).optional(),
  totalComisiones: z.coerce.number().min(0).optional(),
  salario: z.coerce.number().min(0).optional(),
  total: z.coerce.number().positive().optional(),
});

export const CierreCreateSchema = z.object({
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
});

export const ConfigCreateSchema = z.object({
  clave: z.string().min(1).max(100),
  valor: z.string().min(1),
});

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
  estado: z.enum(['ABIERTO', 'CERRADO', 'CANCELADO']).optional(),
  horaLlegada: z.string().optional(),
  obs: z.string().max(500).optional(),
  pedidoIds: z.array(z.string().min(1)).max(100).optional(),
  pacasAgua: z.coerce.number().int().min(0).optional(),
  pacasHielo: z.coerce.number().int().min(0).optional(),
  devueltasAgua: z.coerce.number().int().min(0).optional(),
  devueltasHielo: z.coerce.number().int().min(0).optional(),
  rotasAgua: z.coerce.number().int().min(0).optional(),
  rotasHielo: z.coerce.number().int().min(0).optional(),
});

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

const TrabajadorBaseSchema = z.object({
  nombre: z.string().min(1).max(100),
  rol: z.enum(['SELLADOR', 'REPARTIDOR', 'ADMIN', 'CONTADOR']),
  tipoPago: z.enum(['COMISION', 'FIJO', 'MIXTO']).optional(),
  usaMoto: z.boolean().optional(),
  capacidadKg: z.coerce.number().int().min(0).max(5000).optional(),
  comPacaAgua: z.coerce.number().min(0).optional(),
  comPacaHielo: z.coerce.number().min(0).optional(),
  salarioFijo: z.coerce.number().min(0).optional(),
  telefono: z.string().max(20).optional(),
})

export const TrabajadorCreateSchema = TrabajadorBaseSchema.refine((data) => {
  if (data.usaMoto && (!data.capacidadKg || data.capacidadKg <= 0)) {
    return {
      message: 'Capacidad es requerida cuando usa moto',
      path: ['capacidadKg'],
    }
  }
  return true
})

export const TrabajadorUpdateSchema = TrabajadorBaseSchema.partial()

export const ClienteUpdateSchema = ClienteCreateSchema.partial();

export const ProveedorUpdateSchema = ProveedorCreateSchema.partial();
