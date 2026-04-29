'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DEFAULT_PRICES, PRODUCTO_INFO } from '@/lib/prices'

interface Cliente {
  id: string
  nombre: string
  telefono: string
  direccion?: string
  preciosEspeciales?: string
}

type ProductoId = 'pacaAgua' | 'pacaHielo' | 'botellonFab' | 'botellonDom' | 'bolsaAgua' | 'bolsaHielo'

interface PagoPedido {
  metodo: string
  monto: number
}

interface PedidoFormData {
  clienteId: string
  canal: string
  productos: {
    pacaAgua: number
    pacaHielo: number
    botellonFab: number
    botellonDom: number
    bolsaAgua: number
    bolsaHielo: number
  }
  preciosManuales: Record<string, number>
  pagos: PagoPedido[]
  obs: string
  total: number
}

interface PedidoFormProps {
  onSubmit?: (pedido: PedidoFormData) => void
  clientes?: Cliente[]
  precios?: Record<string, number>
}



const METODOS_PAGO = [
  { id: 'EFECTIVO', nombre: 'Efectivo' },
  { id: 'TRANSFERENCIA', nombre: 'Transferencia' },
  { id: 'NEQUI', nombre: 'Nequi' },
  { id: 'DAVIPLATA', nombre: 'Daviplata' },
  { id: 'BONO', nombre: 'Bono' },
]

export function PedidoForm({ onSubmit, clientes = [], precios = {} }: PedidoFormProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  // Nuevo Pedido siempre es DOMICILIO (Venta Rápida cubre PUNTO/MOSTRADOR)
  const canal = 'DOMICILIO'
  const [productos, setProductos] = useState<Record<ProductoId, number>>({
    pacaAgua: 0,
    pacaHielo: 0,
    botellonFab: 0,
    botellonDom: 0,
    bolsaAgua: 0,
    bolsaHielo: 0,
  })
  const [preciosResueltos, setPreciosResueltos] = useState<Record<string, number>>({})
  const [preciosManuales, setPreciosManuales] = useState<Record<string, number>>({})
  const [pagos, setPagos] = useState<{ metodo: string; monto: number }[]>([
    { metodo: 'EFECTIVO', monto: 0 },
  ])
  const [observaciones, setObservaciones] = useState('')

  const filteredClientes = searchTerm
    ? clientes.filter((c) =>
        c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.telefono.includes(searchTerm)
      )
    : clientes.slice(0, 5)

  const [preciosEditando, setPreciosEditando] = useState<Record<string, boolean>>({})

  const resolverPrecios = useCallback(async (
    prods: Record<ProductoId, number>,
    canalVal: string,
    clienteId?: string,
  ) => {
    const items = (Object.keys(PRODUCTO_INFO) as ProductoId[])
      .filter(id => prods[id] > 0)
      .map(id => ({
        codigo: PRODUCTO_INFO[id].codigo,
        cantidad: prods[id],
      }))

    if (items.length === 0) {
      setPreciosResueltos({})
      return
    }

    try {
      const res = await fetch('/api/precios/resolver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, canal: canalVal, clienteId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.precios) {
          const nuevos: Record<string, number> = {}
          for (const [codigo, info] of Object.entries(data.precios)) {
            nuevos[codigo] = (info as any).precio
          }
          setPreciosResueltos(nuevos)
        }
      }
    } catch (error) {
      // Fall back to local defaults on network error
    }
  }, [])

  const getPrecio = (productoId: ProductoId): number => {
    const info = PRODUCTO_INFO[productoId]
    // Use resolved price from API if available
    if (preciosResueltos[info.codigo] && preciosResueltos[info.codigo] > 0) {
      return preciosResueltos[info.codigo]
    }
    // Fallback defaults if no prices resolved
    return precios[info.precioKey] || DEFAULT_PRICES[info.precioKey] || 0
  }

  function getEffectivePrice(codigo: string): number {
    if (preciosManuales[codigo] !== undefined) return preciosManuales[codigo]
    if (preciosResueltos[codigo]) return preciosResueltos[codigo]
    return getPrecio(Object.keys(PRODUCTO_INFO).find(k => PRODUCTO_INFO[k as ProductoId].codigo === codigo) as ProductoId)
  }

  const calcularTotal = (): number => {
    return Object.entries(productos).reduce((total, [prod, cant]) => {
      if (cant <= 0) return total
      const info = PRODUCTO_INFO[prod as ProductoId]
      return total + cant * getEffectivePrice(info.codigo)
    }, 0)
  }

  const totalPagado = pagos.reduce((sum, p) => sum + (p.monto || 0), 0)
  const total = calcularTotal()
  const saldoPendiente = total - totalPagado

  const handleCantidadChange = (productoId: ProductoId, value: string) => {
    const cant = parseInt(value) || 0
    const newProds = { ...productos, [productoId]: cant }
    setProductos(newProds)
    resolverPrecios(newProds, canal, clienteSeleccionado?.id)
  }

  const handlePagoChange = (idx: number, field: 'metodo' | 'monto', value: string) => {
    setPagos((prev) => {
      const nuevos = [...prev]
      if (field === 'monto') {
        nuevos[idx].monto = parseFloat(value) || 0
      } else {
        nuevos[idx].metodo = value
      }
      return nuevos
    })
  }

  const agregarPago = () => {
    setPagos((prev) => [...prev, { metodo: 'EFECTIVO', monto: 0 }])
  }

  const eliminarPago = (idx: number) => {
    setPagos((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!clienteSeleccionado) {
      toast.error('Selecciona un cliente')
      return
    }
    if (total <= 0) {
      toast.error('El pedido debe tener al menos un producto')
      return
    }

    const pedido: PedidoFormData = {
      clienteId: clienteSeleccionado.id,
      canal,
      productos: {
        pacaAgua: productos.pacaAgua,
        pacaHielo: productos.pacaHielo,
        botellonFab: productos.botellonFab,
        botellonDom: productos.botellonDom,
        bolsaAgua: productos.bolsaAgua,
        bolsaHielo: productos.bolsaHielo,
      },
      preciosManuales,
      pagos: pagos.filter((p) => p.monto > 0),
      obs: observaciones,
      total,
    }
    onSubmit?.(pedido)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!clienteSeleccionado ? (
            <>
              <div>
                <Label>Buscar Cliente</Label>
                <Input
                  placeholder="Buscar por nombre o telefono..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {searchTerm && filteredClientes.length > 0 && (
                <div className="border rounded-md max-h-40 overflow-y-auto">
                  {filteredClientes.map((cliente) => (
                    <button
                      key={cliente.id}
                      type="button"
                      onClick={() => {
                        setClienteSeleccionado(cliente)
                        setSearchTerm('')
                        resolverPrecios(productos, canal, cliente.id)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-accent flex justify-between items-center"
                    >
                      <span>{cliente.nombre}</span>
                      <span className="text-sm text-muted-foreground">
                        {cliente.telefono}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <div>
                <p className="font-medium">{clienteSeleccionado.nombre}</p>
                <p className="text-sm text-muted-foreground">
                  {clienteSeleccionado.telefono}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setClienteSeleccionado(null)}
              >
                X
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Productos</CardTitle>
          <p className="text-xs text-gray-500">Los precios se resuelven automáticamente. Usa ✏️ para ajustar si es necesario.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {(Object.keys(PRODUCTO_INFO) as ProductoId[]).map((prodId) => {
            const info = PRODUCTO_INFO[prodId]
            const precioBase = getPrecio(prodId)
            const precioActual = getEffectivePrice(info.codigo)
            const estaEditando = preciosEditando[info.codigo]
            const cantidad = productos[prodId] || 0
            return (
              <div key={prodId} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{info.nombre}</div>
                  <div className="text-xs text-gray-400">{info.unidad}</div>
                </div>
                {/* Price display with optional edit */}
                <div className="flex items-center gap-1.5">
                  {estaEditando ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">$</span>
                      <input
                        type="number"
                        min="0"
                        autoFocus
                        defaultValue={precioActual}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          if (val !== precioBase) {
                            setPreciosManuales(prev => ({ ...prev, [info.codigo]: val }))
                          } else {
                            setPreciosManuales(prev => {
                              const next = { ...prev }
                              delete next[info.codigo]
                              return next
                            })
                          }
                          setPreciosEditando(prev => ({ ...prev, [info.codigo]: false }))
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur()
                          }
                        }}
                        className="w-20 border rounded px-2 py-1 text-sm text-right"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-600">
                        ${precioActual.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreciosEditando(prev => ({ ...prev, [info.codigo]: true }))}
                        className="text-gray-400 hover:text-blue-600 transition p-0.5"
                        title="Editar precio"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCantidadChange(prodId, String(Math.max(0, cantidad - 1)))}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
                    disabled={cantidad <= 0}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                  </button>
                  <Input
                    type="number"
                    min="0"
                    value={cantidad || ''}
                    onChange={(e) => handleCantidadChange(prodId, e.target.value)}
                    className="w-14 text-center p-1 h-8 text-sm"
                    placeholder="0"
                  />
                  <button
                    type="button"
                    onClick={() => handleCantidadChange(prodId, String(cantidad + 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-100 hover:bg-blue-200 text-blue-600 transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  </button>
                </div>
                {cantidad > 0 && (
                  <span className="text-sm font-semibold text-gray-700 w-20 text-right">
                    ${(cantidad * precioActual).toLocaleString()}
                  </span>
                )}
              </div>
            )
          })}

          <div className="flex justify-between items-center pt-3 border-t">
            <span className="font-medium">Total Pedido:</span>
            <span className="text-xl font-bold">${total.toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Pagos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pagos.map((pago, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <select
                value={pago.metodo}
                onChange={(e) => handlePagoChange(idx, 'metodo', e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              >
                {METODOS_PAGO.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                min="0"
                value={pago.monto || ''}
                onChange={(e) => handlePagoChange(idx, 'monto', e.target.value)}
                className="w-28"
                placeholder="Monto"
              />
              {pagos.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => eliminarPago(idx)}
                >
                  X
                </Button>
              )}
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={agregarPago}>
            + Agregar pago
          </Button>

          <div className="flex justify-between items-center pt-2 border-t text-sm">
            <span>Total pagado:</span>
            <span className="font-bold text-green-600">${totalPagado.toLocaleString()}</span>
          </div>
          {saldoPendiente > 0 && (
            <div className="flex justify-between items-center text-sm text-red-600">
              <span>Saldo pendiente:</span>
              <span className="font-bold">${saldoPendiente.toLocaleString()}</span>
            </div>
          )}
          {saldoPendiente < 0 && (
            <div className="flex justify-between items-center text-sm text-blue-600">
              <span>Cambio / Sobrepago:</span>
              <span className="font-bold">${Math.abs(saldoPendiente).toLocaleString()}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Observaciones</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Notas adicionales..."
          />
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" size="lg">
        Crear Pedido (${total.toLocaleString()})
      </Button>
    </form>
  )
}
