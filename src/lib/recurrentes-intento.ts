import { prisma } from './prisma'
import type { Prisma } from '@prisma/client'
import type { ActorGeneracion, DecisionGeneracion } from './recurrentes'
import { ordenarDecisiones as ordenar } from './habituales-contrato'

type Lector = Pick<
  Prisma.TransactionClient,
  'historial' | 'pedido' | 'plantillaRecurrente'
>
export type ObjetivoRecurrente = { prox: string | null; version: string }
export interface IntentoRecurrentes {
  v: 1
  actor: string
  decisiones: DecisionGeneracion[]
  objetivos: Record<string, ObjetivoRecurrente>
}
export class ConflictoIntentoRecurrentes extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message)
  }
}
const registroId = (batch: string) => `recurrentes-intento:${batch}`

export async function leerIntentoRecurrentes(
  batch: string,
  actor: string,
  decisiones?: DecisionGeneracion[],
  db: Lector = prisma,
): Promise<IntentoRecurrentes | null> {
  const row = await db.historial.findUnique({
    where: { id: registroId(batch) },
  })
  if (!row) return null
  let intento: IntentoRecurrentes
  try {
    intento = JSON.parse(row.datos) as IntentoRecurrentes
  } catch {
    throw new ConflictoIntentoRecurrentes(
      'No se puede verificar el intento registrado.',
    )
  }
  if (
    row.entidad !== 'GeneracionRecurrentes' ||
    intento.v !== 1 ||
    !Array.isArray(intento.decisiones) ||
    !intento.objetivos
  )
    throw new ConflictoIntentoRecurrentes(
      'No se puede verificar el intento registrado.',
    )
  if (intento.actor !== actor || row.usuarioId !== actor)
    throw new ConflictoIntentoRecurrentes(
      'Intento no disponible para esta sesión.',
      404,
    )
  if (
    decisiones &&
    JSON.stringify(ordenar(decisiones)) !== JSON.stringify(intento.decisiones)
  )
    throw new ConflictoIntentoRecurrentes(
      'Esta referencia ya corresponde a otra selección. Consulta su resultado antes de cambiarla.',
    )
  return intento
}

/** Identidad inmutable en Historial. Su PK existente arbitra dos altas simultáneas. */
export async function asegurarIntentoRecurrentes(
  batch: string,
  actor: ActorGeneracion,
  decisiones: DecisionGeneracion[],
): Promise<IntentoRecurrentes> {
  const existente = await leerIntentoRecurrentes(
    batch,
    actor.usuarioId,
    decisiones,
  )
  if (existente) return existente
  // Un lote anterior sin manifiesto no permite reconstruir los objetivos que
  // faltaban. Conservarlo y bloquear escrituras, sin inferir desde el calendario actual.
  const [pedidos, registros, plantillas] = await Promise.all([
    prisma.pedido.count({ where: { recurrenteBatchId: batch } }),
    prisma.historial.findMany({
      where: {
        entidad: 'PlantillaRecurrente',
        accion: 'GENERACION',
        datos: { contains: JSON.stringify(batch) },
      },
      select: { datos: true },
    }),
    prisma.plantillaRecurrente.findMany({
      where: { id: { in: decisiones.map((d) => d.recurrenteId) } },
      select: { id: true, proxGeneracion: true, updatedAt: true },
    }),
  ])
  const reciboAnterior = registros.some((r) => {
    try {
      return JSON.parse(r.datos).recurrenteBatchId === batch
    } catch {
      return false
    }
  })
  if (pedidos || reciboAnterior) {
    const simultaneo = await leerIntentoRecurrentes(
      batch,
      actor.usuarioId,
      decisiones,
    )
    if (simultaneo) return simultaneo
    throw new ConflictoIntentoRecurrentes(
      'Lote histórico sin selección original verificable. Consulta y concilia sus pedidos antes de generar otra vez.',
    )
  }
  const objetivos: Record<string, ObjetivoRecurrente> = {}
  for (const d of decisiones) {
    const pt = plantillas.find((p) => p.id === d.recurrenteId)
    if (!pt)
      throw new ConflictoIntentoRecurrentes(
        'Un habitual ya no está disponible. Actualiza la revisión.',
      )
    if (
      (d.proximaFecha && pt.proxGeneracion?.toISOString() !== d.proximaFecha) ||
      (d.version && pt.updatedAt.toISOString() !== d.version)
    ) {
      const simultaneo = await leerIntentoRecurrentes(
        batch,
        actor.usuarioId,
        decisiones,
      )
      if (simultaneo) return simultaneo
      throw new ConflictoIntentoRecurrentes(
        'Un habitual cambió desde la revisión. Actualiza antes de confirmar.',
      )
    }
    objetivos[pt.id] = {
      prox: pt.proxGeneracion?.toISOString() ?? null,
      version: pt.updatedAt.toISOString(),
    }
  }
  const intento: IntentoRecurrentes = {
    v: 1,
    actor: actor.usuarioId,
    decisiones: ordenar(decisiones),
    objetivos,
  }
  await prisma.historial.upsert({
    where: { id: registroId(batch) },
    update: {},
    create: {
      id: registroId(batch),
      entidad: 'GeneracionRecurrentes',
      registroId: batch,
      accion: 'INTENTO',
      usuarioId: actor.usuarioId,
      datos: JSON.stringify(intento),
    },
  })
  return (await leerIntentoRecurrentes(batch, actor.usuarioId, decisiones))!
}

interface Recibo {
  resultado: string
  pedidoId?: string
  numero?: number
  decision: DecisionGeneracion['decision']
  error?: string
}
export async function leerReciboRecurrente(
  db: Lector,
  batch: string,
  id: string,
): Promise<Recibo | null> {
  const rows = await db.historial.findMany({
    where: {
      entidad: 'PlantillaRecurrente',
      registroId: id,
      accion: 'GENERACION',
      datos: { contains: JSON.stringify(batch) },
    },
    orderBy: { fecha: 'asc' },
    select: { datos: true },
  })
  const recibos: Recibo[] = []
  for (const row of rows) {
    let d: Recibo & { recurrenteBatchId?: string }
    try {
      d = JSON.parse(row.datos)
    } catch {
      continue
    }
    if (
      d.recurrenteBatchId === batch &&
      (d.resultado === 'GENERADO' || d.resultado?.startsWith('SALTADO:'))
    )
      recibos.push(d)
  }
  if (recibos.length > 1)
    throw new ConflictoIntentoRecurrentes(
      'Hay resultados contradictorios para este intento. Requiere conciliación.',
    )
  const recibo = recibos[0] ?? null
  if (
    recibo?.resultado === 'GENERADO' &&
    (!recibo.pedidoId || !Number.isInteger(recibo.numero))
  )
    throw new ConflictoIntentoRecurrentes(
      'El pedido registrado no se puede verificar.',
    )
  return recibo
}

export async function estadoIntentoRecurrentes(batch: string, actor: string) {
  const intento = await leerIntentoRecurrentes(batch, actor)
  if (!intento) return null
  const items = await Promise.all(
    intento.decisiones.map(async (d) => {
      const recibo = await leerReciboRecurrente(prisma, batch, d.recurrenteId)
      return {
        recurrenteId: d.recurrenteId,
        decision: d.decision,
        estado: recibo
          ? recibo.resultado === 'GENERADO'
            ? 'GENERADO'
            : 'SALTADO'
          : 'PENDIENTE',
        ...(recibo?.pedidoId && {
          pedidoId: recibo.pedidoId,
          numero: recibo.numero,
        }),
        ...(recibo && { motivo: recibo.resultado.replace(/^SALTADO:/, '') }),
      }
    }),
  )
  const pendientes = items.filter((i) => i.estado === 'PENDIENTE').length
  return {
    offlineId: batch,
    estado:
      pendientes === 0
        ? 'COMPLETO'
        : pendientes === items.length
          ? 'PENDIENTE'
          : 'PARCIAL',
    items,
    pendientes,
    decisiones: intento.decisiones,
  }
}
