'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { getAnonymousClientDisplayName } from '@/lib/cliente-canonical'
import type { Factura, EmpresaConfig } from './types'
import { pedidoEnConsulta } from '@/lib/pedidos-contexto'
import { formatPrecioUnitario, formatImportePedido as formatCurrency } from '@/lib/precio-formato'
import { historialInternoHtml, pagosRecibidosCliente, type FormatosImpresion } from '@/lib/factura-impresion'
import type { FilaPago } from '@/lib/factura-historial-pagos'
import { CorregirModal } from '@/components/cartera/corregir-modal'

const BRAND = {
  green: '#4CAF50',
  blue: '#2196F3',
  brown: '#8D6E63',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
}

function formatFechaHora(iso: string): string {
  const f = new Date(iso)
  const dia = f.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Bogota' })
  const hora = f.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' })
  // «17 de nov de 2026» → «17 nov 2026»: más corto para que no se parta en pantallas angostas.
  return `${dia.replace(/ de /g, ' ')} · ${hora}`
}

/** #796: nombre legible del tipo de corrección (solo se muestra a quien puede ver su detalle). */
const ETIQUETA_CORRECCION: Record<string, string> = {
  MONTO: 'Monto corregido', CLIENTE: 'Cliente equivocado', FACTURA: 'Factura equivocada', NO_RECIBIDO: 'Pago no recibido',
}

/** #796: texto de estado del pago; solo lo que aún no está confirmado se marca. */
function etiquetaConfirmacion(c: string | null): { texto: string; clase: string } | null {
  if (c === 'REPORTADO') return { texto: 'Por confirmar', clase: 'bg-amber-100 text-amber-800' }
  if (c === 'DISCREPANTE') return { texto: 'Con discrepancia', clase: 'bg-red-100 text-red-800' }
  return null
}

/** Formatos de los documentos impresos (zona de Bogotá, fecha corta). */
const FORMATOS_IMPRESION: FormatosImpresion = {
  moneda: (n) => formatCurrency(n),
  fecha: (iso) => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Bogota' }).replace(/ de /g, ' '),
  fechaHora: (iso) => formatFechaHora(iso),
}

/** Abre un documento en un iframe oculto y lo manda a imprimir (el mismo mecanismo de la factura). */
function imprimirEnIframe(html: string): void {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:0;height:0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (!doc) { document.body.removeChild(iframe); return }
  doc.open()
  doc.write(html)
  doc.close()
  iframe.onload = () => {
    iframe.contentWindow?.print()
    setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe) }, 1000)
  }
}

interface FacturaDetailProps {
  onReintentarPagos?: () => void
  factura: Factura
  empresaConfig: EmpresaConfig
  onRegistrarAbono?: () => void
  onOpenPedido?: (id: string) => void
  volverPedidos?: string | null
}

export function FacturaDetail({ factura, empresaConfig, onRegistrarAbono, onOpenPedido,volverPedidos, onReintentarPagos }: FacturaDetailProps) {
  const [printReady, setPrintReady] = useState(false)
  // Evita imprimir dos veces por doble clic mientras se prepara el documento.
  const [imprimiendo, setImprimiendo] = useState(false)
  // #796 fase 2b: cobro que se está corrigiendo (solo ADMIN y CONTADOR reciben `corregir` del servidor).
  const [corrigiendo, setCorrigiendo] = useState<FilaPago | null>(null)
  const protegerImpresion = (accion: () => void) => {
    if (imprimiendo) return
    setImprimiendo(true)
    try { accion() } finally { setTimeout(() => setImprimiendo(false), 1500) }
  }

  useEffect(() => {
    // Bandera de hidratación SSR-safe: no se puede derivar durante el
    // render (el primer render de cliente debe coincidir con el del
    // servidor, que renderiza null hasta que el efecto corra).
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setPrintReady(true)
  }, [])

  const items = factura.pedido?.items || []
  const total = Number(factura.total)
  const pagado = Number(factura.montoPagado || 0)
  const saldo = Number(factura.saldo)
  const progreso = total > 0 ? Math.round((pagado / total) * 100) : 0
  const clienteDisplayName = getAnonymousClientDisplayName(factura.cliente?.id, 'short') ?? (() => {
    if (!factura.cliente) return 'N/A'
    return [factura.cliente.nombre, factura.cliente.apellido].filter(Boolean).join(' ')
  })()

  const empresa = {
    nombre: factura.empresaNombre || empresaConfig.nombre,
    nit: factura.empresaNit || empresaConfig.nit,
    direccion: factura.empresaDireccion || empresaConfig.direccion,
    telefono: factura.empresaTelefono || empresaConfig.telefono,
    email: factura.empresaEmail || empresaConfig.email,
  }

  const handlePrintInterno = () => protegerImpresion(() => {
    const h = factura.historialPagos
    if (!h || !factura.puedeVerHistorialInterno) return
    const cuerpo = historialInternoHtml(
      { facturaNumero: factura.numero, clienteNombre: clienteDisplayName },
      h, FORMATOS_IMPRESION, formatFechaHora(new Date().toISOString()),
    )
    imprimirEnIframe(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Historial interno ${factura.numero}</title><style>body{font-family:Arial,sans-serif;margin:15mm;color:#000;background:#fff}@page{margin:15mm;size:letter}</style></head><body>${cuerpo}</body></html>`)
  })

  const handlePrint = () => protegerImpresion(() => {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'absolute'
    iframe.style.top = '-9999px'
    iframe.style.left = '-9999px'
    iframe.style.width = '0'
    iframe.style.height = '0'
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (!doc) return

    const itemsHtml = items.map((item) => {
      const meta = getProductoIconConfig(item.producto)
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;">${meta.label}${item.cantRegaloPedido ? `<br><small>+ ${item.cantRegaloPedido} de regalo · ${item.cantPedido + item.cantRegaloPedido} unidades físicas</small>` : ''}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;">${item.cantPedido}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;">${formatPrecioUnitario(Number(item.precio))}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;"><strong>${formatCurrency(Number(item.subtotal))}</strong></td>
        </tr>
      `
    }).join('')

    // #796: la factura que se ENTREGA al cliente lleva «Pagos recibidos» (fecha, medio, importe), sin información interna.
    const abonosHtml = pagosRecibidosCliente(factura.historialPagos, pagado, FORMATOS_IMPRESION)

    const notasCreditoHtml = factura.notasCredito && factura.notasCredito.length > 0
      ? `
        <div style="margin-bottom:20px;">
          <h3 style="font-size:11px;font-weight:bold;text-transform:uppercase;color:#E65100;margin-bottom:10px;">Notas de Crédito</h3>
          ${factura.notasCredito.map((nc) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee;font-size:12px;">
              <span><strong>${nc.numero}</strong> <span style="color:#666;margin-left:8px;">${nc.motivo}</span></span>
              <span style="font-weight:bold;color:#E65100;">-${formatCurrency(Number(nc.monto))}</span>
            </div>
          `).join('')}
        </div>
      `
      : ''

    doc.open()
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Factura #${factura.numero}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 15mm; color: #000; background: white; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
          .logo { max-height: 60px; }
          .factura-title { text-align: right; }
          .factura-title h1 { font-size: 32px; font-weight: 900; margin: 0; letter-spacing: -1px; }
          .factura-title .numero { font-size: 18px; font-weight: bold; color: #666; margin-top: 5px; }
          .factura-title .estado { font-size: 12px; margin-top: 5px; font-weight: bold; }
          .tagline { text-align: center; font-size: 14px; color: #2196F3; margin: 10px 0; letter-spacing: 2px; text-transform: uppercase; }
          .two-columns { display: flex; gap: 40px; margin-bottom: 20px; }
          .column { flex: 1; }
          .column h3 { font-size: 11px; font-weight: bold; text-transform: uppercase; color: #4CAF50; margin-bottom: 10px; border-bottom: 2px solid #4CAF50; padding-bottom: 5px; }
          .field { margin-bottom: 8px; }
          .field-label { font-size: 11px; color: #666; }
          .field-value { font-size: 13px; font-weight: bold; }
          .meta { font-size: 12px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #f5f5f5; padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #ddd; }
          td { padding: 8px; font-size: 12px; border-bottom: 1px solid #eee; }
          .text-right { text-align: right; }
          .total-box { text-align: right; margin: 20px 0; }
          .total-box .label { font-size: 14px; font-weight: bold; }
          .total-box .amount { font-size: 28px; font-weight: 900; color: #4CAF50; }
          .notas { margin-top: 30px; border-top: 2px solid #ddd; padding-top: 15px; }
          .notas h3 { font-size: 11px; font-weight: bold; text-transform: uppercase; color: #4CAF50; margin-bottom: 10px; }
          .notas ul { margin: 0; padding-left: 20px; font-size: 11px; color: #666; }
          .notas li { margin-bottom: 5px; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #8D6E63; }
          @page { margin: 15mm; size: letter; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="/logo-agua-bambu.jpg" class="logo" alt="Agua Bambú" />
          <div class="factura-title">
            <h1>FACTURA</h1>
            <div class="numero">No. ${factura.numero}</div>
            <div class="estado">${factura.estado}</div>
          </div>
        </div>
        <div class="tagline">— Bebe la diferencia —</div>
        
        <div class="two-columns">
          <div class="column">
            <h3>Datos del Cliente</h3>
            ${factura.cliente ? `
              <div class="field"><div class="field-label">Nombre</div><div class="field-value">${clienteDisplayName}</div></div>
              ${factura.cliente.telefono ? `<div class="field"><div class="field-label">Teléfono</div><div class="field-value">${factura.cliente.telefono}</div></div>` : ''}
              ${factura.cliente.direccion ? `<div class="field"><div class="field-label">Dirección</div><div class="field-value">${factura.cliente.direccion}</div></div>` : ''}
            ` : '<div class="field"><div class="field-value">N/A</div></div>'}
          </div>
          <div class="column">
            <h3>Datos de la Empresa</h3>
            <div class="field"><div class="field-label">Empresa</div><div class="field-value">${empresa.nombre}</div></div>
            <div class="field"><div class="field-label">NIT</div><div class="field-value">${empresa.nit}</div></div>
            ${empresa.telefono ? `<div class="field"><div class="field-label">Teléfono</div><div class="field-value">${empresa.telefono}</div></div>` : ''}
            ${empresa.email ? `<div class="field"><div class="field-label">Correo</div><div class="field-value">${empresa.email}</div></div>` : ''}
            ${empresa.direccion ? `<div class="field"><div class="field-label">Ubicación</div><div class="field-value">${empresa.direccion}</div></div>` : ''}
          </div>
        </div>
        
        <div class="meta"><strong>Fecha de emisión:</strong> ${formatDateLong(factura.fecha)}</div>
        
        ${items.length > 0 ? `
          <h3 style="font-size:11px;font-weight:bold;text-transform:uppercase;color:#4CAF50;margin-bottom:10px;border-bottom:2px solid #4CAF50;padding-bottom:5px;">Detalle de Pedidos</h3>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th style="text-align:right;">Cant.</th>
                <th style="text-align:right;">V. Unitario</th>
                <th style="text-align:right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
        ` : ''}
        
        <div class="total-box">
          <div class="label">TOTAL ${factura.estado === 'PAGADA' ? 'PAGADO' : ''}</div>
          <div class="amount">${formatCurrency(total)}</div>
        </div>
        ${saldo > 0 ? `<div style="text-align:right;font-size:12px;color:#666;">Saldo pendiente: ${formatCurrency(saldo)}</div>` : ''}
        
        ${abonosHtml}
        ${notasCreditoHtml}
        
        <div class="notas">
          <h3>Notas</h3>
          <ul>
            <li>Pago por adelantado o según acuerdo con el cliente.</li>
            <li>Cualquier reclamación debe realizarse dentro de los 3 días hábiles siguientes.</li>
            <li>Conserve este documento como comprobante de su compra.</li>
          </ul>
        </div>
        
        <div class="footer">Gracias por su compra — ${empresa.nombre}</div>
      </body>
      </html>
    `)
    doc.close()

    iframe.onload = () => {
      iframe.contentWindow?.print()
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe)
        }
      }, 1000)
    }
  })

  if (!printReady) return null

  return (
    <div className="factura-print-container" id="factura-print">
      {/* Botones de acción */}
      {/* #868: en celular cada botón ocupa su línea (44 px táctiles) y puede partir su texto; desde 640 px vuelve la fila a la derecha. */}
      <div className="flex flex-wrap gap-2 mb-6 sm:justify-end">
        <Button onClick={handlePrint} variant="outline" size="sm" disabled={imprimiendo} data-testid="factura-imprimir-cliente"
          className="w-full min-h-11 h-auto whitespace-normal sm:w-auto sm:min-h-9">
          <svg className="w-4 h-4 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Factura para el cliente
        </Button>
        {factura.puedeVerHistorialInterno && factura.historialPagos && (
          <Button onClick={handlePrintInterno} variant="outline" size="sm" disabled={imprimiendo} data-testid="factura-imprimir-interno"
            className="w-full min-h-11 h-auto whitespace-normal border-orange-700 text-orange-800 hover:bg-orange-50 sm:w-auto sm:min-h-9">
            Historial interno de pagos
          </Button>
        )}
        {saldo > 0 && factura.estado !== 'ANULADA' && onRegistrarAbono && factura.pedido?.estadoEntrega === 'ENTREGADO' && (
          <Button onClick={onRegistrarAbono} size="sm" style={{ backgroundColor: BRAND.green }} className="w-full min-h-11 h-auto whitespace-normal hover:opacity-90 text-white border-0 sm:w-auto sm:min-h-9">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Registrar Abono
          </Button>
        )}
      </div>
      {saldo > 0 && factura.estado !== 'ANULADA' && factura.pedido && factura.pedido.estadoEntrega !== 'ENTREGADO' && (
        <div className="max-w-3xl mx-auto mb-4 -mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No se puede registrar abono todavia: el pedido #{factura.pedido.numero} aun no ha sido entregado.
        </div>
      )}

      {/* Contenido de la factura */}
      <div className="factura-content bg-white border rounded-lg overflow-hidden max-w-3xl mx-auto">
        
        {/* ════════════════════════════════════════
            HEADER — Logo + FACTURA + datos
            ════════════════════════════════════════ */}
        <div className="border-b border-gray-200 px-6 md:px-8 py-6">
          {/* Fila superior: Logo + Título + Estado (screen) */}
          <div className="flex items-start justify-between gap-4">
            {/* Logo + Empresa */}
            <div className="flex items-center gap-4">
              <Image
                src="/logo-agua-bambu.jpg"
                alt="Agua Bambú"
                width={1280}
                height={652}
                className="h-20 w-auto object-contain"
              />
              {/* Datos de empresa se muestran en columna derecha */}
            </div>

            {/* FACTURA + Número + Estado */}
            <div className="text-right">
              <p className="text-3xl font-black tracking-tight text-gray-900">FACTURA</p>
              <p className="text-xl font-bold mt-1" style={{ color: BRAND.brown }}>No. {factura.numero}</p>
              
              {/* Badge estado */}
              <div className="mt-2">
                {factura.estado === 'PAGADA' && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    PAGADA
                  </span>
                )}
                {factura.estado === 'EMITIDA' && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    EMITIDA
                  </span>
                )}
                {factura.estado === 'ANULADA' && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    ANULADA
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Tagline */}
          <p className="text-center text-sm font-medium mt-4 tracking-widest uppercase" style={{ color: BRAND.blue }}>
            — Bebe la diferencia —
          </p>
        </div>

        <div className="px-6 md:px-8 py-6">
          
          {/* ════════════════════════════════════════
              DOS COLUMNAS: Cliente | Empresa
              (Formato del PDF real)
              ════════════════════════════════════════ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* DATOS DEL CLIENTE */}
            <div className="bg-gray-50 rounded-xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: BRAND.green }}>
                Datos del Cliente
              </h3>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-400">Nombre</p>
                  {factura.cliente?.id && !getAnonymousClientDisplayName(factura.cliente.id) ? (
                    <a
                      href={`/clientes?openCliente=${factura.cliente.id}`}
                      className="text-sm font-semibold text-gray-900 hover:text-blue-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {clienteDisplayName}
                    </a>
                  ) : (
                    <p className="text-sm font-semibold text-gray-900">{clienteDisplayName}</p>
                  )}

                </div>
                {factura.cliente?.telefono && (
                  <div>
                    <p className="text-xs text-gray-400">Teléfono</p>
                    <p className="text-sm text-gray-700">{factura.cliente.telefono}</p>
                  </div>
                )}
                {factura.cliente?.direccion && (
                  <div>
                    <p className="text-xs text-gray-400">Dirección</p>
                    <p className="text-sm text-gray-700">{factura.cliente.direccion}</p>
                    {factura.cliente.barrio && (
                      <p className="text-sm text-gray-700">{factura.cliente.barrio}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* DATOS DE LA EMPRESA */}
            <div className="bg-gray-50 rounded-xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: BRAND.green }}>
                Datos de la Empresa
              </h3>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-400">Empresa</p>
                  <p className="text-sm font-semibold text-gray-900">{empresa.nombre}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">NIT</p>
                  <p className="text-sm text-gray-700">{empresa.nit}</p>
                </div>
                {empresa.telefono && (
                  <div>
                    <p className="text-xs text-gray-400">Teléfono</p>
                    <p className="text-sm text-gray-700">{empresa.telefono}</p>
                  </div>
                )}
                {empresa.email && (
                  <div>
                    <p className="text-xs text-gray-400">Correo</p>
                    <p className="text-sm text-gray-700">{empresa.email}</p>
                  </div>
                )}
                {empresa.direccion && (
                  <div>
                    <p className="text-xs text-gray-400">Ubicación</p>
                    <p className="text-sm text-gray-700">{empresa.direccion}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Fecha + Pedido */}
          <div className="flex items-center justify-between mb-6 text-sm">
            <div className="flex items-center gap-4">
              <span className="text-gray-500">
                <span className="font-medium text-gray-700">Fecha de emisión:</span>{' '}
                {formatDateLong(factura.fecha)}
              </span>
              {factura.pedido && (
                <span>
                  <span className="font-medium text-gray-700">Pedido:</span>{' '}
                  <a
                    href={pedidoEnConsulta(factura.pedido.id,volverPedidos)}
                    onClick={e => { e.stopPropagation(); if (onOpenPedido && factura.pedido && e.button===0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) { e.preventDefault(); onOpenPedido(factura.pedido.id) } }}
                    className="text-blue-600 hover:underline"
                  >
                    #{factura.pedido.numero}
                  </a>
                </span>
              )}
            </div>
            {factura.createdBy && (
              <span className="text-xs text-gray-400">Creado por: {factura.createdBy.username}</span>
            )}
          </div>

          {/* ════════════════════════════════════════
              TABLA DE PRODUCTOS
              ════════════════════════════════════════ */}
          {items.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: BRAND.green }}>
                Detalle de Pedidos
              </h3>
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-2 sm:px-4 text-xs font-bold text-gray-600 uppercase">Producto</TableHead>
                      <TableHead className="px-2 sm:px-4 text-xs font-bold text-gray-600 uppercase text-right">Cant.</TableHead>
                      <TableHead className="px-2 sm:px-4 text-xs font-bold text-gray-600 uppercase text-right hidden sm:table-cell">V. Unitario</TableHead>
                      <TableHead className="px-2 sm:px-4 text-xs font-bold text-gray-600 uppercase text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const meta = getProductoIconConfig(item.producto)
                      const Icon = meta.Icon
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="px-2 sm:px-4 py-3">
                            <Icon size={18} className="inline-block mr-2 align-text-bottom" />
                            <span className="text-sm font-medium">{meta.label}</span>
                            {(item.cantRegaloPedido ?? 0) > 0 && <p className="mt-1 text-xs text-amber-800">+ {item.cantRegaloPedido} de regalo · {item.cantPedido + (item.cantRegaloPedido ?? 0)} unidades físicas</p>}
                          </TableCell>
                          <TableCell className="px-2 sm:px-4 py-3 text-right text-sm">{item.cantPedido}</TableCell>
                          <TableCell className="px-2 sm:px-4 py-3 text-right text-sm hidden sm:table-cell">{formatPrecioUnitario(Number(item.precio))}</TableCell>
                          <TableCell className="px-2 sm:px-4 py-3 text-right text-sm font-bold">{formatCurrency(Number(item.subtotal))}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════
              BARRA DE PROGRESO + TOTALES
              ════════════════════════════════════════ */}
          
          {/* Barra de progreso (oculta si está anulada) */}
          {factura.estado !== 'ANULADA' && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Progreso de pago</h3>
                <span className={`text-sm font-bold ${progreso === 100 ? 'text-green-600' : 'text-blue-600'}`}>
                  {progreso}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="h-3 rounded-full transition-all duration-500"
                  style={{ width: `${progreso}%`, backgroundColor: progreso === 100 ? BRAND.green : BRAND.blue }}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-xs text-gray-400">
                <span>{formatCurrency(pagado)} pagado</span>
                <span>{formatCurrency(total)} total</span>
              </div>
            </div>
          )}

          {/* Totales en cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">Subtotal</p>
              <p className="text-sm font-semibold text-gray-900">{formatCurrency(Number(factura.subtotal || factura.total))}</p>
            </div>
            <div className={`rounded-xl p-4 text-center border ${factura.estado === 'ANULADA' ? 'bg-gray-50 border-gray-100' : 'bg-green-50 border-green-100'}`}>
              <p className={`text-xs mb-1 ${factura.estado === 'ANULADA' ? 'text-gray-400' : 'text-green-600'}`}>Pagado</p>
              <p className={`text-sm font-semibold ${factura.estado === 'ANULADA' ? 'text-gray-500' : 'text-green-700'}`}>{formatCurrency(pagado)}</p>
            </div>
            <div className={`rounded-xl p-4 text-center border ${saldo > 0 && factura.estado !== 'ANULADA' ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
              <p className={`text-xs mb-1 ${saldo > 0 && factura.estado !== 'ANULADA' ? 'text-red-600' : 'text-gray-400'}`}>
                {saldo > 0 && factura.estado !== 'ANULADA' ? 'Saldo' : 'Estado'}
              </p>
              {saldo > 0 && factura.estado !== 'ANULADA' ? (
                <p className="text-sm font-bold text-red-700">{formatCurrency(saldo)}</p>
              ) : factura.estado === 'ANULADA' ? (
                <p className="text-sm font-bold text-gray-500">Anulada</p>
              ) : (
                <p className="text-sm font-bold text-green-600">PAGADA</p>
              )}
            </div>
            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: BRAND.green }}>
              <p className="text-xs text-green-100 mb-1">Total</p>
              <p className="text-sm font-bold text-white">{formatCurrency(total)}</p>
            </div>
          </div>



          {/* ════════════════════════════════════════
              ABONOS — Timeline (screen) / Lista simple (print)
              ════════════════════════════════════════ */}
          {factura.historialPagosError && (
            <div role="alert" data-testid="factura-pagos-error" className="mb-8 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <span>No se pudo cargar los pagos de esta factura. Los totales de arriba siguen siendo válidos.</span>
              {onReintentarPagos && <button className="rounded-lg border border-blue-600 bg-white px-3 py-1 text-xs font-semibold text-blue-700" onClick={onReintentarPagos}>Reintentar</button>}
            </div>
          )}
          {factura.historialPagos ? (
            <div className="mb-8" data-testid="factura-historial-pagos">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-1.5" style={{ color: BRAND.green }}>
                Historial de pagos ({factura.historialPagos.pagos.length})
              </h3>
              {factura.historialPagos.pagos.length === 0 && <p className="text-sm text-gray-500" data-testid="factura-sin-pagos">Esta factura todavía no tiene pagos.</p>}
              <div className="space-y-0">
                {factura.historialPagos.pagos.map((p, i, arr) => {
                  const chip = etiquetaConfirmacion(p.confirmacion)
                  return (
                    <div key={p.clave} className="flex gap-3" data-testid="factura-pago-fila">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2" style={{ backgroundColor: '#E8F5E9', borderColor: BRAND.green }}>
                          <span className="text-xs font-bold" style={{ color: BRAND.green }}>{p.numero}</span>
                        </div>
                        {(i < arr.length - 1 || factura.historialPagos!.correcciones.length > 0) && <div className="w-0.5 flex-1 mt-1" style={{ backgroundColor: '#C8E6C9' }} />}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="rounded-lg px-4 py-3 flex justify-between items-center gap-2" style={{ backgroundColor: '#E8F5E9' }}>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">{formatFechaHora(p.fecha)}</p>
                            <p className="text-xs text-gray-500 uppercase">{p.metodo}
                              {chip && <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold normal-case ${chip.clase}`}>{chip.texto}</span>}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-lg font-bold whitespace-nowrap" style={{ color: BRAND.green }}>{formatCurrency(Number(p.monto))}</span>
                            {p.corregir && (
                              <div>
                                <button type="button" data-testid="factura-pago-corregir" className="text-xs font-semibold text-blue-700 hover:underline" onClick={() => setCorrigiendo(p)}>
                                  Corregir
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {factura.historialPagos.correcciones.map((c) => (
                  <div key={c.id} className="flex gap-3" data-testid="factura-correccion-fila">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2" style={{ backgroundColor: '#FFF3E0', borderColor: '#E65100' }}>
                        <span className="text-xs font-bold" style={{ color: '#E65100' }}>↩</span>
                      </div>
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="rounded-lg px-4 py-3 flex justify-between items-center gap-2 border" style={{ backgroundColor: '#FFF3E0', borderColor: '#FFE0B2' }}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900"><b>{c.numero}</b>{c.motivo !== null ? ` · ${ETIQUETA_CORRECCION[c.tipo] ?? 'Corrección'}` : ''}</p>
                          <p className="text-xs uppercase" style={{ color: '#92400e' }}>
                            {formatDate(c.fecha)}{c.autorizadoPor ? ` · autorizó ${c.autorizadoPor}` : ''}{c.sobrePagoNumero ? ` · sobre el pago #${c.sobrePagoNumero}` : ''}
                          </p>
                        </div>
                        <span className="text-lg font-bold whitespace-nowrap shrink-0" style={{ color: '#E65100' }}>−{formatCurrency(Number(c.monto))}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {factura.historialPagos.correcciones.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">Pagado = pagos − correcciones ({formatCurrency(factura.historialPagos.totalPagado)} − {formatCurrency(factura.historialPagos.totalCorregido)}). Una corrección no borra el pago: aparece como su propia fila.</p>
              )}
              {typeof factura.montoPagado === 'number' && Math.abs(factura.historialPagos.totalNeto - factura.montoPagado) > 0.005 && (
                <p data-testid="factura-pagos-divergencia" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  El historial suma {formatCurrency(factura.historialPagos.totalNeto)} y la factura marca {formatCurrency(factura.montoPagado)} pagados. Avísale al administrador para conciliarlo.
                </p>
              )}
            </div>
          ) : (
            <>
          {factura.abonos && factura.abonos.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-1.5" style={{ color: BRAND.green }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Historial de pagos ({factura.abonos.length})
              </h3>
              
              {/* Timeline */}
              <div className="space-y-0">
                {factura.abonos.map((abono, i) => (
                  <div key={abono.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2" style={{ backgroundColor: '#E8F5E9', borderColor: BRAND.green }}>
                        <span className="text-xs font-bold" style={{ color: BRAND.green }}>{i + 1}</span>
                      </div>
                      {i < factura.abonos!.length - 1 && (
                        <div className="w-0.5 flex-1 mt-1" style={{ backgroundColor: '#C8E6C9' }} />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="rounded-lg px-4 py-3 flex justify-between items-center" style={{ backgroundColor: '#E8F5E9' }}>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{formatDate(abono.fecha)}</p>
                          <p className="text-xs text-gray-500 uppercase">{abono.metodoPago}</p>
                        </div>
                        <span className="text-lg font-bold" style={{ color: BRAND.green }}>{formatCurrency(Number(abono.monto))}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>


            </div>
          )}

            </>
          )}

          {/* ════════════════════════════════════════
              NOTAS DE CRÉDITO
              ════════════════════════════════════════ */}
          {factura.notasCredito && factura.notasCredito.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: '#E65100' }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                Notas de Crédito
              </h3>
              <div className="space-y-2">
                {factura.notasCredito.map((nc) => (
                  <div key={nc.id} className="flex justify-between items-center text-sm rounded-lg px-4 py-3 border" style={{ backgroundColor: '#FFF3E0', borderColor: '#FFE0B2' }}>
                    <div>
                      <span className="font-medium text-gray-900">{nc.numero}</span>
                      <span className="text-gray-500 ml-2 text-xs">{nc.motivo}</span>
                    </div>
                    <span className="font-bold" style={{ color: '#E65100' }}>-{formatCurrency(Number(nc.monto))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════
              NOTAS LEGALES — (como en el PDF)
              ════════════════════════════════════════ */}
          <div className="border-t border-gray-200 pt-4 mt-6">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: BRAND.green }}>
              Notas
            </h3>
            <ul className="text-xs text-gray-500 space-y-1">

              <li>• Pago por adelantado o según acuerdo con el cliente.</li>
              <li>• Cualquier reclamación debe realizarse dentro de los 3 días hábiles siguientes.</li>
              <li>• Conserve este documento como comprobante de su compra.</li>
            </ul>
            <p className="text-center text-xs mt-4" style={{ color: BRAND.brown }}>
              Gracias por su compra — {empresa.nombre}
            </p>
          </div>

        </div>
      </div>
      {corrigiendo?.corregir && (
        <CorregirModal
          titulo={`Corregir pago de ${corrigiendo.metodo.charAt(0) + corrigiendo.metodo.slice(1).toLowerCase()} · ${formatCurrency(corrigiendo.monto)}`}
          contexto={<>Pago #{corrigiendo.numero} · {formatFechaHora(corrigiendo.fecha)} · Queda por revertir {formatCurrency(corrigiendo.corregir.disponible)}</>}
          endpoint={corrigiendo.corregir.via === 'ABONO' ? `/api/cartera/abonos/${corrigiendo.corregir.id}/corregir` : `/api/pagos/${corrigiendo.corregir.id}/corregir`}
          montoMaximo={corrigiendo.corregir.disponible}
          queNoSeBorra={corrigiendo.origen === 'PAGO' ? 'el pago' : 'el abono'}
          factura={{ total, montoPagado: pagado, saldo }}
          testid="corregir-pago-modal"
          onClose={() => setCorrigiendo(null)}
          onDone={() => { setCorrigiendo(null); onReintentarPagos?.() }}
        />
      )}
    </div>
  )
}
