import { prisma } from './prisma'
import { logger } from './logger'

export interface AuditEntry {
  entidad: string
  registroId: string
  accion: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE'
  datos: Record<string, unknown>
  usuarioId?: string | null
  /** Optional request metadata for forensics (Bloque 4) */
  ip?: string | null
  userAgent?: string | null
}

export async function logAudit(entry: AuditEntry) {
  try {
    // Merge IP/userAgent into datos JSON so el reporte forense los ve.
    // (Historial table no tiene columnas dedicadas para IP/UA; los embebemos
    // en datos para mantener backward compat con readers existentes.)
    const datosWithMeta: Record<string, unknown> = { ...entry.datos }
    if (entry.ip) datosWithMeta._ip = entry.ip
    if (entry.userAgent) datosWithMeta._userAgent = entry.userAgent

    await prisma.historial.create({
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
  }
}

export async function logBulkAudit(entries: AuditEntry[]) {
  try {
    await prisma.historial.createMany({
      data: entries.map(e => {
        const datosWithMeta: Record<string, unknown> = { ...e.datos }
        if (e.ip) datosWithMeta._ip = e.ip
        if (e.userAgent) datosWithMeta._userAgent = e.userAgent
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
