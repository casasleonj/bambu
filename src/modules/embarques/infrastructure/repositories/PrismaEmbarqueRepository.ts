/**
 * PrismaEmbarqueRepository.
 *
 * Prisma implementation of IEmbarqueRepository.
 */

import { prisma } from '@/lib/prisma'
import { EmbarqueMapper } from '../mappers/EmbarqueMapper'
import type {
  IEmbarqueRepository,
  EmbarqueFilter,
} from '../../domain/repositories/IEmbarqueRepository'
import type { TransactionClient } from '../transactions/PrismaTransactionManager'
import { Embarque } from '../../domain/entities/Embarque'
import { Carga } from '../../domain/value-objects/Carga'
import { EstadoEmbarque } from '../../domain/value-objects/EstadoEmbarque'
import type { Prisma } from '@prisma/client'

type TxOrPrisma = TransactionClient | typeof prisma

function getTx(tx: unknown): TxOrPrisma {
  return (tx as TxOrPrisma) ?? prisma
}

export class PrismaEmbarqueRepository implements IEmbarqueRepository {
  async findById(id: string, tx?: unknown): Promise<Embarque | null> {
    const client = getTx(tx)
    const raw = await client.embarque.findUnique({
      where: { id },
      include: {
        trabajador: { select: { nombre: true, usaMoto: true, capacidadKg: true } },
        ruta: { select: { nombre: true } },
        productos: true,
        gastos: true,
      },
    })
    if (!raw) return null
    return EmbarqueMapper.fromPrisma(raw)
  }

  async findByTrabajadorAndFecha(trabajadorId: string, fecha: Date, tx?: unknown): Promise<Embarque | null> {
    const client = getTx(tx)
    const startOfDay = new Date(fecha)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(fecha)
    endOfDay.setHours(23, 59, 59, 999)

    const raw = await client.embarque.findFirst({
      where: {
        trabajadorId,
        fecha: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        trabajador: { select: { nombre: true, usaMoto: true, capacidadKg: true } },
        ruta: { select: { nombre: true } },
        productos: true,
        gastos: true,
      },
    })
    if (!raw) return null
    return EmbarqueMapper.fromPrisma(raw)
  }

  async findMany(filters: EmbarqueFilter, tx?: unknown): Promise<Embarque[]> {
    const client = getTx(tx)
    const where: Prisma.EmbarqueWhereInput = {}

    if (filters.fechaDesde || filters.fechaHasta) {
      const dateFilter: Record<string, Date> = {}
      if (filters.fechaDesde) dateFilter.gte = filters.fechaDesde
      if (filters.fechaHasta) dateFilter.lte = filters.fechaHasta
      where.fecha = dateFilter as Prisma.DateTimeFilter
    }
    if (filters.estado) {
      where.estado = filters.estado
    }
    if (filters.trabajadorId) {
      where.trabajadorId = filters.trabajadorId
    }
    if (filters.rutaId) {
      where.rutaId = filters.rutaId
    }

    const raw = await client.embarque.findMany({
      where,
      orderBy: { fecha: 'desc' },
      include: {
        trabajador: { select: { nombre: true, usaMoto: true, capacidadKg: true } },
        ruta: { select: { nombre: true } },
        productos: true,
        _count: { select: { pedidos: true, gastos: true } },
      },
    })

    return raw.map((r) => EmbarqueMapper.fromPrisma(r))
  }

  async findWithPedidos(id: string, tx?: unknown): Promise<Embarque | null> {
    const client = getTx(tx)
    const raw = await client.embarque.findUnique({
      where: { id },
      include: {
        trabajador: { select: { nombre: true, usaMoto: true, capacidadKg: true } },
        ruta: { select: { nombre: true } },
        productos: true,
        gastos: true,
        pedidos: {
          include: {
            cliente: true,
            pagos: true,
            items: true,
            factura: true,
          },
        },
      },
    })
    if (!raw) return null
    return EmbarqueMapper.fromPrisma(raw)
  }

  async findWithProductos(id: string, tx?: unknown): Promise<Embarque | null> {
    const client = getTx(tx)
    const raw = await client.embarque.findUnique({
      where: { id },
      include: {
        trabajador: { select: { nombre: true, usaMoto: true, capacidadKg: true } },
        ruta: { select: { nombre: true } },
        productos: true,
        gastos: true,
      },
    })
    if (!raw) return null
    return EmbarqueMapper.fromPrisma(raw)
  }

  async findWithGastos(id: string, tx?: unknown): Promise<Embarque | null> {
    const client = getTx(tx)
    const raw = await client.embarque.findUnique({
      where: { id },
      include: {
        trabajador: { select: { nombre: true, usaMoto: true, capacidadKg: true } },
        ruta: { select: { nombre: true } },
        productos: true,
        gastos: true,
      },
    })
    if (!raw) return null
    return EmbarqueMapper.fromPrisma(raw)
  }

  async create(
    data: {
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
    },
    tx?: unknown,
  ): Promise<Embarque> {
    const client = getTx(tx)
    const prismaData = EmbarqueMapper.toPrismaCreate(data)

    const raw = await client.embarque.create({
      data: prismaData as Prisma.EmbarqueCreateInput,
      include: {
        trabajador: { select: { nombre: true, usaMoto: true, capacidadKg: true } },
        ruta: { select: { nombre: true } },
        productos: true,
        gastos: true,
      },
    })

    return EmbarqueMapper.fromPrisma(raw)
  }

  async update(
    id: string,
    data: Partial<{
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
    }>,
    tx?: unknown,
  ): Promise<Embarque> {
    const client = getTx(tx)
    const prismaData = EmbarqueMapper.toPrismaUpdate(data)

    const raw = await client.embarque.update({
      where: { id },
      data: prismaData as Prisma.EmbarqueUpdateInput,
      include: {
        trabajador: { select: { nombre: true, usaMoto: true, capacidadKg: true } },
        ruta: { select: { nombre: true } },
        productos: true,
        gastos: true,
      },
    })

    return EmbarqueMapper.fromPrisma(raw)
  }

  async delete(id: string, tx?: unknown): Promise<void> {
    const client = getTx(tx)
    await client.embarque.delete({ where: { id } })
  }

  async getNextNumeroDia(fecha: Date, tx?: unknown): Promise<number> {
    const client = getTx(tx)
    const startOfDay = new Date(fecha)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(fecha)
    endOfDay.setHours(23, 59, 59, 999)

    const count = await client.embarque.count({
      where: {
        fecha: { gte: startOfDay, lte: endOfDay },
      },
    })

    return count + 1
  }
}
