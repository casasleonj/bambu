import { prisma } from './prisma'
import { logger } from './logger'
import type { Prisma } from '@prisma/client'

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'RESTORE'
  | 'LOGIN'
  | 'SESSION_EVICTED'
  | 'FORCE_LOGOUT'

export interface AuditEntry {
  entidad: string
  registroId: string
  accion: AuditAction
  datos: Record<string, unknown>
  usuarioId?: string | null
  /** Optional request metadata for forensics (Bloque 4) */
  ip?: string | null
  userAgent?: string | null
  /**
   * Opcional: ID del Caso (alerta antifraude) que origino este cambio.
   * Se embebe en `datos._casoId` para que la UI de /casos/[id] pueda
   * mostrar el historial forense de los cambios automaticos disparados
   * por el flujo de auto-resolver (commit 3.2).
   *
   * Se embebe en el JSON (no columna dedicada) para mantener backward
   * compat con los readers existentes de Historial que parsean `datos`
   * como string JSON generico.
   */
  casoId?: string | null
}

export async function logAudit(entry: AuditEntry, tx?: { historial: Prisma.HistorialDelegate }) {
  // FASE 1 (ADR-CONCURRENCIA-001): si se pasa `tx`, la auditoría se escribe
  // en la MISMA transacción que adquirió el lock. Antes se usaba siempre el
  // cliente global (auto-commit en otra conexión): alargaba la tenencia del
  // lock y podía dejar filas de auditoría "fantasma" si la tx hacía rollback.
  const client = tx ?? prisma
  try {
    // Merge IP/userAgent/casoId into datos JSON so el reporte forense
    // y la UI de Casos los ven. (Historial table no tiene columnas
    // dedicadas para estos meta-campos; los embebemos en `datos` para
    // mantener backward compat con readers existentes.)
    const datosWithMeta: Record<string, unknown> = { ...entry.datos }
    if (entry.ip) datosWithMeta._ip = entry.ip
    if (entry.userAgent) datosWithMeta._userAgent = entry.userAgent
    if (entry.casoId) datosWithMeta._casoId = entry.casoId

    await client.historial.create({
      data: {
        entidad: entry.entidad,
        registroId: entry.registroId,
        accion: entry.accion,
        datos: JSON.stringify(datosWithMeta),
        usuarioId: entry.usuarioId ?? null,
      },
    })
  } catch (e) {
    logger.error({ err: e }, '[AUDIT] Failed to log')
    // Si la auditoría corre dentro de una transacción y falla, re-lanzamos
    // para que la tx haga rollback atómico (no dejar la operación de negocio
    // commiteada sin su evidencia, ni una tx abortada silenciosamente).
    if (tx) throw e
  }
}

export async function logBulkAudit(entries: AuditEntry[]) {
  try {
    await prisma.historial.createMany({
      data: entries.map(e => {
        const datosWithMeta: Record<string, unknown> = { ...e.datos }
        if (e.ip) datosWithMeta._ip = e.ip
        if (e.userAgent) datosWithMeta._userAgent = e.userAgent
        if (e.casoId) datosWithMeta._casoId = e.casoId
        return {
          entidad: e.entidad,
          registroId: e.registroId,
          accion: e.accion,
          datos: JSON.stringify(datosWithMeta),
          usuarioId: e.usuarioId ?? null,
        }
      }),
    })
  } catch (e) {
    logger.error({ err: e }, '[AUDIT] Failed to log bulk')
  }
}
