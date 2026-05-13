'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import type { Factura, EmpresaConfig } from './types'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
}

interface FacturaDetailProps {
  factura: Factura
  empresaConfig: EmpresaConfig
  onRegistrarAbono?: () => void
}

export function FacturaDetail({ factura, empresaConfig, onRegistrarAbono }: FacturaDetailProps) {
  const [printReady, setPrintReady] = useState(false)

  useEffect(() => {
    setPrintReady(true)
  }, [])

  const items = factura.pedido?.items || []

  const empresa = {
    nombre: factura.empresaNombre || empresaConfig.nombre,
    nit: factura.empresaNit || empresaConfig.nit,
    direccion: factura.empresaDireccion || empresaConfig.direccion,
    telefono: factura.empresaTelefono || empresaConfig.telefono,
    email: factura.empresaEmail || empresaConfig.email,
  }

  const estadoColor = (estado: string) => {
    switch (estado) {
      case 'PAGADA': return 'text-green-700 bg-green-100'
      case 'EMITIDA': return 'text-yellow-700 bg-yellow-100'
      case 'ANULADA': return 'text-red-700 bg-red-100'
      default: return 'text-gray-700 bg-gray-100'
    }
  }

  const handlePrint = () => {
    window.print()
  }

  if (!printReady) return null

  return (
    <div className="factura-print-container" id="factura-print">
      {/* Botones de acción — se ocultan al imprimir */}
      <div className="no-print flex justify-end gap-2 mb-4">
        <Button onClick={handlePrint} variant="outline" size="sm">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Imprimir
        </Button>
        {Number(factura.saldo) > 0 && factura.estado !== 'ANULADA' && onRegistrarAbono && (
          <Button onClick={onRegistrarAbono} size="sm">
            Registrar Abono
          </Button>
        )}
      </div>

      {/* Contenido de la factura */}
      <div className="factura-content bg-white border rounded-lg p-6 md:p-8 max-w-3xl mx-auto">
        {/* Encabezado empresa */}
        <div className="border-b pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{empresa.nombre}</h1>
              <p className="text-sm text-gray-600 mt-1">NIT: {empresa.nit}</p>
              <p className="text-sm text-gray-600">{empresa.direccion}</p>
              <p className="text-sm text-gray-600">Tel: {empresa.telefono}</p>
              <p className="text-sm text-gray-600">{empresa.email}</p>
            </div>
            <div className="text-right">
              <h2 className="text-lg font-semibold text-gray-900">FACTURA DE VENTA</h2>
              <p className="text-xl font-bold text-gray-900 mt-1">#{factura.numero}</p>
              <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold ${estadoColor(factura.estado)}`}>
                {factura.estado}
              </span>
            </div>
          </div>
        </div>

        {/* Info factura + cliente */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Información</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Fecha de emisión:</span>
                <span className="font-medium">{formatDate(factura.fecha)}</span>
              </div>
              {factura.pedido && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Pedido:</span>
                  <span className="font-medium">#{factura.pedido.numero}</span>
                </div>
              )}
              {factura.createdBy && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Creado por:</span>
                  <span className="font-medium">{factura.createdBy.username}</span>
                </div>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cliente</h3>
            <div className="text-sm">
              <p className="font-medium text-gray-900">{factura.cliente?.nombre || 'N/A'}</p>
              {factura.cliente?.direccion && (
                <p className="text-gray-600">{factura.cliente.direccion}</p>
              )}
              {factura.cliente?.barrio && (
                <p className="text-gray-600">{factura.cliente.barrio}</p>
              )}
              {factura.cliente?.telefono && (
                <p className="text-gray-600">Tel: {factura.cliente.telefono}</p>
              )}
            </div>
          </div>
        </div>

        {/* Tabla de productos */}
        {items.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Productos</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-semibold bg-gray-50">Producto</TableHead>
                  <TableHead className="text-xs font-semibold bg-gray-50 text-right">Cant.</TableHead>
                  <TableHead className="text-xs font-semibold bg-gray-50 text-right">Precio Unit.</TableHead>
                  <TableHead className="text-xs font-semibold bg-gray-50 text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const meta = getProductoIconConfig(item.producto)
                  const Icon = meta.Icon
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="py-2">
                        <Icon size={18} className="inline-block mr-2 align-text-bottom" />
                        <span className="text-sm font-medium">{meta.label}</span>
                      </TableCell>
                      <TableCell className="py-2 text-right text-sm">{item.cantPedido}</TableCell>
                      <TableCell className="py-2 text-right text-sm">{formatCurrency(Number(item.precio))}</TableCell>
                      <TableCell className="py-2 text-right text-sm font-medium">{formatCurrency(Number(item.subtotal))}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Totales */}
        <div className="border-t pt-4 mb-6">
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">{formatCurrency(Number(factura.subtotal || factura.total))}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>TOTAL:</span>
                <span>{formatCurrency(Number(factura.total))}</span>
              </div>
              {Number(factura.montoPagado || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-700">Pagado:</span>
                  <span className="font-medium text-green-700">{formatCurrency(Number(factura.montoPagado))}</span>
                </div>
              )}
              {Number(factura.saldo) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-red-700">Saldo pendiente:</span>
                  <span className="font-bold text-red-700">{formatCurrency(Number(factura.saldo))}</span>
                </div>
              )}
              {Number(factura.saldo) === 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-700 font-semibold">PAGADA COMPLETA</span>
                  <span className="text-green-700 font-semibold">✓</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Abonos */}
        {factura.abonos && factura.abonos.length > 0 && (
          <div className="border-t pt-4 mb-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Historial de Pagos</h3>
            <div className="space-y-2">
              {factura.abonos.map((abono, i) => (
                <div key={abono.id} className="flex justify-between items-center text-sm bg-gray-50 rounded px-3 py-2">
                  <div>
                    <span className="font-medium">#{i + 1}</span>
                    <span className="text-gray-600 ml-2">{formatDate(abono.fecha)}</span>
                    <span className="text-gray-500 ml-2 text-xs uppercase">{abono.metodoPago}</span>
                  </div>
                  <span className="font-semibold text-green-700">{formatCurrency(Number(abono.monto))}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notas de crédito */}
        {factura.notasCredito && factura.notasCredito.length > 0 && (
          <div className="border-t pt-4 mb-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Notas de Crédito</h3>
            <div className="space-y-2">
              {factura.notasCredito.map((nc) => (
                <div key={nc.id} className="flex justify-between items-center text-sm bg-orange-50 rounded px-3 py-2">
                  <div>
                    <span className="font-medium">{nc.numero}</span>
                    <span className="text-gray-600 ml-2">{nc.motivo}</span>
                  </div>
                  <span className="font-semibold text-orange-700">-{formatCurrency(Number(nc.monto))}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pie de página */}
        <div className="border-t pt-4 mt-6 text-center">
          <p className="text-xs text-gray-500">Gracias por su compra — {empresa.nombre}</p>
          <p className="text-xs text-gray-400 mt-1">Este documento es una representación de la factura #{factura.numero}</p>
        </div>
      </div>
    </div>
  )
}
