/**
 * PrismaClienteRepository.
 */

import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
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
        referencia: true,
        linkUbicacion: true,
        lat: true,
        lng: true,
        geocodeOrigen: true,
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
      referencia: raw.referencia || undefined,
      linkUbicacion: raw.linkUbicacion || undefined,
      lat: raw.lat != null ? Number(raw.lat) : null,
      lng: raw.lng != null ? Number(raw.lng) : null,
      geocodeOrigen: raw.geocodeOrigen ?? null,
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

  async updateDireccion(
    id: string,
    direccion: string,
    barrio?: string,
    tx?: TransactionClient,
    meta?: { usuarioId?: string | null; pedidoId?: string },
  ): Promise<void> {
    const client = tx || prisma
    // FIX: este UPDATE no tenía ningún registro de auditoría — un cambio de
    // dirección del cliente disparado desde el flujo de pedidos quedaba sin
    // rastro de "antes/después". Se captura el valor previo antes de
    // sobreescribir y se audita después (logAudit es fire-and-forget, fuera
    // de la tx, igual que el resto de las auditorías de este repo).
    const previo = await client.cliente.findUnique({
      where: { id },
      select: { direccion: true, barrio: true, barrioId: true },
    })

    const nuevoBarrio = barrio || null
    // F1-BARRIO-CANONICO (fix hallazgo cross-módulo, flujo Pedidos): este
    // checkbox de "actualizar cliente" solo captura `barrio` como texto
    // libre -- a diferencia de PUT /api/clientes/[id], nunca tuvo un
    // barrioId resuelto (vía selector) para ofrecer acá. Dejar `barrioId`
    // intacto cuando el texto legacy cambia dejaría el FK apuntando a un
    // Barrio que ya no corresponde a lo que dice `Cliente.barrio` -- una
    // inconsistencia dual-write silenciosa, peor que no tener vínculo.
    // Nunca se asigna un barrioId nuevo por heurística acá (violaría la
    // regla de "no fusionar por similitud de texto" de TERRITORIO-F2); solo
    // se limpia el vínculo existente cuando deja de corresponder al texto
    // nuevo. Re-vincular a un Barrio canónico sigue siendo una acción
    // explícita, disponible en el form de Cliente.
    const barrioIdSigueValido = previo?.barrioId != null && nuevoBarrio === previo.barrio
    const debeLimpiarBarrioId = previo?.barrioId != null && !barrioIdSigueValido

    await client.cliente.update({
      where: { id },
      data: {
        direccion,
        barrio: nuevoBarrio,
        ...(debeLimpiarBarrioId ? { barrioId: null } : {}),
      } as unknown as Parameters<typeof client.cliente.update>[0]['data'],
    })
    logAudit({
      entidad: 'Cliente',
      registroId: id,
      accion: 'UPDATE',
      datos: {
        direccion,
        barrio: nuevoBarrio,
        direccionAnterior: previo?.direccion ?? null,
        barrioAnterior: previo?.barrio ?? null,
        origen: 'pedido',
        pedidoId: meta?.pedidoId,
        ...(debeLimpiarBarrioId ? { barrioIdDesvinculado: previo!.barrioId } : {}),
      },
      usuarioId: meta?.usuarioId ?? null,
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
        referencia: true,
        linkUbicacion: true,
        lat: true,
        lng: true,
        preciosEspeciales: true,
      },
    })
    if (!raw) return null
    return {
      id: raw.id,
      nombre: raw.nombre,
      direccion: raw.direccion || undefined,
      barrio: raw.barrio || undefined,
      referencia: raw.referencia || undefined,
      linkUbicacion: raw.linkUbicacion || undefined,
      lat: raw.lat != null ? Number(raw.lat) : null,
      lng: raw.lng != null ? Number(raw.lng) : null,
      preciosEspeciales: raw.preciosEspeciales,
    }
  }
}
