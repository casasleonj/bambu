import { z } from 'zod'

export const DecisionHabitualSchema = z.object({
  recurrenteId: z.string().min(1),
  decision: z.enum([
    'NORMAL',
    'CON_PENDIENTES',
    'SOLO_PENDIENTES',
    'APLICAR_CREDITO',
    'SALTAR',
  ]),
  proximaFecha: z.string().datetime().optional(),
  version: z.string().datetime().optional(),
})
export const ConfirmarHabitualesSchema = z.object({
  decisiones: z
    .array(DecisionHabitualSchema)
    .min(1)
    .refine(
      (ds) => new Set(ds.map((d) => d.recurrenteId)).size === ds.length,
      'Un habitual no puede figurar dos veces en el mismo intento.',
    ),
  fecha: z.string().datetime().optional(),
  offlineId: z.string().min(1).max(200).optional(),
})
export const EnvioHabitualesSchema = ConfirmarHabitualesSchema.extend({
  offlineId: z.string().min(1).max(200),
})
export type EnvioHabituales = z.infer<typeof EnvioHabitualesSchema>
export type DecisionHabitual = z.infer<typeof DecisionHabitualSchema>
export const EstadoHabitualesSchema = z
  .object({
    offlineId: z.string().min(1),
    estado: z.enum(['PENDIENTE', 'PARCIAL', 'COMPLETO']),
    pendientes: z.number().int().nonnegative(),
    decisiones: z.array(DecisionHabitualSchema).min(1),
    items: z
      .array(
        z.object({
          recurrenteId: z.string(),
          decision: DecisionHabitualSchema.shape.decision,
          estado: z.enum(['GENERADO', 'SALTADO', 'PENDIENTE']),
          pedidoId: z.string().optional(),
          numero: z.number().int().optional(),
          motivo: z.string().optional(),
        }),
      )
      .min(1),
  })
  .refine((d) => {
    const pendientes = d.items.filter((i) => i.estado === 'PENDIENTE').length
    return (
      d.pendientes === pendientes &&
      d.items.length === d.decisiones.length &&
      new Set(d.items.map((i) => i.recurrenteId)).size === d.items.length &&
      d.items.every((i) =>
        d.decisiones.some(
          (x) => x.recurrenteId === i.recurrenteId && x.decision === i.decision,
        ),
      ) &&
      d.estado ===
        (pendientes === 0
          ? 'COMPLETO'
          : pendientes === d.items.length
            ? 'PENDIENTE'
            : 'PARCIAL') &&
      d.items.every(
        (i) =>
          i.estado !== 'GENERADO' ||
          (!!i.pedidoId && Number.isInteger(i.numero)),
      )
    )
  })
export type EstadoHabituales = z.infer<typeof EstadoHabitualesSchema>
export function ordenarDecisiones(ds: DecisionHabitual[]) {
  return ds
    .map((d) => ({
      recurrenteId: d.recurrenteId,
      decision: d.decision,
      ...(d.proximaFecha && { proximaFecha: d.proximaFecha }),
      ...(d.version && { version: d.version }),
    }))
    .sort((a, b) => a.recurrenteId.localeCompare(b.recurrenteId))
}
export function firmaDecisiones(ds: DecisionHabitual[]) {
  return JSON.stringify(ordenarDecisiones(ds))
}
