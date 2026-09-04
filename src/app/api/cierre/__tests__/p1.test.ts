// @tests cierre POST — cálculo de totales por método de pago (CAJA)
// P-1: single-pass sobre los pagos (en vez de 5× flatMap+filter+reduce).
// F-B (auditoría #181): la fuente pasó a ser `pagosCapturadosHoy` (pagos por
// `Pago.createdAt`), no `pedido.pagos` (que era por `pedido.fecha`) — la CAJA
// del día se concilia por fecha de captura del dinero.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/cierre/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('cierre POST: totales por método de pago (single-pass, F-B)', () => {
  const postStart = source.indexOf('export async function POST')
  const postSource = source.substring(postStart)

  it('declara totalesPorMetodo con los 5 métodos', () => {
    const objectMatch = postSource.match(/totalesPorMetodo:\s*Record<string,\s*number>\s*=\s*\{[\s\S]+?\}/)
    expect(objectMatch).not.toBeNull()
    for (const m of ['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO']) {
      expect(objectMatch![0]).toMatch(new RegExp(m))
    }
  })

  it('F-B: itera `pagosCapturadosHoy` una sola vez, no `pedido.pagos`', () => {
    expect(postSource).toMatch(/for\s*\(const pago of pagosCapturadosHoy\)/)
    expect(postSource).not.toMatch(/for\s*\(const pago of pedido\.pagos\)/)
    expect(postSource).not.toMatch(/pedidos\.flatMap\(p => p\.pagos\)/)
  })

  it('F-B: `pagosCapturadosHoy` se consulta por `Pago.createdAt` del día', () => {
    expect(postSource).toMatch(/tx\.pago\.findMany\(\{\s*where:\s*\{\s*createdAt:\s*\{\s*gte:\s*startOfDay,\s*lt:\s*nextDay\s*\}/)
    // excluye pagos de pedidos ANULADO/CANCELADO (efecto neto $0)
    expect(postSource).toMatch(/pedido:\s*\{\s*estadoEntrega:\s*\{\s*notIn:\s*\[EstadoEntrega\.CANCELADO,\s*EstadoEntrega\.ANULADO\]/)
  })

  it('las constantes efectivo/... vienen de totalesPorMetodo', () => {
    expect(postSource).toMatch(/const efectivo = totalesPorMetodo\[MetodoPago\.EFECTIVO\]/)
    expect(postSource).toMatch(/const transferencia = totalesPorMetodo\[MetodoPago\.TRANSFERENCIA\]/)
    expect(postSource).toMatch(/const nequi = totalesPorMetodo\[MetodoPago\.NEQUI\]/)
    expect(postSource).toMatch(/const daviplata = totalesPorMetodo\[MetodoPago\.DAVIPLATA\]/)
    expect(postSource).toMatch(/const bono = totalesPorMetodo\[MetodoPago\.BONO\]/)
  })

  it('cobroVentasHoy sigue sumando los 5 métodos', () => {
    expect(postSource).toMatch(/const cobroVentasHoy = efectivo \+ transferencia \+ nequi \+ daviplata \+ bono/)
  })

  it('`cobrado` (métrica de ventas) sigue por `pedido.totalPagado` / `pedido.fecha`', () => {
    expect(postSource).toMatch(/const cobrado = pedidos\.reduce\(\(acc, p\) => acc \+ Number\(p\.totalPagado\), 0\)/)
  })
})
