/**
 * PrismaClienteRepository.
 */

import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import type { IClienteRepository, ClienteBasico, NegocioBasico } from '../../domain/repositories/IClienteRepository'
import type { TransactionClient } from '../transactions/PrismaTransactionManager'
import { EvaluarImpactoUbicacionUseCase } from '../../application/use-cases/EvaluarImpactoUbicacionUseCase'

const evaluarImpactoUbicacion = new EvaluarImpactoUbicacionUseCase()

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
    // sobreescribir y se audita después.
    const previo = await client.cliente.findUnique({
      where: { id },
      select: { direccion: true, barrio: true, barrioId: true },
    })
    const barrioNuevo = barrio || null
    const barrioCambio = barrioNuevo !== (previo?.barrio ?? null)
    // F3 (Impacto en Demanda, decisión 4 del equipo): este flujo NUNCA tuvo
    // ni tiene forma de recibir un barrioId explícito (solo texto libre) —
    // a diferencia de PUT /api/clientes/[id]. Si el texto de barrio cambia
    // y el cliente ya tenía un barrioId vinculado, ese vínculo puede quedar
    // apuntando a un Barrio que ya no corresponde. No se inventa matching:
    // se desvincula explícitamente en vez de adivinar uno nuevo.
    await client.cliente.update({
      where: { id },
      data: {
        direccion,
        barrio: barrioNuevo,
        ...(barrioCambio && previo?.barrioId ? { barrioId: null } : {}),
      } as unknown as Parameters<typeof client.cliente.update>[0]['data'],
    })

    // F3 (Impacto en Demanda): señal informativa para Pedidos pendientes que
    // todavía dependían de esta dirección — nunca bloquea ni revierte el
    // update de arriba.
    await evaluarImpactoUbicacion.execute({
      origenTipo: 'CLIENTE',
      origenId: id,
      direccionAnterior: previo?.direccion ?? null,
      barrioAnterior: previo?.barrio ?? null,
      direccionNueva: direccion,
      barrioNueva: barrioNuevo,
      tx: client,
    })

    const auditEntry = {
      entidad: 'Cliente',
      registroId: id,
      accion: 'UPDATE' as const,
      datos: {
        direccion,
        barrio: barrioNuevo,
        direccionAnterior: previo?.direccion ?? null,
        barrioAnterior: previo?.barrio ?? null,
        origen: 'pedido',
        pedidoId: meta?.pedidoId,
        ...(barrioCambio && previo?.barrioId ? { barrioIdDesvinculado: previo.barrioId } : {}),
      },
      usuarioId: meta?.usuarioId ?? null,
    }
    // Con `tx` (CrearPedidoUseCase bajo `SECUENCIA:pedido`, ActualizarPedidoUseCase
    // bajo `PEDIDO:{id}`) la auditoría va en la MISMA transacción del UPDATE
    // (ADR-CONCURRENCIA-001 FASE 1, ver `logAudit`): antes se escribía con el
    // `prisma` global, en otra conexión y en auto-commit — si la tx hacía
    // rollback (ej. CLIENTE_DEBE después de este update), el Historial quedaba
    // registrando un cambio de dirección que nunca se persistió.
    if (tx) {
      await logAudit(auditEntry, tx)
    } else {
      logAudit(auditEntry)
    }
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
