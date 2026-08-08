/**
 * PrismaTrabajadorEmbarqueRepository.
 *
 * Implements ITrabajadorEmbarqueRepository against the Trabajador table.
 * Extracted from src/app/api/embarques/route.ts's inline adapter so both
 * the manual creation route and the auto-generate route share one
 * implementation instead of duplicating it.
 */

import { prisma } from '@/lib/prisma'
import type { ITrabajadorEmbarqueRepository, TrabajadorEmbarqueData } from '../../domain'

export class PrismaTrabajadorEmbarqueRepository implements ITrabajadorEmbarqueRepository {
  async findById(id: string, tx?: unknown): Promise<TrabajadorEmbarqueData | null> {
    const client = (tx as typeof prisma) ?? prisma
    const raw = await client.trabajador.findUnique({
      where: { id },
      select: { id: true, nombre: true, telefono: true, usaMoto: true, capacidadKg: true },
    })
    if (!raw) return null
    return {
      id: raw.id,
      nombre: raw.nombre,
      telefono: raw.telefono ?? undefined,
      usaMoto: raw.usaMoto,
      capacidadKg: raw.capacidadKg,
    }
  }

  async findRepartidoresDisponibles(_fecha: Date, _tx?: unknown): Promise<TrabajadorEmbarqueData[]> {
    const raw = await prisma.trabajador.findMany({
      where: { usaMoto: true, activo: true },
      select: { id: true, nombre: true, telefono: true, usaMoto: true, capacidadKg: true },
    })
    return raw.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      telefono: r.telefono ?? undefined,
      usaMoto: r.usaMoto,
      capacidadKg: r.capacidadKg,
    }))
  }
}
