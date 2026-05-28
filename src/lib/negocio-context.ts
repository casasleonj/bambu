/**
 * Negocio Context — Compatibility Layer
 *
 * Provides unified access to business context (direccion, barrio, precios, etc.)
 * by reading from Negocio first, falling back to Cliente fields.
 *
 * This ensures ZERO breaking changes: existing code continues to work because
 * all fields fallback to Cliente when negocioId is null or negocio doesn't exist.
 *
 * Usage:
 *   const ctx = await getNegocioContext(pedido, prisma)
 *   ctx.direccion     // negocio.direccion ?? cliente.direccion
 *   ctx.preciosEspeciales  // negocio.preciosEspeciales ?? cliente.preciosEspeciales
 */

import { prisma } from '@/lib/prisma'
import type { PrismaClient } from '@prisma/client'

export interface NegocioContext {
  // Identity
  negocioId: string | null
  negocioNombre: string | null
  clienteId: string
  clienteNombre: string

  // Location (negocio fallback to cliente)
  direccion: string | null
  barrio: string | null
  referencia: string | null
  linkUbicacion: string | null

  // Routing
  rutaId: string | null

  // Pricing
  preciosEspeciales: string | null

  // Product availability
  habAgua: boolean
  habHielo: boolean
  habBotellon: boolean
  habBolsaAgua: boolean
  habBolsaHielo: boolean

  // Scheduling
  horaApertura: string | null
  frecuencia: string | null
  cadaNDias: number | null
}

/**
 * Get the unified negocio context for a pedido.
 * Reads from Negocio if pedido.negocioId exists, otherwise falls back to Cliente.
 */
export async function getNegocioContext(
  pedido: { clienteId: string; negocioId?: string | null },
  db?: PrismaClient | Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>,
): Promise<NegocioContext> {
  const client = db || prisma

  // Load cliente (always needed)
  const cliente = await client.cliente.findUnique({
    where: { id: pedido.clienteId },
    select: {
      id: true,
      nombre: true,
      apellido: true,
      direccion: true,
      barrio: true,
      referencia: true,
      linkUbicacion: true,
      rutaId: true,
      preciosEspeciales: true,
      habAgua: true,
      habHielo: true,
      habBotellon: true,
      habBolsaAgua: true,
      habBolsaHielo: true,
      horaApertura: true,
      frecuencia: true,
      cadaNDias: true,
    },
  })

  if (!cliente) {
    throw new Error(`Cliente not found: ${pedido.clienteId}`)
  }

  // Default context from cliente
  const ctx: NegocioContext = {
    negocioId: null,
    negocioNombre: null,
    clienteId: cliente.id,
    clienteNombre: `${cliente.nombre}${cliente.apellido ? ` ${cliente.apellido}` : ''}`,
    direccion: cliente.direccion,
    barrio: cliente.barrio,
    referencia: cliente.referencia,
    linkUbicacion: cliente.linkUbicacion,
    rutaId: cliente.rutaId,
    preciosEspeciales: cliente.preciosEspeciales,
    habAgua: cliente.habAgua,
    habHielo: cliente.habHielo,
    habBotellon: cliente.habBotellon,
    habBolsaAgua: cliente.habBolsaAgua,
    habBolsaHielo: cliente.habBolsaHielo,
    horaApertura: cliente.horaApertura,
    frecuencia: cliente.frecuencia !== 'NINGUNA' ? cliente.frecuencia : null,
    cadaNDias: cliente.cadaNDias,
  }

  // Override with negocio data if available
  if (pedido.negocioId) {
    const negocio = await client.negocio.findUnique({
      where: { id: pedido.negocioId },
      select: {
        id: true,
        nombre: true,
        direccion: true,
        barrio: true,
        referencia: true,
        linkUbicacion: true,
        rutaId: true,
        preciosEspeciales: true,
        habAgua: true,
        habHielo: true,
        habBotellon: true,
        habBolsaAgua: true,
        habBolsaHielo: true,
        horaApertura: true,
        frecuencia: true,
        cadaNDias: true,
      },
    })

    if (negocio) {
      ctx.negocioId = negocio.id
      ctx.negocioNombre = negocio.nombre
      // Override only if negocio has the value (null means "use cliente's")
      if (negocio.direccion !== null) ctx.direccion = negocio.direccion
      if (negocio.barrio !== null) ctx.barrio = negocio.barrio
      if (negocio.referencia !== null) ctx.referencia = negocio.referencia
      if (negocio.linkUbicacion !== null) ctx.linkUbicacion = negocio.linkUbicacion
      if (negocio.rutaId !== null) ctx.rutaId = negocio.rutaId
      if (negocio.preciosEspeciales !== null) ctx.preciosEspeciales = negocio.preciosEspeciales
      ctx.habAgua = negocio.habAgua
      ctx.habHielo = negocio.habHielo
      ctx.habBotellon = negocio.habBotellon
      ctx.habBolsaAgua = negocio.habBolsaAgua
      ctx.habBolsaHielo = negocio.habBolsaHielo
      if (negocio.horaApertura !== null) ctx.horaApertura = negocio.horaApertura
      if (negocio.frecuencia !== null) ctx.frecuencia = negocio.frecuencia
      if (negocio.cadaNDias !== null) ctx.cadaNDias = negocio.cadaNDias
    }
  }

  return ctx
}

/**
 * Get all negocios for a cliente.
 * Returns empty array if cliente has no negocios (backward compatible).
 */
export async function getNegociosForCliente(
  clienteId: string,
  db?: PrismaClient | Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>,
) {
  const client = db || prisma
  return client.negocio.findMany({
    where: { clienteId, activo: true },
    orderBy: { nombre: 'asc' },
    select: {
      id: true,
      nombre: true,
      tipoNegocio: true,
      direccion: true,
      barrio: true,
      rutaId: true,
      horaApertura: true,
      preciosEspeciales: true,
      activo: true,
      ruta: { select: { nombre: true } },
    },
  })
}

/**
 * Get the routing key for auto-embarques.
 * Priority: negocio.rutaId > cliente.rutaId > negocio.barrio > cliente.barrio
 */
export function getRoutingKey(ctx: NegocioContext): string {
  return ctx.rutaId || ctx.barrio || 'SIN_RUTA'
}

/**
 * Batch load negocio contexts for multiple pedidos.
 * More efficient than calling getNegocioContext() individually.
 */
export async function batchGetNegocioContexts(
  pedidos: Array<{ id: string; clienteId: string; negocioId?: string | null }>,
  db?: PrismaClient | Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>,
): Promise<Map<string, NegocioContext>> {
  const client = db || prisma
  const results = new Map<string, NegocioContext>()

  // Collect unique clienteIds and negocioIds
  const clienteIds = [...new Set(pedidos.map((p) => p.clienteId))]
  const negocioIds = [...new Set(pedidos.map((p) => p.negocioId).filter(Boolean))] as string[]

  // Batch load
  const [clientes, negocios] = await Promise.all([
    client.cliente.findMany({
      where: { id: { in: clienteIds } },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        direccion: true,
        barrio: true,
        referencia: true,
        linkUbicacion: true,
        rutaId: true,
        preciosEspeciales: true,
        habAgua: true,
        habHielo: true,
        habBotellon: true,
        habBolsaAgua: true,
        habBolsaHielo: true,
        horaApertura: true,
        frecuencia: true,
        cadaNDias: true,
      },
    }),
    negocioIds.length > 0
      ? client.negocio.findMany({
          where: { id: { in: negocioIds } },
          select: {
            id: true,
            nombre: true,
            direccion: true,
            barrio: true,
            referencia: true,
            linkUbicacion: true,
            rutaId: true,
            preciosEspeciales: true,
            habAgua: true,
            habHielo: true,
            habBotellon: true,
            habBolsaAgua: true,
            habBolsaHielo: true,
            horaApertura: true,
            frecuencia: true,
            cadaNDias: true,
          },
        })
      : Promise.resolve([]),
  ])

  const clienteMap = new Map(clientes.map((c) => [c.id, c]))
  const negocioMap = new Map(negocios.map((n) => [n.id, n]))

  for (const pedido of pedidos) {
    const cliente = clienteMap.get(pedido.clienteId)
    if (!cliente) continue

    const negocio = pedido.negocioId ? negocioMap.get(pedido.negocioId) : null

    const ctx: NegocioContext = {
      negocioId: negocio?.id || null,
      negocioNombre: negocio?.nombre || null,
      clienteId: cliente.id,
      clienteNombre: `${cliente.nombre}${cliente.apellido ? ` ${cliente.apellido}` : ''}`,
      direccion: negocio?.direccion ?? cliente.direccion,
      barrio: negocio?.barrio ?? cliente.barrio,
      referencia: negocio?.referencia ?? cliente.referencia,
      linkUbicacion: negocio?.linkUbicacion ?? cliente.linkUbicacion,
      rutaId: negocio?.rutaId ?? cliente.rutaId,
      preciosEspeciales: negocio?.preciosEspeciales ?? cliente.preciosEspeciales,
      habAgua: negocio?.habAgua ?? cliente.habAgua,
      habHielo: negocio?.habHielo ?? cliente.habHielo,
      habBotellon: negocio?.habBotellon ?? cliente.habBotellon,
      habBolsaAgua: negocio?.habBolsaAgua ?? cliente.habBolsaAgua,
      habBolsaHielo: negocio?.habBolsaHielo ?? cliente.habBolsaHielo,
      horaApertura: negocio?.horaApertura ?? cliente.horaApertura,
      frecuencia: (negocio?.frecuencia ?? cliente.frecuencia) !== 'NINGUNA'
        ? (negocio?.frecuencia ?? cliente.frecuencia)
        : null,
      cadaNDias: negocio?.cadaNDias ?? cliente.cadaNDias,
    }

    results.set(pedido.id, ctx)
  }

  return results
}
