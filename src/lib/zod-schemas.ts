import { z } from 'zod'

export const CanalSchema = z.enum(['DOMICILIO', 'PUNTO'])

export const FechaRangoSchema = z.object({
  start: z.string().datetime().optional().or(z.string().date()),
  end: z.string().datetime().optional().or(z.string().date()),
})

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  all: z.coerce.boolean().optional(),
})

export const ClienteRecomendacionesSchema = z.object({}).strict()
