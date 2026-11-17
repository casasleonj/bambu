// @tests #796 — la factura impresa para el cliente nunca incluye información interna; el historial interno sí
import { describe, it, expect } from 'vitest'
import { armarHistorialPagos, type AbonoParaHistorial, type PagoParaHistorial } from '../factura-historial-pagos'
import { historialInternoHtml, pagosRecibidosCliente, escaparHtml, type FormatosImpresion } from '../factura-impresion'

const f: FormatosImpresion = { moneda: (n) => `$${n.toLocaleString('es-CO')}`, fecha: (i) => i.slice(0, 10), fechaHora: (i) => i.slice(0, 16) }
const d = (iso: string) => new Date(iso)
const pago = (id: string, monto: number, at: string, o: Partial<PagoParaHistorial> = {}): PagoParaHistorial =>
  ({ id, metodo: 'EFECTIVO', monto, createdAt: d(at), ocurridoAt: null, confirmacion: 'CONFIRMADO', ...o })
const abonoConCorreccion = (pagoId: string): AbonoParaHistorial => ({
  id: 'a1', numero: 'ABO-1', monto: 5000, metodoPago: 'NEQUI', fecha: d('2026-11-17T20:40:00Z'), pagoOrigenId: pagoId,
  correcciones: [{ id: 'c1', numero: 'COR-00012', tipo: 'NO_RECIBIDO', montoRevertido: 3000, motivo: 'no llegó <b>x</b>', createdAt: d('2026-11-18T14:00:00Z'), autorizadoPor: 'Jhonnatan' }],
})
const PROHIBIDO = /por confirmar|discrepancia|COR-|autoriz|motivo|no recibido|no lleg|Jhonnatan/i

describe('#796 factura para el CLIENTE', () => {
  const h = armarHistorialPagos(
    [pago('p1', 35000, '2026-11-17T21:00:00Z'), pago('p2', 5000, '2026-11-17T22:40:00Z', { metodo: 'NEQUI', confirmacion: 'REPORTADO' })],
    [abonoConCorreccion('p2')],
  )
  it('lista fecha, medio e importe; una línea neutra «Ajuste de pagos»; total pagado', () => {
    const html = pagosRecibidosCliente(h, 37000, f)
    expect(html).toContain('Pagos recibidos')
    expect(html).toContain('2026-11-17 — Efectivo')
    expect(html).toContain('2026-11-17 — Nequi')
    expect(html).toContain('Ajuste de pagos')
    expect(html).toContain('−$3.000')
    expect(html).toMatch(/Total pagado[\s\S]*\$37\.000/)
  })
  it('NUNCA incluye estados, correcciones, motivos ni responsables (aunque el pago esté por confirmar o con discrepancia)', () => {
    for (const conf of ['REPORTADO', 'DISCREPANTE', 'CONFIRMADO']) {
      const hh = armarHistorialPagos([pago('p1', 5000, '2026-11-17T21:00:00Z', { confirmacion: conf })], [abonoConCorreccion('p1')])
      expect(pagosRecibidosCliente(hh, 2000, f)).not.toMatch(PROHIBIDO)
    }
    expect(pagosRecibidosCliente(h, 37000, f)).not.toMatch(PROHIBIDO)
  })
  it('sin ajustes no imprime la línea de ajuste', () => {
    const hh = armarHistorialPagos([pago('p1', 5000, '2026-11-17T21:00:00Z')], [])
    expect(pagosRecibidosCliente(hh, 5000, f)).not.toContain('Ajuste')
  })
  it('si la lista no cuadra con lo que marca la factura, imprime solo el total pagado (nunca una lista que no suma)', () => {
    const html = pagosRecibidosCliente(h, 99999, f)
    expect(html).toContain('Total pagado')
    expect(html).not.toContain('Efectivo')
  })
  it('historial caído o ausente: solo total pagado; sin pagos: nada', () => {
    expect(pagosRecibidosCliente(null, 12000, f)).toMatch(/Total pagado[\s\S]*\$12\.000/)
    expect(pagosRecibidosCliente(undefined, 0, f)).toBe('')
    expect(pagosRecibidosCliente(armarHistorialPagos([], []), 0, f)).toBe('')
  })
})

describe('#796 historial INTERNO', () => {
  const h = armarHistorialPagos(
    [pago('p1', 35000, '2026-11-17T21:00:00Z'), pago('p2', 5000, '2026-11-17T22:40:00Z', { metodo: 'NEQUI', confirmacion: 'REPORTADO' })],
    [abonoConCorreccion('p2')],
  )
  const html = historialInternoHtml({ facturaNumero: 'FAC-1', clienteNombre: 'Cliente' }, h, f, '18 nov 2026 9:00')
  it('incluye estados, correcciones, responsable, motivo y la leyenda de uso interno', () => {
    expect(html).toContain('HISTORIAL INTERNO DE PAGOS')
    expect(html).toContain('(por confirmar)')
    expect(html).toContain('COR-00012')
    expect(html).toContain('autorizó Jhonnatan')
    expect(html).toContain('sobre el pago #2')
    expect(html).toContain('Documento de uso interno · no entregar al cliente')
    expect(html).toContain('Total pagado neto')
  })
  it('escapa el texto libre (motivo) para que no inyecte HTML', () => {
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(escaparHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;')
  })
  it('una factura sin pagos imprime «Sin pagos»', () => {
    expect(historialInternoHtml({ facturaNumero: 'F', clienteNombre: 'C' }, armarHistorialPagos([], []), f, 'x')).toContain('Sin pagos')
  })
})
