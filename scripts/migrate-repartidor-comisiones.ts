#!/usr/bin/env tsx
/**
 * Migración idempotente de comisiones legacy de trabajadores.
 *
 * Problema que resuelve:
 *   Antes de PR1 (fix/comisiones-rol-repartidor) el sistema no diferenciaba
 *   comisiones de producción (comPaca*) de comisiones de reparto (comRepart*).
 *   REPARTIDORs podían tener comPaca* pobladas y comRepart* vacías, con lo que
 *   el backend hacía fallback y parecía funcionar, pero la UI mostraba
 *   "Com. paca agua/hielo/botellón" a repartidores.
 *
 * Qué hace:
 *   - REPARTIDOR con comRepart* vacío/heredado → copia comPaca* a comRepart*.
 *   - REPARTIDOR → limpia comPaca* (no le corresponden).
 *   - SELLADOR → limpia comRepart* (no le corresponden).
 *   - Otros roles → limpia ambos grupos.
 *
 * Uso:
 *   npx tsx scripts/migrate-repartidor-comisiones.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client'

const dryRun = process.argv.includes('--dry-run')

const prisma = new PrismaClient()

interface UpdatePayload {
  comPacaAgua?: number
  comPacaHielo?: number
  comBotellon?: number
  comRepartAgua?: number
  comRepartHielo?: number
  comRepartBotellon?: number
}

function buildRepartidorUpdate(t: {
  comPacaAgua: unknown
  comPacaHielo: unknown
  comBotellon: unknown
  comRepartAgua: unknown
  comRepartHielo: unknown
  comRepartBotellon: unknown
}): UpdatePayload {
  const payload: UpdatePayload = {}
  const comPacaAgua = Number(t.comPacaAgua || 0)
  const comPacaHielo = Number(t.comPacaHielo || 0)
  const comBotellon = Number(t.comBotellon || 0)

  if (Number(t.comRepartAgua || 0) === 0 && comPacaAgua > 0) {
    payload.comRepartAgua = comPacaAgua
  }
  if (Number(t.comRepartHielo || 0) === 0 && comPacaHielo > 0) {
    payload.comRepartHielo = comPacaHielo
  }
  if (Number(t.comRepartBotellon || 0) === 0 && comBotellon > 0) {
    payload.comRepartBotellon = comBotellon
  }

  if (comPacaAgua > 0) payload.comPacaAgua = 0
  if (comPacaHielo > 0) payload.comPacaHielo = 0
  if (comBotellon > 0) payload.comBotellon = 0

  return payload
}

function buildSelladorUpdate(t: {
  comRepartAgua: unknown
  comRepartHielo: unknown
  comRepartBotellon: unknown
}): UpdatePayload {
  const payload: UpdatePayload = {}
  if (Number(t.comRepartAgua || 0) > 0) payload.comRepartAgua = 0
  if (Number(t.comRepartHielo || 0) > 0) payload.comRepartHielo = 0
  if (Number(t.comRepartBotellon || 0) > 0) payload.comRepartBotellon = 0
  return payload
}

function buildOtherRoleUpdate(t: {
  comPacaAgua: unknown
  comPacaHielo: unknown
  comBotellon: unknown
  comRepartAgua: unknown
  comRepartHielo: unknown
  comRepartBotellon: unknown
}): UpdatePayload {
  const payload: UpdatePayload = {}
  if (Number(t.comPacaAgua || 0) > 0) payload.comPacaAgua = 0
  if (Number(t.comPacaHielo || 0) > 0) payload.comPacaHielo = 0
  if (Number(t.comBotellon || 0) > 0) payload.comBotellon = 0
  if (Number(t.comRepartAgua || 0) > 0) payload.comRepartAgua = 0
  if (Number(t.comRepartHielo || 0) > 0) payload.comRepartHielo = 0
  if (Number(t.comRepartBotellon || 0) > 0) payload.comRepartBotellon = 0
  return payload
}

async function main() {
  const trabajadores = await prisma.trabajador.findMany({
    select: {
      id: true,
      nombre: true,
      rol: true,
      comPacaAgua: true,
      comPacaHielo: true,
      comBotellon: true,
      comRepartAgua: true,
      comRepartHielo: true,
      comRepartBotellon: true,
    },
  })

  let updated = 0
  let skipped = 0

  for (const t of trabajadores) {
    let payload: UpdatePayload = {}

    if (t.rol === 'REPARTIDOR') {
      payload = buildRepartidorUpdate(t)
    } else if (t.rol === 'SELLADOR') {
      payload = buildSelladorUpdate(t)
    } else {
      payload = buildOtherRoleUpdate(t)
    }

    if (Object.keys(payload).length === 0) {
      skipped++
      continue
    }

    console.log(
      `[${dryRun ? 'DRY-RUN' : 'UPDATE'}] ${t.id} (${t.rol}) ${t.nombre}:`,
      JSON.stringify(payload),
    )

    if (!dryRun) {
      await prisma.trabajador.update({
        where: { id: t.id },
        data: payload,
      })
    }
    updated++
  }

  console.log(`\nTotal: ${trabajadores.length} trabajadores`)
  console.log(`Actualizados: ${updated}`)
  console.log(`Sin cambios: ${skipped}`)
  console.log(`Modo: ${dryRun ? 'dry-run (sin persistir)' : 'live'}`)
}

main()
  .catch((err) => {
    console.error('Error en migración:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
