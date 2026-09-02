// @tests F1 — auditoría transaccional en rutas financieras críticas
//
// Hallazgo (docs/pedidos/INVENTARIO_PEDIDOS_OPERACION_COMERCIAL.md §F1):
// `pagar-fiado`, `abonos` y `cierre` llamaban `logAudit(...)` DESPUÉS del
// commit, sin `await` y tragando el error (`.catch(() => {})` /
// `.catch(console.error)`). Un fallo de auditoría dejaba el hecho financiero
// commiteado sin evidencia.
//
// FIX: `logAudit(entry, tx)` corre DENTRO de la transacción/lock. Si la
// auditoría falla, `logAudit` re-lanza (src/lib/audit.ts) y el hecho de
// negocio hace rollback atómico (ADR-CONCURRENCIA-001 / contrato §51).
//
// Estos tests son de inspección de fuente (mismo patrón que los otros
// route tests del proyecto): verifican el ORDEN estructural, no ejecutan DB.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf-8')
}

describe('F1: pagar-fiado audita dentro del lock CARTERA', () => {
  const source = read('src/app/api/pedidos/pagar-fiado/route.ts')

  it('logAudit se llama con `tx` como segundo argumento', () => {
    expect(source).toMatch(/logAudit\(\{[\s\S]*?\},\s*tx\)/)
  })

  it('logAudit está DENTRO de withAdvisoryLock (antes del cierre del callback)', () => {
    const lockOpen = source.indexOf("withAdvisoryLock('CARTERA'")
    const auditCall = source.indexOf('await logAudit({')
    // el `return { pagosAplicados, montoRestante, culminados }` marca el fin
    // del trabajo dentro del lock
    const lockReturn = source.indexOf('return { pagosAplicados, montoRestante, culminados')

    expect(lockOpen).toBeGreaterThan(-1)
    expect(auditCall).toBeGreaterThan(lockOpen)
    expect(auditCall).toBeLessThan(lockReturn)
  })

  it('solo existe UNA invocación de logAudit y lleva `, tx)`', () => {
    const matches = source.match(/logAudit\(\{/g) ?? []
    expect(matches.length).toBe(1)
  })
})

describe('F1: abonos audita dentro del lock CARTERA', () => {
  const source = read('src/app/api/abonos/route.ts')

  it('logAudit se llama con `tx` y sin `.catch(() => {})`', () => {
    expect(source).toMatch(/await logAudit\(\{[\s\S]*?\},\s*tx\)/)
    expect(source).not.toMatch(/logAudit\([\s\S]*?\)\.catch\(/)
  })

  it('logAudit corre DESPUÉS de crear el abono y ANTES de cerrar el callback', () => {
    const abonoCreate = source.indexOf('tx.abono.create')
    const auditCall = source.indexOf('await logAudit({')
    const lockReturn = source.indexOf('return { abono, deduped: false as const }')

    expect(abonoCreate).toBeGreaterThan(-1)
    expect(lockReturn).toBeGreaterThan(-1)
    expect(auditCall).toBeGreaterThan(abonoCreate)
    expect(auditCall).toBeLessThan(lockReturn)
  })
})

describe('F1: cierre audita dentro de $transaction', () => {
  const source = read('src/app/api/cierre/route.ts')

  it('logAudit se llama con `tx` y sin `.catch(console.error)`', () => {
    expect(source).toMatch(/await logAudit\(\{[\s\S]*?\},\s*tx\)/)
    expect(source).not.toMatch(/logAudit\([\s\S]*?\)\.catch\(/)
  })

  it('logAudit corre después de cierreDia.create y antes de cerrar la $transaction', () => {
    const cierreCreate = source.indexOf('tx.cierreDia.create')
    const auditCall = source.indexOf('await logAudit({')
    const txClose = source.indexOf('isolationLevel: Prisma.TransactionIsolationLevel.Serializable')

    expect(cierreCreate).toBeGreaterThan(-1)
    expect(auditCall).toBeGreaterThan(cierreCreate)
    expect(auditCall).toBeLessThan(txClose)
  })

  it('notifyEvent (side effect) permanece FUERA de la transacción', () => {
    const txClose = source.indexOf('timeout: 15000')
    const notify = source.indexOf('notifyEvent(NotificationEventType.CIERRE_DIA_COMPLETADO')
    expect(notify).toBeGreaterThan(txClose)
  })
})
