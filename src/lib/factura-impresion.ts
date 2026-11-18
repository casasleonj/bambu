// #796 — Fragmentos HTML de impresión de la factura. Funciones puras (sin DOM), para probar que el documento
// del CLIENTE nunca incluye información interna (estados, correcciones, motivos, responsables).
import type { HistorialPagos } from '@/lib/factura-historial-pagos'

export interface FormatosImpresion {
  moneda: (n: number) => string
  fecha: (iso: string) => string
  fechaHora: (iso: string) => string
}

const NOMBRE_MEDIO: Record<string, string> = {
  EFECTIVO: 'Efectivo', NEQUI: 'Nequi', TRANSFERENCIA: 'Transferencia', DAVIPLATA: 'Daviplata', BONO: 'Bono',
}
const ETIQUETA_CORRECCION: Record<string, string> = {
  MONTO: 'Monto corregido', CLIENTE: 'Cliente equivocado', FACTURA: 'Factura equivocada', NO_RECIBIDO: 'Pago no recibido',
}

export const escaparHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const centavos = (n: number): number => Math.round(n * 100)
const fila = (izq: string, der: string, estilo = ''): string =>
  `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee;font-size:12px;${estilo}"><span>${izq}</span><span><strong>${der}</strong></span></div>`
const titulo = (t: string, color = '#4CAF50'): string =>
  `<h3 style="font-size:11px;font-weight:bold;text-transform:uppercase;color:${color};margin-bottom:10px;border-bottom:2px solid ${color};padding-bottom:5px;">${t}</h3>`

/**
 * Bloque «Pagos recibidos» de la factura que se ENTREGA al cliente. Solo fecha, medio e importe de cada pago
 * (sin «por confirmar», sin discrepancias), una única línea neutra «Ajuste de pagos» si hubo correcciones
 * y el total pagado. Si no se puede garantizar que la lista sume lo que la factura marca (historial caído,
 * sin historial o con divergencia), se imprime solo el total pagado: nunca una lista que no cuadra.
 */
export function pagosRecibidosCliente(
  historial: HistorialPagos | null | undefined,
  montoPagado: number,
  f: FormatosImpresion,
): string {
  const hayPagado = centavos(montoPagado) > 0
  const cuadra = !!historial && historial.pagos.length > 0 && centavos(historial.totalNeto) === centavos(montoPagado)
  if (!cuadra || !historial) {
    return hayPagado
      ? `<div style="margin-bottom:20px;">${titulo('Pagos recibidos')}${fila('Total pagado', f.moneda(montoPagado))}</div>`
      : ''
  }
  const lineas = historial.pagos
    .map((p) => fila(`${f.fecha(p.fecha)} — ${escaparHtml(NOMBRE_MEDIO[p.metodo] ?? p.metodo)}`, f.moneda(p.monto)))
    .join('')
  const ajuste = centavos(historial.totalCorregido) > 0
    ? fila('Ajuste de pagos', `−${f.moneda(historial.totalCorregido)}`)
    : ''
  return `<div style="margin-bottom:20px;">${titulo('Pagos recibidos')}${lineas}${ajuste}${fila('Total pagado', f.moneda(montoPagado))}</div>`
}

/** Documento INTERNO (solo ADMIN y CONTADOR): historial completo con estados, correcciones y responsables. */
export function historialInternoHtml(
  datos: { facturaNumero: string; clienteNombre: string },
  historial: HistorialPagos,
  f: FormatosImpresion,
  impresoEn: string,
): string {
  const pagos = historial.pagos
    .map((p) => {
      const estado = p.confirmacion === 'REPORTADO' ? ' <b style="color:#92400e">(por confirmar)</b>'
        : p.confirmacion === 'DISCREPANTE' ? ' <b style="color:#991b1b">(con discrepancia)</b>' : ''
      return fila(`#${p.numero} ${f.fechaHora(p.fecha)} — ${escaparHtml(NOMBRE_MEDIO[p.metodo] ?? p.metodo).toUpperCase()}${estado}`, f.moneda(p.monto))
    })
    .join('')
  const correcciones = historial.correcciones.length === 0 ? '' : `
    <div style="margin-bottom:20px;">${titulo(`Correcciones de pagos (${historial.correcciones.length})`, '#E65100')}
      ${historial.correcciones.map((c) => fila(
        `<strong>${escaparHtml(c.numero)}</strong> ${f.fecha(c.fecha)} · ${escaparHtml(ETIQUETA_CORRECCION[c.tipo] ?? 'Corrección')}`
          + `${c.autorizadoPor ? ` · autorizó ${escaparHtml(c.autorizadoPor)}` : ''}`
          + `${c.sobrePagoNumero ? ` (sobre el pago #${c.sobrePagoNumero})` : ''}`
          + `${c.motivo ? `<br><span style="color:#92400e">Motivo: ${escaparHtml(c.motivo)}</span>` : ''}`,
        `−${f.moneda(c.monto)}`, 'color:#E65100;')).join('')}
    </div>`
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
      <div><div style="font-size:16px;font-weight:900;">HISTORIAL INTERNO DE PAGOS</div>
        <div style="font-size:12px;color:#666;">Factura ${escaparHtml(datos.facturaNumero)} · ${escaparHtml(datos.clienteNombre)}</div></div>
      <div style="font-size:11px;color:#666;text-align:right;">Impreso ${escaparHtml(impresoEn)}</div>
    </div>
    <div style="margin-bottom:20px;">${titulo(`Historial de pagos (${historial.pagos.length})`)}${pagos || '<div style="font-size:12px;color:#666;">Sin pagos.</div>'}</div>
    ${correcciones}
    ${fila('Total pagado neto', f.moneda(historial.totalNeto))}
    <div style="margin-top:18px;padding:8px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;font-weight:bold;text-align:center;font-size:11px;text-transform:uppercase;">Documento de uso interno · no entregar al cliente</div>`
}
