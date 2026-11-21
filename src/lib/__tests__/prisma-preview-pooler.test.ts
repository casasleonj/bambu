import { describe, expect, it } from 'vitest'
import { prismaPreviewDatabaseUrl } from '../prisma-preview-pooler'

const transaccional = 'postgresql://app:secreto@aws-0-us-east-1.pooler.supabase.com:6543/postgres'

describe('preview Vercel + Supavisor transaccional, Prisma 6', () => {
  it('activa compatibilidad solo para el pool transaccional de preview', () => {
    expect(prismaPreviewDatabaseUrl(transaccional, 'preview')).toBe(transaccional + '?pgbouncer=true')
  })
  it('conserva parámetros ya configurados (sin revelar ni modificar credenciales)', () => {
    const url = transaccional + '?sslmode=require&connection_limit=1'
    expect(prismaPreviewDatabaseUrl(url, 'preview'))
      .toBe(url + '&pgbouncer=true')
  })
  it('es idempotente cuando ya está configurado', () => {
    const url = transaccional + '?pgbouncer=true'
    expect(prismaPreviewDatabaseUrl(url, 'preview')).toBe(url)
  })
  it.each(['production', 'development', ''])('no altera el entorno %s', env => {
    expect(prismaPreviewDatabaseUrl(transaccional, env)).toBe(transaccional)
  })
  it('conserva Supabase modo sesión, puerto 5432', () => {
    const url = transaccional.replace(':6543/', ':5432/')
    expect(prismaPreviewDatabaseUrl(url, 'preview')).toBe(url)
  })
  it('conserva Supabase conexión directa, otras bases y entradas ausentes', () => {
    const directa = 'postgresql://app:secreto@db.ref.supabase.co:5432/postgres'
    const otra = 'postgresql://app:secreto@localhost:6543/postgres'
    expect(prismaPreviewDatabaseUrl(directa, 'preview')).toBe(directa)
    expect(prismaPreviewDatabaseUrl(otra, 'preview')).toBe(otra)
    expect(prismaPreviewDatabaseUrl(undefined, 'preview')).toBeUndefined()
    expect(prismaPreviewDatabaseUrl('not-a-url', 'preview')).toBe('not-a-url')
  })
})
