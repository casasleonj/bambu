import { z } from "zod";

export const PedidoCreateSchema = z.object({
  clienteId: z.string().min(1),
  tipo: z.string().optional(),
  productos: z.object({
    agua19L: z.coerce.number().int().min(0).optional(),
    hielo: z.coerce.number().int().min(0).optional(),
    botellon: z.coerce.number().int().min(0).optional(),
    bolsaAgua: z.coerce.number().int().min(0).optional(),
    bolsaHielo: z.coerce.number().int().min(0).optional(),
  }).optional(),
  pagos: z.array(
    z.object({
      metodo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO']),
      monto: z.coerce.number().positive(),
    })
  ).min(1),
  obs: z.string().max(500).optional(),
  fechaEntrega: z.string().optional(),
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
  cadaNDias: z.coerce.number().int().min(1).optional(),
  precioAguaPref: z.coerce.number().positive().optional(),
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
  nequi: z.coerce.number().min(0),
  baseDia: z.coerce.number().min(0),
  comisiones: z.coerce.number().min(0),
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
  horaSalida: z.string().optional(),
  obs: z.string().max(500).optional(),
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
