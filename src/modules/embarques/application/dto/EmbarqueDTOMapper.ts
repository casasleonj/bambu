/**
 * EmbarqueDTOMapper.
 *
 * Maps Domain Entities to serializable DTOs for API responses.
 */

import type { Embarque } from '../../domain/entities/Embarque'
import type { EmbarqueResumenDTO, EmbarqueDetalleDTO } from '../dto'

export class EmbarqueDTOMapper {
  static toResumen(embarque: Embarque): EmbarqueResumenDTO {
    const capacidad = embarque.getCapacidad()

    return {
      id: embarque.id.value,
      numero: embarque.numero,
      numeroDia: embarque.numeroDia,
      fecha: embarque.fecha.toISOString(),
      trabajadorId: embarque.trabajadorId,
      trabajadorNombre: embarque.trabajadorNombre ?? '',
      rutaId: embarque.rutaId,
      rutaNombre: embarque.rutaNombre,
      estado: embarque.estado.value,
      totalUnidades: embarque.totalUnidades(),
      pesoKg: embarque.pesoKg(),
      capacidadKg: embarque.capacidadKg,
      capacidadPorcentaje: capacidad.porcentaje,
      capacidadNivel: capacidad.nivel,
      capacidadLabel: capacidad.label,
      capacidadColor: capacidad.color,
      capacidadIcon: capacidad.icon,
      horaSalida: embarque.horaSalida?.toISOString(),
      horaLlegada: embarque.horaLlegada?.toISOString(),
      tipoMoto: embarque.tipoMoto,
      baseDinero: embarque.baseDinero,
      dineroEntregado: embarque.dineroEntregado,
      codigoVisita: embarque.codigoVisita,
      obs: embarque.obs ?? undefined,
      pedidosCount: 0, // Filled by repository
      gastosCount: embarque.gastos.length,
      totalGastos: embarque.totalGastos(),
      createdAt: embarque.createdAt.toISOString(),
      updatedAt: embarque.updatedAt.toISOString(),
    }
  }

  static toDetalle(embarque: Embarque, pedidosCount: number = 0): EmbarqueDetalleDTO {
    const resumen = this.toResumen(embarque)

    return {
      ...resumen,
      pedidosCount,
      productos: embarque.productos.map((p) => ({
        id: p.id,
        producto: p.producto,
        cargadas: p.cargadas,
        devueltas: p.devueltas,
        cambios: p.cambios,
        rotas: p.rotas,
        entregadas: p.entregadas(),
      })),
      gastos: embarque.gastos.map((g) => g.toJSON()),
    }
  }
}
