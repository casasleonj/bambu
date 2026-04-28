'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Cliente {
  id: string
  nombre: string
  telefono: string
  direccion?: string
  precioAguaPref: number
}

type ProductoId = 'agua19L' | 'hielo' | 'botellonFabrica' | 'botellonDomicilio' | 'bolsaAgua' | 'bolsaHielo'

interface ProductosPedido {
  agua19L: number
  hielo: number
  botellon: number
  bolsaAgua: number
  bolsaHielo: number
}

interface PagoPedido {
  metodo: string
  monto: number
}

interface PedidoFormData {
  clienteId: string
  productos: ProductosPedido
  pagos: PagoPedido[]
  obs: string
  total: number
}

interface PedidoFormProps {
  onSubmit?: (pedido: PedidoFormData) => void
  clientes?: Cliente[]
  precios?: Record<string, number>
}

const productoInfo: Record<ProductoId, { nombre: string; unidad: string; emoji: string; precioKey: string }> = {
  agua19L: { nombre: 'Agua 19L', unidad: 'botellones', emoji: '💧', precioKey: 'AGUA_GALON' },
  hielo: { nombre: 'Hielo 5kg', unidad: 'kg', emoji: '🧊', precioKey: 'HIELO_5KG' },
  botellonFabrica: { nombre: 'Botellón Fábrica', unidad: 'unid.', emoji: '🏭', precioKey: 'BOTELLON_FABRICA' },
  botellonDomicilio: { nombre: 'Botellón Domicilio', unidad: 'unid.', emoji: '🚚', precioKey: 'BOTELLON_DOMICILIO' },
  bolsaAgua: { nombre: 'Bolsa Agua', unidad: 'bolsas', emoji: '💧', precioKey: 'BOLSA_AGUA' },
  bolsaHielo: { nombre: 'Bolsa Hielo', unidad: 'bolsas', emoji: '🧊', precioKey: 'BOLSA_HIELO' },
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
  const [productos, setProductos] = useState<Record<ProductoId, number>>({
    agua19L: 0,
    hielo: 0,
    botellonFabrica: 0,
    botellonDomicilio: 0,
    bolsaAgua: 0,
    bolsaHielo: 0,
  })
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

  const getPrecio = (productoId: ProductoId): number => {
    const info = productoInfo[productoId]
    if (productoId === 'agua19L' && clienteSeleccionado?.precioAguaPref) {
      return clienteSeleccionado.precioAguaPref
    }
    // Fallback defaults if no prices configured in DB yet
    const defaults: Record<string, number> = {
      'AGUA_GALON': 6500,
      'HIELO_5KG': 8000,
      'BOTELLON_FABRICA': 7500,
      'BOTELLON_DOMICILIO': 10000,
      'BOLSA_AGUA': 2500,
      'BOLSA_HIELO': 3000,
    }
    return precios[info.precioKey] || defaults[info.precioKey] || 0
  }

  const calcularTotal = (): number => {
    return Object.entries(productos).reduce((total, [prod, cant]) => {
      return total + cant * getPrecio(prod as ProductoId)
    }, 0)
  }

  const totalPagado = pagos.reduce((sum, p) => sum + (p.monto || 0), 0)
  const total = calcularTotal()
  const saldoPendiente = total - totalPagado

  const handleCantidadChange = (productoId: ProductoId, value: string) => {
    const cant = parseInt(value) || 0
    setProductos((prev) => ({ ...prev, [productoId]: cant }))
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

    const pedido = {
      clienteId: clienteSeleccionado.id,
      productos: {
        agua19L: productos.agua19L,
        hielo: productos.hielo,
        botellon: productos.botellonFabrica + productos.botellonDomicilio,
        bolsaAgua: productos.bolsaAgua,
        bolsaHielo: productos.bolsaHielo,
      },
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
          <CardTitle className="text-lg">👤 Cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!clienteSeleccionado ? (
            <>
              <div>
                <Label>Buscar Cliente</Label>
                <Input
                  placeholder="Buscar por nombre o teléfono..."
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
                  {clienteSeleccionado.telefono} • Precio agua: ${clienteSeleccionado.precioAguaPref.toLocaleString()}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setClienteSeleccionado(null)}
              >
                ✕
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">📦 Productos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(Object.keys(productoInfo) as ProductoId[]).map((prodId) => {
            const info = productoInfo[prodId]
            const precio = getPrecio(prodId)
            return (
              <div key={prodId} className="flex items-center gap-3">
                <span className="text-xl">{info.emoji}</span>
                <div className="flex-1">
                  <div className="font-medium">{info.nombre}</div>
                  <div className="text-xs text-muted-foreground">
                    ${precio.toLocaleString()} / {info.unidad}
                  </div>
                </div>
                <Input
                  type="number"
                  min="0"
                  value={productos[prodId] || ''}
                  onChange={(e) => handleCantidadChange(prodId, e.target.value)}
                  className="w-20"
                  placeholder="0"
                />
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
          <CardTitle className="text-lg">💳 Pagos</CardTitle>
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
                  🗑️
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
          <CardTitle className="text-lg">📝 Observaciones</CardTitle>
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
        💵 Crear Pedido (${total.toLocaleString()})
      </Button>
    </form>
  )
}
