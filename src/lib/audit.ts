import { prisma } from './prisma'

export interface AuditEntry {
  entidad: string
  registroId: string
  accion: 'CREATE' | 'UPDATE' | 'DELETE'
  datos: Record<string, unknown>
  usuarioId?: string | null
}

export async function logAudit(entry: AuditEntry) {
  try {
    await prisma.historial.create({
      data: {
        entidad: entry.entidad,
        registroId: entry.registroId,
        accion: entry.accion,
        datos: JSON.stringify(entry.datos),
        usuarioId: entry.usuarioId ?? null,
      },
    })
  } catch (e) {
    // Audit logging should never break the main transaction
    console.error('[AUDIT] Failed to log:', e)
  }
}

export async function logBulkAudit(entries: AuditEntry[]) {
  try {
    await prisma.historial.createMany({
      data: entries.map(e => ({
        entidad: e.entidad,
        registroId: e.registroId,
        accion: e.accion,
        datos: JSON.stringify(e.datos),
        usuarioId: e.usuarioId ?? null,
      })),
    })
  } catch (e) {
    console.error('[AUDIT] Failed to log bulk:', e)
  }
}
