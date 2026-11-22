// @tests Seguridad — los seeds (contraseñas conocidas, repositorio público) solo corren contra una base local
import { describe, it, expect } from 'vitest'
import { baseEsLocal, exigirBaseLocal, CONFIRMAR_SEED_REMOTO } from '../../../prisma/seed-guard'

describe('seed-guard · baseEsLocal', () => {
  it.each([
    'postgresql://bambu:x@localhost:5433/bambu',
    'postgresql://bambu:x@127.0.0.1:5432/bambu_test',
    'postgresql://bambu:x@[::1]:5432/bambu',
    'postgresql://bambu:x@LOCALHOST:5432/bambu',
  ])('acepta una base de este equipo: %s', (url) => expect(baseEsLocal(url)).toBe(true))

  it.each([
    'postgresql://postgres:x@db.abcdefghijklmnop.supabase.co:5432/postgres',
    'postgresql://postgres.abcdefghijklmnop:x@aws-0-us-east-2.pooler.supabase.com:6543/postgres',
    'postgresql://bambu:x@10.0.0.5:5432/bambu',
    'postgresql://bambu:x@localhost.evil.com:5432/bambu',
    'postgresql://bambu:x@127.0.0.1.nip.io:5432/bambu',
  ])('rechaza una base remota: %s', (url) => expect(baseEsLocal(url)).toBe(false))

  it('una URL ausente, vacía o ilegible NO es local', () => {
    for (const url of [undefined, '', 'no es una url', 'postgresql://']) expect(baseEsLocal(url)).toBe(false)
  })
})

describe('seed-guard · exigirBaseLocal', () => {
  const remota = 'postgresql://postgres:x@db.abcdefghijklmnop.supabase.co:5432/postgres'

  it('no lanza con una base local', () => {
    expect(() => exigirBaseLocal('postgresql://bambu:x@localhost:5433/bambu', undefined)).not.toThrow()
  })

  it('se niega con una base remota y dice por qué y cómo confirmar', () => {
    expect(() => exigirBaseLocal(remota, undefined)).toThrow(/se niega a correr/)
    expect(() => exigirBaseLocal(remota, undefined)).toThrow(new RegExp(CONFIRMAR_SEED_REMOTO))
  })

  it('se niega si falta la URL (no asume que es local)', () => {
    expect(() => exigirBaseLocal(undefined, undefined)).toThrow(/se niega a correr/)
  })

  it('solo la confirmación exacta «1» lo permite; cualquier otra cosa no', () => {
    expect(() => exigirBaseLocal(remota, '1')).not.toThrow()
    for (const valor of ['true', 'si', '0', '', 'yes']) expect(() => exigirBaseLocal(remota, valor)).toThrow()
  })
})
