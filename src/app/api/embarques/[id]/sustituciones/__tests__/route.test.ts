// @tests embarques/[id]/sustituciones — ADR-SUSTITUCION-001 / contrato §9
//
// Contrato crítico: una sustitución produce DOS movimientos físicos
// SEPARADOS (RETORNO + ENTREGA), nunca un movimiento ambiguo con doble
// efecto. Persistencia atómica + idempotencia por offlineId.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(
  join(process.cwd(), 'src/app/api/embarques/[id]/sustituciones/route.ts'),
  'utf-8',
)

describe('POST — contrato §9: dos movimientos físicos separados', () => {
  it('usa construirMovimientosSustitucion del dominio (no arma los movimientos a mano)', () => {
    expect(source).toMatch(/from ['"]@\/modules\/embarques\/domain\/services\/ledger-fisico\.service['"]/)
    expect(source).toContain('construirMovimientosSustitucion({ producto, cantidad })')
  })

  it('valida AMBOS movimientos con validarMovimientoFisico', () => {
    expect(source).toContain('validarMovimientoFisico(recepcion)')
    expect(source).toContain('validarMovimientoFisico(entrega)')
  })

  it('persiste 2 EmbarqueMovimiento + 1 Sustitucion dentro de una transacción', () => {
    const txStart = source.indexOf('prisma.$transaction(async (tx) =>')
    expect(txStart).toBeGreaterThan(-1)
    const txBody = source.slice(txStart)
    const creates = txBody.match(/tx\.embarqueMovimiento\.create\(/g) ?? []
    expect(creates.length).toBe(2)
    expect(txBody).toContain('tx.sustitucion.create(')
  })

  it('la Sustitucion vincula ambos movimientos por id', () => {
    expect(source).toContain('movimientoRecepcionId: movRecepcion.id')
    expect(source).toContain('movimientoEntregaId: movEntrega.id')
  })

  it('audita dentro de la misma tx y publica realtime', () => {
    const txStart = source.indexOf('prisma.$transaction(async (tx) =>')
    expect(source.slice(txStart)).toMatch(/logAudit\(\s*\{[\s\S]*?\},\s*tx,?\s*\)/)
    expect(source).toContain("publishRealtimeEvent('embarque.updated', id)")
  })
})

describe('POST — auth e idempotencia', () => {
  it('exige ADMIN/ASISTENTE + requireOwnership', () => {
    expect(source).toContain('requireRole([ROLES.ADMIN, ROLES.ASISTENTE]')
    expect(source).toContain("requireOwnership('embarque', id")
  })

  it('replay con el mismo offlineId devuelve la sustitución existente (deduped)', () => {
    expect(source).toContain('prisma.sustitucion.findUnique')
    expect(source).toMatch(/deduped:\s*true/)
  })

  it('rechaza offlineId reusado en otro embarque (409)', () => {
    expect(source).toMatch(/existente\.embarqueId !== id[\s\S]*409/)
  })

  it('rechaza embarque CERRADO/CANCELADO y pedido ajeno', () => {
    expect(source).toMatch(/estado === 'CERRADO' \|\| .*estado === 'CANCELADO'/)
    expect(source).toContain('El pedido no pertenece a este embarque')
  })
})

describe('GET — lista', () => {
  it('devuelve sustituciones con sus movimientos, más reciente primero', () => {
    expect(source).toMatch(/orderBy:\s*\{\s*createdAt:\s*'desc'\s*\}/)
    expect(source).toContain('movimientoRecepcion: true')
    expect(source).toContain('movimientoEntrega: true')
  })
})
