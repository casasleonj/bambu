'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Cliente {
  id: string
  nombre: string
  telefono: string
  direccion?: string
  precioAguaPref: number
}

type ProductoId = 'agua19L' | 'hielo' | 'botellon' | 'bolsaAgua' | 'bolsaHielo'

interface PedidoFormProps {
  onSubmit?: (pedido: any) => void
  clientes?: Cliente[]
}

const productoInfo: Record<ProductoId, { nombre: string; unidad: string; emoji: string }> = {
  agua19L: { nombre: 'Agua 19L', unidad: 'botellones', emoji: '💧' },
  hielo: { nombre: 'Hielo', unidad: 'kg', emoji: '🧊' },
  botellon: { nombre: 'Botellón', unidad: 'unid.', emoji: '🫙' },
  bolsaAgua: { nombre: 'Bolsa Agua', unidad: 'bolsas', emoji: '💧' },
  bolsaHielo: { nombre: 'Bolsa Hielo', unidad: 'bolsas', emoji: '🧊' },
}

const metodosPago = [
  { id: 'efectivo', nombre: 'Efectivo' },
  { id: 'transferencia', nombre: 'Transferencia' },
  { id: 'tarjeta', nombre: 'Tarjeta' },
  { id: 'credito', nombre: 'Crédito' },
]

const PRECIOS_DEFAULT = {
  agua19L: 12000,
  hielo: 5000,
  botellon: 5000,
  bolsaAgua: 5000,
  bolsaHielo: 5000,
}

export function PedidoForm({ onSubmit, clientes = [] }: PedidoFormProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [showNuevoCliente, setShowNuevoCliente] = useState(false)
  const [productos, setProductos] = useState<Record<ProductoId, number>>({
    agua19L: 0,
    hielo: 0,
    botellon: 0,
    bolsaAgua: 0,
    bolsaHielo: 0,
  })
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [observaciones, setObservaciones] = useState('')
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre: '',
    telefono: '',
    direccion: '',
    precioAguaPref: 12000,
  })

  const filteredClientes = searchTerm
    ? clientes.filter((c) =>
        c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.telefono.includes(searchTerm)
      )
    : clientes.slice(0, 5)

  const getPrecio = (productoId: ProductoId): number => {
    if (productoId === 'agua19L' && clienteSeleccionado?.precioAguaPref) {
      return clienteSeleccionado.precioAguaPref
    }
    return PRECIOS_DEFAULT[productoId]
  }

  const calcularTotal = (): number => {
    return Object.entries(productos).reduce((total, [prod, cant]) => {
      return total + cant * getPrecio(prod as ProductoId)
    }, 0)
  }

  const handleCantidadChange = (productoId: ProductoId, value: string) => {
    const cant = parseInt(value) || 0
    setProductos((prev) => ({ ...prev, [productoId]: cant }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!clienteSeleccionado && !showNuevoCliente) {
      alert('Selecciona un cliente o crea uno nuevo')
      return
    }
    const pedido = {
      clienteId: clienteSeleccionado?.id || 'nuevo',
      clienteData: clienteSeleccionado || nuevoCliente,
      cantidades: productos,
      precios: {
        agua19L: getPrecio('agua19L'),
        hielo: getPrecio('hielo'),
        botellon: getPrecio('botellon'),
        bolsaAgua: getPrecio('bolsaAgua'),
        bolsaHielo: getPrecio('bolsaHielo'),
      },
      metodoPago,
      observaciones,
      total: calcularTotal(),
    }
    onSubmit?.(pedido)
  }

  const handleSelectCliente = (cliente: Cliente) => {
    setClienteSeleccionado(cliente)
    setSearchTerm('')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">👤 Cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!showNuevoCliente ? (
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
                      onClick={() => handleSelectCliente(cliente)}
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

              {clienteSeleccionado && (
                <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                  <div>
                    <p className="font-medium">{clienteSeleccionado.nombre}</p>
                    <p className="text-sm text-muted-foreground">
                      {clienteSeleccionado.telefono} • ${clienteSeleccionado.precioAguaPref}
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

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setShowNuevoCliente(true)}
              >
                ➕ Nuevo Cliente
              </Button>
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={nuevoCliente.nombre}
                  onChange={(e) =>
                    setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })
                  }
                  placeholder="Nombre del cliente"
                />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={nuevoCliente.telefono}
                  onChange={(e) =>
                    setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })
                  }
                  placeholder="Teléfono"
                />
              </div>
              <div>
                <Label>Dirección</Label>
                <Input
                  value={nuevoCliente.direccion}
                  onChange={(e) =>
                    setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })
                  }
                  placeholder="Dirección"
                />
              </div>
              <div>
                <Label>Precio Agua</Label>
                <Input
                  type="number"
                  value={nuevoCliente.precioAguaPref}
                  onChange={(e) =>
                    setNuevoCliente({
                      ...nuevoCliente,
                      precioAguaPref: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNuevoCliente(false)}
                >
                  Cancelar
                </Button>
              </div>
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
            return (
              <div key={prodId} className="flex items-center gap-3">
                <span className="text-xl">{info.emoji}</span>
                <Label className="flex-1">{info.nombre}</Label>
                <Input
                  type="number"
                  min="0"
                  value={productos[prodId] || ''}
                  onChange={(e) => handleCantidadChange(prodId, e.target.value)}
                  className="w-20"
                  placeholder="0"
                />
                <span className="text-sm text-muted-foreground w-20 text-right">
                  ${getPrecio(prodId).toLocaleString()}
                </span>
              </div>
            )
          })}

          <div className="flex justify-between items-center pt-3 border-t">
            <span className="font-medium">Total:</span>
            <span className="text-xl font-bold">
              ${calcularTotal().toLocaleString()}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">💳 Pago</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Método de Pago</Label>
            <Select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
              {metodosPago.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Observaciones</Label>
            <Input
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Notas adicionales..."
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" size="lg">
        💵 Crear Pedido (${calcularTotal().toLocaleString()})
      </Button>
    </form>
  )
}