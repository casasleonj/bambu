/**
 * EmbarqueMapper.
 *
 * Maps between Prisma models and Domain entities.
 * Handles Decimal → number conversion and legacy field synchronization.
 */

import { Embarque, type EmbarqueProps } from '../../domain/entities/Embarque'
import { EstadoEmbarque, type EstadoEmbarqueValue } from '../../domain/value-objects/EstadoEmbarque'
import { Carga, type CargaData } from '../../domain/value-objects/Carga'
import { EmbarqueProducto } from '../../domain/entities/EmbarqueProducto'
import { GastoEmbarque } from '../../domain/entities/GastoEmbarque'

function toNumber(value: number | { toNumber: () => number } | null | undefined): number {
  if (value === null || value === undefined) return 0
  return typeof value === 'number' ? value : value.toNumber()
}

export class EmbarqueMapper {
  static fromPrisma(raw: {
    id: string
    numero: number
    numeroDia: number
    fecha: Date
    trabajadorId: string
    trabajador?: { nombre: string; usaMoto: boolean; capacidadKg: number }
    rutaId: string | null
    ruta?: { nombre: string } | null
    horaSalida: Date | null
    horaLlegada: Date | null
    estado: EstadoEmbarqueValue
    pacasAgua: number
    pacasHielo: number
    devueltasAgua: number
    devueltasHielo: number
    rotasAgua: number
    rotasHielo: number
    tipoMoto: string | null
    baseDinero: number | { toNumber: () => number }
    dineroEntregado: number | { toNumber: () => number }
    stockSnapshot: unknown
    codigoVisita: string | null
    obs: string | null
    createdById: string | null
    createdAt: Date
    updatedAt: Date
    productos?: Array<{
      id: string
      embarqueId: string
      producto: string
      cargadas: number
      devueltas: number
      cambios: number
      rotas: number
    }>
    gastos?: Array<{
      id: string
      embarqueId: string | null
      categoria: string
      descripcion: string
      monto: number | { toNumber: () => number }
      responsable: string | null
      notas: string | null
    }>
  }): Embarque {
    // Build Carga from legacy fields (pacasAgua, pacasHielo, etc.)
    // These are kept for backward compatibility
    const cargaData: CargaData = {
      PACA_AGUA: raw.pacasAgua ?? 0,
      PACA_HIELO: raw.pacasHielo ?? 0,
      BOTELLON: 0, // Legacy schema doesn't track botellon separately in embarque
      BOLSA_AGUA: 0,
      BOLSA_HIELO: 0,
    }

    // If stockSnapshot exists, use it for carga
    if (raw.stockSnapshot && typeof raw.stockSnapshot === 'object') {
      const snapshot = raw.stockSnapshot as Record<string, number>
      if (snapshot.PACA_AGUA !== undefined) cargaData.PACA_AGUA = snapshot.PACA_AGUA
      if (snapshot.PACA_HIELO !== undefined) cargaData.PACA_HIELO = snapshot.PACA_HIELO
      if (snapshot.BOTELLON !== undefined) cargaData.BOTELLON = snapshot.BOTELLON
      if (snapshot.BOLSA_AGUA !== undefined) cargaData.BOLSA_AGUA = snapshot.BOLSA_AGUA
      if (snapshot.BOLSA_HIELO !== undefined) cargaData.BOLSA_HIELO = snapshot.BOLSA_HIELO
    }

    const carga = new Carga(cargaData)

    const capacidadKg = raw.trabajador?.capacidadKg ?? 0

    const productos = (raw.productos ?? []).map(
      (p) =>
        new EmbarqueProducto({
          id: p.id,
          embarqueId: p.embarqueId,
          producto: p.producto as CargaData extends Record<infer K, unknown> ? K : string,
          cargadas: p.cargadas,
          devueltas: p.devueltas,
          cambios: p.cambios,
          rotas: p.rotas,
        }),
    )

    const gastos = (raw.gastos ?? []).map(
      (g) =>
        new GastoEmbarque({
          id: g.id,
          embarqueId: g.embarqueId ?? '',
          categoria: g.categoria,
          descripcion: g.descripcion,
          monto: toNumber(g.monto),
          responsable: g.responsable ?? undefined,
          notas: g.notas ?? undefined,
        }),
    )

    const props: EmbarqueProps = {
      id: raw.id,
      numero: raw.numero,
      numeroDia: raw.numeroDia,
      fecha: raw.fecha,
      trabajadorId: raw.trabajadorId,
      trabajadorNombre: raw.trabajador?.nombre,
      rutaId: raw.rutaId ?? undefined,
      rutaNombre: raw.ruta?.nombre,
      horaSalida: raw.horaSalida ?? undefined,
      horaLlegada: raw.horaLlegada ?? undefined,
      estado: new EstadoEmbarque(raw.estado),
      carga,
      tipoMoto: raw.tipoMoto ?? undefined,
      capacidadKg,
      baseDinero: toNumber(raw.baseDinero),
      dineroEntregado: toNumber(raw.dineroEntregado),
      stockSnapshot: raw.stockSnapshot
        ? (raw.stockSnapshot as Record<string, number>)
        : undefined,
      codigoVisita: raw.codigoVisita ?? undefined,
      obs: raw.obs ?? undefined,
      createdById: raw.createdById ?? undefined,
      productos,
      gastos,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    }

    return new Embarque(props)
  }

  static toPrismaCreate(embarque: {
    trabajadorId: string
    rutaId?: string
    carga: Carga
    tipoMoto?: string
    capacidadKg: number
    baseDinero: number
    stockSnapshot?: Record<string, number>
    codigoVisita?: string
    obs?: string
    createdById?: string
    numero: number
    numeroDia: number
  }): Record<string, unknown> {
    const cargaJson = embarque.carga.toJSON()

    return {
      trabajadorId: embarque.trabajadorId,
      rutaId: embarque.rutaId ?? null,
      tipoMoto: embarque.tipoMoto ?? null,
      baseDinero: embarque.baseDinero,
      stockSnapshot: embarque.stockSnapshot ?? cargaJson,
      codigoVisita: embarque.codigoVisita ?? null,
      obs: embarque.obs ?? null,
      createdById: embarque.createdById ?? null,
      numero: embarque.numero,
      numeroDia: embarque.numeroDia,
      // Legacy fields
      pacasAgua: cargaJson.PACA_AGUA,
      pacasHielo: cargaJson.PACA_HIELO,
    }
  }

  static toPrismaUpdate(data: Partial<{
    estado: EstadoEmbarque
    trabajadorId: string
    rutaId?: string
    horaSalida?: Date
    horaLlegada?: Date
    carga: Carga
    tipoMoto?: string
    baseDinero: number
    codigoVisita?: string
    obs?: string
    dineroEntregado: number
  }>): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    if (data.estado) result.estado = data.estado.value
    if (data.trabajadorId) result.trabajadorId = data.trabajadorId
    if (data.rutaId !== undefined) result.rutaId = data.rutaId
    if (data.horaSalida !== undefined) result.horaSalida = data.horaSalida
    if (data.horaLlegada !== undefined) result.horaLlegada = data.horaLlegada
    if (data.carga) {
      const cargaJson = data.carga.toJSON()
      result.pacasAgua = cargaJson.PACA_AGUA
      result.pacasHielo = cargaJson.PACA_HIELO
      result.stockSnapshot = cargaJson
    }
    if (data.tipoMoto !== undefined) result.tipoMoto = data.tipoMoto
    if (data.baseDinero !== undefined) result.baseDinero = data.baseDinero
    if (data.codigoVisita !== undefined) result.codigoVisita = data.codigoVisita
    if (data.obs !== undefined) result.obs = data.obs
    if (data.dineroEntregado !== undefined) result.dineroEntregado = data.dineroEntregado

    return result
  }
}
