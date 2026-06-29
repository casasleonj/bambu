/**
 * PrismaClienteRepository.
 */

import { prisma } from '@/lib/prisma'
import type { IClienteRepository, ClienteBasico, NegocioBasico } from '../../domain/repositories/IClienteRepository'
import type { TransactionClient } from '../transactions/PrismaTransactionManager'

export class PrismaClienteRepository implements IClienteRepository {
  async findById(id: string, tx?: TransactionClient): Promise<ClienteBasico | null> {
    const client = tx || prisma
    const raw = await client.cliente.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        telefono: true,
        direccion: true,
        barrio: true,
        bloqueado: true,
        verificado: true,
        creadoPorRol: true,
        limitePedidosFiados: true,
        preciosEspeciales: true,
      },
    })
    if (!raw) return null
    return {
      id: raw.id,
      nombre: raw.nombre,
      apellido: raw.apellido || undefined,
      telefono: raw.telefono,
      direccion: raw.direccion || undefined,
      barrio: raw.barrio || undefined,
      bloqueado: raw.bloqueado,
      verificado: raw.verificado,
      creadoPorRol: raw.creadoPorRol,
      limitePedidosFiados: raw.limitePedidosFiados,
      preciosEspeciales: raw.preciosEspeciales,
    }
  }

  async findByTelefono(telefono: string, tx?: TransactionClient): Promise<{ id: string } | null> {
    const client = tx || prisma
    const raw = await client.cliente.findFirst({
      where: { telefono },
      select: { id: true },
    })
    return raw
  }

  async create(
    data: {
      nombre: string
      apellido?: string
      telefono: string
      direccion?: string
      barrio?: string
      fuente?: string
      creadoPorRol: string
    },
    tx?: TransactionClient,
  ): Promise<{ id: string }> {
    const client = tx || prisma
    return client.cliente.create({
      data: {
        nombre: data.nombre,
        apellido: data.apellido || null,
        telefono: data.telefono,
        direccion: data.direccion || '',
        barrio: data.barrio || null,
        fuente: data.fuente || null,
        frecuencia: 'NINGUNA',
        creadoPorRol: data.creadoPorRol,
      } as unknown as Parameters<typeof client.cliente.create>[0]['data'],
      select: { id: true },
    })
  }

  async updateDireccion(id: string, direccion: string, barrio?: string, tx?: TransactionClient): Promise<void> {
    const client = tx || prisma
    await client.cliente.update({
      where: { id },
      data: {
        direccion,
        barrio: barrio || null,
      } as unknown as Parameters<typeof client.cliente.update>[0]['data'],
    })
  }

  async incrementarSaldoFavor(id: string, monto: number, tx?: TransactionClient): Promise<void> {
    const client = tx || prisma
    // FIX Fase 2 §3.4: incrementar saldoFavor del cliente. Se llama dentro
    // de la tx del CrearPedidoUseCase cuando el pago excede el total.
    await client.cliente.update({
      where: { id },
      data: {
        saldoFavor: { increment: monto },
      },
    })
  }

  async getSaldoFavor(id: string, tx?: TransactionClient): Promise<number> {
    const client = tx || prisma
    const c = await client.cliente.findUnique({
      where: { id },
      select: { saldoFavor: true },
    })
    return c ? Number(c.saldoFavor) : 0
  }

  async aplicarSaldoFavor(id: string, monto: number, tx?: TransactionClient): Promise<number> {
    const client = tx || prisma
    // FIX Fase 2 §3.4: aplicar saldo a favor. Devuelve el monto aplicado.
    // Si el saldo es menor al monto, aplica solo lo disponible.
    const current = await this.getSaldoFavor(id, tx)
    const aplicar = Math.min(monto, current)
    if (aplicar > 0) {
      await client.cliente.update({
        where: { id },
        data: { saldoFavor: { decrement: aplicar } },
      })
    }
    return aplicar
  }

  async findNegocioById(id: string, tx?: TransactionClient): Promise<NegocioBasico | null> {
    const client = tx || prisma
    const raw = await client.negocio.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        direccion: true,
        barrio: true,
        preciosEspeciales: true,
      },
    })
    if (!raw) return null
    return {
      id: raw.id,
      nombre: raw.nombre,
      direccion: raw.direccion || undefined,
      barrio: raw.barrio || undefined,
      preciosEspeciales: raw.preciosEspeciales,
    }
  }
}
